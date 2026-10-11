import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { periodRange, resolvePeriod, type ResolvedPeriod } from "@/lib/finance-period";
import type { getCurrentUser } from "@/lib/auth";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Lecture du Journal de caisse, partagée par l'affichage paginé (listFinancialTransactions,
// src/actions/finance.ts) et l'export PDF/Excel (src/app/api/finance/journal/export/route.ts) :
// un export reproduit exactement la sélection affichée, filtres et totaux compris.

// ADMIN (holding) en lecture seule, COORDINATOR en écriture — cf. src/actions/finance.ts.
export const FINANCE_READ_ROLES = ["ADMIN", "COORDINATOR"];

export interface JournalFilters {
  organizationId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: "INCOME" | "EXPENSE";
  category?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  // Décalage horaire du navigateur (Date.getTimezoneOffset) : les jours du filtre sont ceux de
  // l'utilisateur, cf. src/lib/finance-period.ts.
  tzOffsetMinutes?: number;
}

// Même résolution (jours valides, jamais de date future, bornes remises dans l'ordre) que le
// résumé de la page : le journal et les KPI parlent forcément de la même période.
export function resolveJournalPeriod(filters: JournalFilters): ResolvedPeriod {
  return resolvePeriod({
    preset: "custom",
    from: filters.dateFrom,
    to: filters.dateTo,
    tzOffsetMinutes: filters.tzOffsetMinutes,
  });
}

// `baseAnd` : toutes les conditions SAUF le type — réutilisées telles quelles pour calculer les
// totaux encaissé/dépensé indépendamment du filtre de type actif. `listWhere` : la sélection
// affichée (type compris).
export function buildJournalWhere(activeUser: CurrentUser, filters: JournalFilters) {
  const baseAnd: Prisma.FinancialTransactionWhereInput[] = [];

  if (activeUser.organization?.type === "HOLDING" && !filters.organizationId) {
    baseAnd.push({
      OR: [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ],
    });
  } else {
    const targetOrgId = filters.organizationId || activeUser.organizationId;
    if (targetOrgId) baseAnd.push({ organizationId: targetOrgId });
  }

  const { start: periodStart, end: periodEnd } = periodRange(resolveJournalPeriod(filters));
  if (periodStart) baseAnd.push({ createdAt: { gte: periodStart } });
  if (periodEnd) baseAnd.push({ createdAt: { lte: periodEnd } });
  if (filters.category && filters.category !== "ALL") {
    baseAnd.push({ category: filters.category as Prisma.FinancialTransactionWhereInput["category"] });
  }
  if (filters.minAmount != null && !Number.isNaN(Number(filters.minAmount))) {
    baseAnd.push({ amount: { gte: Number(filters.minAmount) } });
  }
  if (filters.maxAmount != null && !Number.isNaN(Number(filters.maxAmount))) {
    baseAnd.push({ amount: { lte: Number(filters.maxAmount) } });
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    baseAnd.push({
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        {
          patient: {
            user: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
        {
          recordedBy: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  const listWhere: Prisma.FinancialTransactionWhereInput = filters.type
    ? { AND: [...baseAnd, { type: filters.type }] }
    : { AND: baseAnd };
  return { baseAnd, listWhere };
}

export const JOURNAL_TRANSACTION_INCLUDE = {
  recordedBy: { select: { firstName: true, lastName: true } },
  patient: { include: { user: { select: { firstName: true, lastName: true } } } },
  pharmacyItem: { select: { name: true, dosage: true } },
  // Pour le badge "Partiel/Non payé" du journal : une transaction dont la facture liée n'est pas
  // encore PAID correspond à un règlement partiel/échelonné.
  pendingInvoice: { select: { status: true, createdAt: true } },
} satisfies Prisma.FinancialTransactionInclude;

// Totaux encaissé/dépensé sur l'ensemble filtré complet (pas seulement une page), hors filtre de
// type.
export async function getJournalTotals(baseAnd: Prisma.FinancialTransactionWhereInput[]) {
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.financialTransaction.aggregate({ where: { AND: [...baseAnd, { type: "INCOME" }] }, _sum: { amount: true } }),
    prisma.financialTransaction.aggregate({ where: { AND: [...baseAnd, { type: "EXPENSE" }] }, _sum: { amount: true } }),
  ]);
  return { income: incomeAgg._sum.amount || 0, expenses: expenseAgg._sum.amount || 0 };
}

// Attache le total facturé et le reste dû à chaque transaction liée à une facture (impression
// depuis le Journal, cf. finance-journal.tsx → InvoiceModal) : sans ça, seul le montant de CETTE
// transaction précise est connu — sur la dernière tranche d'un paiement échelonné, ça ne
// correspond ni au total réel de la facture ni à ce qui est encore dû si elle n'est pas
// intégralement soldée. `invoiceTotalAmount` se déduit des lignes déjà présentes sur la
// transaction (le panier complet de la facture, cf. payPendingInvoice) ; `amountPaid` cumule tous
// les règlements liés à la même facture.
export async function attachInvoiceTotals<
  T extends { pendingInvoiceId: string | null; items: Prisma.JsonValue; amount: number; pendingInvoice: { status: string } | null },
>(transactions: T[]) {
  const linkedInvoiceIds = [...new Set(transactions.map((t) => t.pendingInvoiceId).filter((id): id is string => !!id))];
  const paidByInvoice = new Map<string, number>();
  if (linkedInvoiceIds.length > 0) {
    const paidAgg = await prisma.financialTransaction.groupBy({
      by: ["pendingInvoiceId"],
      where: { pendingInvoiceId: { in: linkedInvoiceIds } },
      _sum: { amount: true },
    });
    for (const row of paidAgg) {
      if (row.pendingInvoiceId) paidByInvoice.set(row.pendingInvoiceId, row._sum.amount || 0);
    }
  }
  return transactions.map((t) => {
    if (!t.pendingInvoiceId) return t;
    const items = Array.isArray(t.items) ? (t.items as { amount?: number | string }[]) : [];
    const invoiceTotalAmount = items.reduce((sum, it) => sum + Number(it?.amount || 0), 0);
    const amountPaid = paidByInvoice.get(t.pendingInvoiceId) ?? t.amount;
    return {
      ...t,
      invoiceTotalAmount,
      remainingDue: Math.max(0, invoiceTotalAmount - amountPaid),
      status: t.pendingInvoice?.status,
    };
  });
}
