"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertOrganizationAccess } from "@/lib/org-scope";
import { assertOrganizationModule } from "@/lib/modules-server";
import { toErrorMessage } from "@/lib/utils";
import { logAuditAction } from "@/middlewares/auditLogger";
import { loadReportLines } from "@/lib/accounting/engine";
import { balanceSheet, dashboard, incomeStatement, integrityChecks, ledger, trialBalance, vatReturn, type Period } from "@/lib/accounting/reports";
import { reclassifyExpense, syncAccounting } from "@/lib/accounting/postings";
import { DATE_PATTERN } from "@/lib/accounting/rules";
import { clinicDateKey } from "@/lib/clinic-day";

// Comptabilité d'une clinique : le comptable et le coordinateur la tiennent, l'administrateur de
// la holding la consulte.
const ACCOUNTING_READ_ROLES = ["COMPTABLE", "COORDINATOR", "ADMIN", "SUPER_ADMIN"];
const ACCOUNTING_WRITE_ROLES = ["COMPTABLE", "COORDINATOR"];

async function authorize(organizationId: string, write = false) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (!(write ? ACCOUNTING_WRITE_ROLES : ACCOUNTING_READ_ROLES).includes(user.role)) {
    throw new Error("Non autorisé. Réservé au comptable et au coordinateur de la clinique.");
  }
  await assertOrganizationAccess(user, organizationId);
  await assertOrganizationModule(organizationId, "COMPTABILITE");
  return user;
}

// Période par défaut : du 1er janvier à aujourd'hui (jours civils de Douala).
function resolve(period?: Partial<Period>): Period {
  const today = clinicDateKey(new Date());
  const to = period?.to && DATE_PATTERN.test(period.to) ? period.to : today;
  const from = period?.from && DATE_PATTERN.test(period.from) ? period.from : `${to.slice(0, 4)}-01-01`;
  return from <= to ? { from, to } : { from: to, to: from };
}

// Documents réglés sans écriture : règlements, dépenses de caisse et achats de stock (§ 9, n° 5).
async function countMissingEntries(organizationId: string) {
  const [transactions, entries] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: { organizationId, amount: { gt: 0 }, category: { in: ["SERVICE_FEE", "PHARMACY_SALE", "LAB_EXAM_FEE", "OTHER", "OPERATIONAL_EXPENSE", "PHARMACY_PURCHASE"] } },
      select: { id: true, category: true, type: true },
    }),
    prisma.accountingEntry.findMany({
      where: { organizationId, sourceType: { in: ["PAYMENT", "EXPENSE_PAYMENT", "STOCK_PURCHASE"] } },
      select: { sourceId: true },
    }),
  ]);
  const posted = new Set(entries.map((e) => e.sourceId));
  return transactions.filter((t) => !posted.has(t.id)).length;
}

export async function getAccountingOverview(organizationId: string, periodInput?: Partial<Period>) {
  try {
    await authorize(organizationId);
    const period = resolve(periodInput);
    const [lines, org, missingEntries] = await Promise.all([
      loadReportLines(organizationId, period.to),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, accountingLockedUntil: true } }),
      countMissingEntries(organizationId),
    ]);
    const checks = integrityChecks(lines);
    const sheet = balanceSheet(lines, period.to);
    const income = incomeStatement(lines, period);
    return {
      success: true as const,
      data: {
        period,
        clinicName: org?.name ?? "",
        lockedUntil: org?.accountingLockedUntil ?? null,
        dashboard: dashboard(lines, period),
        income,
        vat: vatReturn(lines, period),
        sheet: { totalAssets: sheet.totalAssets, totalLiabilities: sheet.totalLiabilities, balanced: sheet.balanced },
        checks: { ...checks, balanceSheetBalanced: sheet.balanced, missingEntries },
        entryCount: new Set(lines.map((l) => l.entryId)).size,
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Impossible de charger la comptabilité.") };
  }
}

