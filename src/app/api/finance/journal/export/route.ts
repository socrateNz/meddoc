import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { canAccessOrganization } from "@/lib/org-scope";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { logAuditAction } from "@/middlewares/auditLogger";
import { formatPeriodLabel } from "@/lib/finance-period";
import {
  attachInvoiceTotals,
  buildJournalWhere,
  FINANCE_READ_ROLES,
  getJournalTotals,
  JOURNAL_TRANSACTION_INCLUDE,
  resolveJournalPeriod,
} from "@/lib/finance-journal-query";
import { buildJournalExportRows, describeJournalFilters, journalExportFileName } from "@/lib/finance-journal-export";
import { JOURNAL_EXPORT_CONTENT_TYPES, renderJournalExport } from "@/lib/finance-journal-render";

// Export du Journal de caisse en UNE requête : filtres en paramètres, lecture complète, totaux et
// génération du PDF/Excel côté serveur — le navigateur ne reçoit que le fichier. Seule exception
// assumée au plafond MAX_PAGE_SIZE (src/lib/pagination.ts), bornée par EXPORT_MAX_ROWS.
export const maxDuration = 60;

// Au-delà, l'utilisateur doit resserrer la période ou les filtres plutôt que de générer un
// document de plusieurs centaines de pages en une seule fonction serverless.
const EXPORT_MAX_ROWS = 5000;

const optionalNumber = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().finite().optional());

const querySchema = z.object({
  format: z.enum(["pdf", "xlsx"]),
  organizationId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  category: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  minAmount: optionalNumber,
  maxAmount: optionalNumber,
  tzOffsetMinutes: optionalNumber,
});

export async function GET(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 10, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(FINANCE_READ_ROLES);
    if ("response" in auth) return auth.response;
    const user = auth.user;

    const params = Object.fromEntries(
      [...new URL(req.url).searchParams.entries()].filter(([, value]) => value !== "")
    );
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Paramètres d'export invalides." }, { status: 400 });
    }
    const { format, ...filters } = parsed.data;

    // Une clinique précise ne peut être exportée que par son propre personnel ou par la holding
    // dont elle dépend.
    let organization = user.organization as { name?: string | null; logoUrl?: string | null } | null;
    if (filters.organizationId && filters.organizationId !== user.organizationId) {
      if (!(await canAccessOrganization(user, filters.organizationId))) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }
      organization = await prisma.organization.findUnique({
        where: { id: filters.organizationId },
        select: { name: true, logoUrl: true },
      });
    }

    const { baseAnd, listWhere } = buildJournalWhere(user, filters);
    const [transactions, totals] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: listWhere,
        include: JOURNAL_TRANSACTION_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: EXPORT_MAX_ROWS + 1,
      }),
      getJournalTotals(baseAnd),
    ]);
    if (transactions.length > EXPORT_MAX_ROWS) {
      return NextResponse.json(
        { error: `Plus de ${EXPORT_MAX_ROWS.toLocaleString("fr-FR")} mouvements : réduisez la période ou ajoutez un filtre avant d'exporter.` },
        { status: 422 }
      );
    }

    const rows = buildJournalExportRows(await attachInvoiceTotals(transactions));
    const period = resolveJournalPeriod(filters);
    const buffer = await renderJournalExport(format, {
      rows,
      totalIncome: totals.income,
      totalExpenses: totals.expenses,
      periodLabel: formatPeriodLabel(period),
      filters: describeJournalFilters(filters),
      generatedAt: new Date(),
      tzOffsetMinutes: filters.tzOffsetMinutes,
      organizationName: organization?.name || undefined,
      organizationLogoUrl: organization?.logoUrl,
    });

    await logAuditAction(user.id, "EXPORT_FINANCE_JOURNAL", "FinancialTransaction", "bulk", {
      format,
      count: rows.length,
      organizationId: filters.organizationId || user.organizationId,
      from: period.from,
      to: period.to,
    });

    const fileName = journalExportFileName(period, format);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": JOURNAL_EXPORT_CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'export du journal de caisse:", error);
    return NextResponse.json({ error: "Impossible d'exporter le journal de caisse." }, { status: 500 });
  }
}