export async function getAccountingJournal(organizationId: string, periodInput?: Partial<Period>, journal?: string) {
  try {
    await authorize(organizationId);
    const period = resolve(periodInput);
    const entries = await prisma.accountingEntry.findMany({
      where: {
        organizationId,
        entryDate: { gte: period.from, lte: period.to },
        ...(journal && journal !== "ALL" ? { journal } : {}),
      },
      include: { lines: true },
      orderBy: [{ entryDate: "desc" }, { number: "desc" }],
      take: 300,
    });
    const reversed = new Set(
      (await prisma.accountingEntry.findMany({ where: { organizationId, reversalOf: { in: entries.map((e) => e.id) } }, select: { reversalOf: true } })).map((e) => e.reversalOf)
    );
    return {
      success: true as const,
      data: {
        period,
        truncated: entries.length === 300,
        entries: entries.map((e) => ({
          id: e.id,
          number: e.number,
          journal: e.journal,
          entryDate: e.entryDate,
          label: e.label,
          reference: e.reference,
          sourceType: e.sourceType,
          reversed: reversed.has(e.id),
          isReversal: !!e.reversalOf,
          lines: e.lines.map((l) => ({ account: l.account, label: l.label, debit: Number(l.debit), credit: Number(l.credit) })),
        })),
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Impossible de charger le journal.") };
  }
}

export async function getAccountingTrialBalance(organizationId: string, periodInput?: Partial<Period>) {
  try {
    await authorize(organizationId);
    const period = resolve(periodInput);
    const lines = await loadReportLines(organizationId, period.to);
    return { success: true as const, data: { period, ...trialBalance(lines, period) } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Impossible de charger la balance.") };
  }
}

export async function getAccountingLedger(organizationId: string, account: string, periodInput?: Partial<Period>) {
  try {
    await authorize(organizationId);
    if (!/^[1-8][0-9]{0,11}$/.test(account)) throw new Error("Compte invalide.");
    const period = resolve(periodInput);
    const lines = await loadReportLines(organizationId, period.to);
    return { success: true as const, data: { period, ...ledger(lines, account, period) } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Impossible de charger le grand livre.") };
  }
}

// « Générer les écritures manquantes » : comptabilise tout l'historique non encore comptabilisé.
// Sans risque de doublon (une écriture au plus par document).
export async function generateMissingEntries(organizationId: string) {
  try {
    const user = await authorize(organizationId, true);
    const report = await syncAccounting(organizationId);
    await logAuditAction(user.id, "ACCOUNTING_SYNC", "Organization", organizationId, {
      created: report.created,
      errors: report.errors.length,
    });
    revalidatePath(`/dashboard/clinics/${organizationId}/comptabilite`);
    return { success: true as const, data: report };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la génération des écritures.") };
  }
}

// Sorties de caisse de la période, avec leur classement : le comptable y range les retraits qui ne
// sont pas des charges (prélèvement du propriétaire, versement en banque...), saisis autrefois sans
// catégorie et donc comptés en « Autres charges ».
export async function getCashWithdrawals(organizationId: string, periodInput?: Partial<Period>) {
  try {
    await authorize(organizationId);
    const period = resolve(periodInput);
    const rows = await prisma.financialTransaction.findMany({
      where: { organizationId, type: "EXPENSE", category: "OPERATIONAL_EXPENSE", amount: { gt: 0 } },
      select: { id: true, amount: true, description: true, createdAt: true, expenseCategory: true, absorbedByPurchaseId: true, reversedAt: true },
      orderBy: { createdAt: "desc" },
    });
    const items = rows
      .filter((r) => !r.absorbedByPurchaseId && !r.reversedAt)
      .map((r) => ({ id: r.id, amount: r.amount, description: r.description, date: clinicDateKey(r.createdAt), category: r.expenseCategory ?? "other" }))
      .filter((r) => r.date >= period.from && r.date <= period.to);
    return { success: true as const, data: { period, items } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Impossible de charger les sorties de caisse.") };
  }
}

// Reclasse une sortie de caisse (contrepassation de l'ancien classement + nouveau classement).
export async function reclassifyWithdrawal(organizationId: string, transactionId: string, category: string) {
  try {
    const user = await authorize(organizationId, true);
    const tx = await prisma.financialTransaction.findUnique({ where: { id: transactionId }, select: { organizationId: true, expenseCategory: true } });
    if (!tx || tx.organizationId !== organizationId) throw new Error("Sortie de caisse introuvable.");
    if ((tx.expenseCategory ?? "other") === category) return { success: true as const, data: null };
    const entry = await reclassifyExpense(transactionId, category, user.id);
    await logAuditAction(user.id, "ACCOUNTING_RECLASSIFY", "FinancialTransaction", transactionId, { from: tx.expenseCategory ?? "other", to: category });
    revalidatePath(`/dashboard/clinics/${organizationId}/comptabilite`);
    return { success: true as const, data: entry };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du reclassement.") };
  }
}
