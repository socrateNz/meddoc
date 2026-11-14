// Écritures automatiques : transforme les documents de MedDoc (tickets, règlements, dépenses,
// achats de stock, annulations) en écritures, toujours via postEntry. Chaque fonction est
// idempotente (une écriture au plus par document) : le rattrapage (syncAccounting) peut donc être
// relancé sans risque, et rejoue exactement ce que font les crochets temps réel.
//
// Schéma retenu pour un ticket MedDoc (variante « facture puis règlement » de la spécification,
// mêmes soldes que l'écriture combinée, mais chaque annulation MedDoc a son écriture propre) :
//   vente, au premier règlement   D 411 (patient) total / C 7061-7063-701-707 par nature
//   chaque règlement              D 5xx (moyen de paiement) / C 411
//   règlement contrepassé         D 411 / C 5xx
//   reste dû abandonné            D 651 / C 411
//   ticket supprimé               contrepassation de la vente
import { prisma } from "@/lib/db";
import { clinicDateKey } from "@/lib/clinic-day";
import { getOrganizationModules } from "@/lib/modules-server";
import { postEntry, reverseEntry, type PostEntryResult } from "./engine";
import { CASH_ACCOUNT, isDrawerCash, postCashSessions } from "./cash-sessions";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHOD_ACCOUNT,
  SALES_ACCOUNTS,
  WITHDRAWAL_CATEGORIES,
  WITHDRAWAL_SUSPENSE_ACCOUNT,
  isCashOutCategory,
  isWithdrawalCategory,
  type ExpenseCategory,
  type Journal,
  type PaymentMethod,
  type SalesNature,
} from "./plan";
import { allocate, roundAmount, type LineInput } from "./rules";

export const WRITE_OFF_ACCOUNT = "651";

// --- Règles pures -----------------------------------------------------------------------------

export interface InvoiceItem {
  type: string;
  description?: string;
  amount: number | string;
}

// Nature comptable d'une ligne de ticket : pharmacie → 701, laboratoire et actes → 7062,
// hospitalisation → 7063, consultation → 7061.
export function natureOfItem(item: InvoiceItem): SalesNature {
  if (item.type === "PHARMACY") return "PHARMACY";
  if (item.type === "LAB") return "ACT";
  const label = (item.description ?? "").toLowerCase();
  if (label.startsWith("hospitalisation")) return "HOSPITALIZATION";
  if (label.includes("consultation")) return "CONSULTATION";
  return "ACT";
}

// Nature d'un encaissement sans ligne détaillée exploitable (anciennes ventes) : par sa catégorie.
export function natureOfPayment(category: string, description: string): SalesNature {
  if (category === "PHARMACY_SALE") return "PHARMACY";
  if (category === "LAB_EXAM_FEE") return "ACT";
  if (category === "SERVICE_FEE") return natureOfItem({ type: "SERVICE", description, amount: 0 });
  return "ACCESSORY";
}

// Lignes de la vente d'un ticket : D 411 du total, C produits répartis par nature au prorata des
// montants facturés (somme exacte grâce à allocate). Actes médicaux exonérés : pas de TVA.
// `received` : total effectivement encaissé sur le ticket. S'il dépasse le facturé (anciens tickets
// dont la ligne était restée à 0), l'écart est aussi un produit, rangé selon `extraNature` — sinon
// la créance du patient deviendrait négative.
export function saleLines(items: InvoiceItem[], customerId: string | null, received = 0, extraNature: SalesNature = "ACT"): LineInput[] {
  const weights: Partial<Record<SalesNature, number>> = {};
  for (const item of items) {
    const amount = Number(item.amount) || 0;
    if (amount <= 0) continue;
    const nature = natureOfItem(item);
    weights[nature] = (weights[nature] ?? 0) + amount;
  }
  const billed = roundAmount(Object.values(weights).reduce((s, v) => s + (v ?? 0), 0));
  const extra = roundAmount(received) - billed;
  if (extra > 0) weights[extraNature] = (weights[extraNature] ?? 0) + extra;
  const total = Math.max(billed, roundAmount(received));
  if (total <= 0) return [];
  const parts = allocate(total, weights as Record<SalesNature, number>);
  const lines: LineInput[] = [{ account: "411", debit: total, customerId }];
  for (const [nature, amount] of Object.entries(parts) as [SalesNature, number][]) {
    if (amount > 0) lines.push({ account: SALES_ACCOUNTS[nature].account, credit: amount });
  }
  return lines;
}

export function treasuryAccount(method: string | null | undefined): string {
  return PAYMENT_METHOD_ACCOUNT[(method ?? "CASH") as PaymentMethod] ?? "571";
}

// Compte et contrepartie d'une sortie de caisse. Un retrait qui n'est pas une charge passe par le
// compte d'attente 471 (soldé par son règlement).
export function expenseAccounts(category: string | null | undefined): { account: string; counterpart: string; charge: boolean; transfer: boolean } {
  if (isWithdrawalCategory(category)) {
    const w = WITHDRAWAL_CATEGORIES[category];
    return { account: w.account, counterpart: WITHDRAWAL_SUSPENSE_ACCOUNT, charge: false, transfer: w.transfer };
  }
  const c = EXPENSE_CATEGORIES[(category ?? "other") as ExpenseCategory] ?? EXPENSE_CATEGORIES.other;
  return { account: c.account, counterpart: c.counterpart, charge: true, transfer: false };
}

// Écriture de « classement » d'une sortie de caisse (ce à quoi l'argent a servi), contre
// `counterpart` — la contrepartie que son règlement (D counterpart / C caisse) solde :
//   charge                D 6xx / C counterpart                 (journal AC)
//   retrait non-charge    D 104, 421, 401, 162 / C counterpart  (journal OD, hors résultat)
//   versement banque/MoMo D 581 / C counterpart, D 521|552 / C 581 (virement interne : ce n'est
//                         pas un encaissement, cf. dashboard)
// null : rien à classer (la sortie solde directement sa contrepartie, ex. régularisation sur 471).
export function classificationEntry(category: string | null | undefined, amount: number, counterpart: string): { journal: Journal; lines: LineInput[] } | null {
  const { account, charge, transfer } = expenseAccounts(category);
  if (account === counterpart) return null;
  if (transfer) {
    return {
      journal: "OD",
      lines: [
        { account: "581", debit: amount },
        { account: counterpart, credit: amount },
        { account, debit: amount },
        { account: "581", credit: amount },
      ],
    };
  }
  return { journal: charge ? "AC" : "OD", lines: [{ account, debit: amount }, { account: counterpart, credit: amount }] };
}

const ticketRef = (invoiceId: string) => `TCK-${invoiceId.slice(-6).toUpperCase()}`;
const dayOf = (date: Date | string) => clinicDateKey(new Date(date));

// --- Activation ---------------------------------------------------------------------------------

export async function accountingEnabled(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false;
  return (await getOrganizationModules(organizationId)).includes("COMPTABILITE");
}

// « Une vente n'échoue jamais à cause de la compta » : les crochets temps réel ne lèvent jamais.
// Une écriture manquée est rattrapée par le bouton « Générer les écritures manquantes ».
export async function accountSafely(label: string, organizationId: string | null | undefined, task: () => Promise<unknown>) {
  try {
    if (!(await accountingEnabled(organizationId))) return;
    await task();
  } catch (error) {
    console.error(`[comptabilité] ${label} non comptabilisé :`, error);
  }
}

// --- Écritures par document ---------------------------------------------------------------------

type Tx = {
  id: string;
  type: string;
  category: string;
  amount: number;
  description: string;
  organizationId: string | null;
  patientId: string | null;
  pendingInvoiceId: string | null;
  reversedFromInvoiceId: string | null;
  reversalOfId: string | null;
  cashSessionId: string | null;
  absorbedByPurchaseId: string | null;
  stockPurchaseId: string | null;
  paymentMethod: string | null;
  expenseCategory: string | null;
  reversedAt?: Date | null;
  recordedById: string;
  createdAt: Date;
};

// Vente d'un ticket, datée de son premier règlement. Rien si le ticket n'a jamais été payé.
export async function postInvoiceSale(invoiceId: string): Promise<PostEntryResult | null> {
  const invoice = await prisma.pendingInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice?.organizationId) return null;
  const firstPayment = await prisma.financialTransaction.findFirst({
    where: {
      type: "INCOME",
      category: { not: "REVERSAL" },
      amount: { gt: 0 },
      OR: [{ pendingInvoiceId: invoiceId }, { reversedFromInvoiceId: invoiceId }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!firstPayment) return null;
  // Encaissé à ce jour sur le ticket (hors règlements contrepassés).
  const received = await prisma.financialTransaction.aggregate({ where: { pendingInvoiceId: invoiceId, type: "INCOME" }, _sum: { amount: true } });
  const items = (invoice.items as unknown as InvoiceItem[]) ?? [];
  // L'excédent éventuel suit la nature de la première ligne du ticket (même à 0), sinon celle du règlement.
  const extraNature = items.length ? natureOfItem(items[0]) : natureOfPayment(firstPayment.category, firstPayment.description);
  const lines = saleLines(items, invoice.patientId, received._sum.amount ?? 0, extraNature);
  if (lines.length === 0) return null;
  const who = invoice.customPatientName ? ` — ${invoice.customPatientName}` : "";
  return postEntry({
    organizationId: invoice.organizationId,
    journal: "VE",
    date: firstPayment.createdAt,
    label: `Vente ${ticketRef(invoice.id)}${who}`,
    reference: ticketRef(invoice.id),
    sourceType: "INVOICE",
    sourceId: invoice.id,
    createdById: firstPayment.recordedById,
    occurredAt: new Date(firstPayment.createdAt.getTime() - 1),
    lines,
  });
}

async function postPayment(tx: Tx) {
  const invoiceId = tx.pendingInvoiceId ?? tx.reversedFromInvoiceId;
  // Ancienne vente encaissée sans ticket : vente au comptant, D 5xx / C produit.
  if (!invoiceId) {
    const nature = natureOfPayment(tx.category, tx.description);
    return postEntry({
      organizationId: tx.organizationId!,
      journal: "VE",
      date: tx.createdAt,
      label: `Vente au comptant — ${tx.description}`.slice(0, 250),
      sourceType: "PAYMENT",
      sourceId: tx.id,
      createdById: tx.recordedById,
      lines: [
        { account: treasuryAccount(tx.paymentMethod), debit: tx.amount },
        { account: SALES_ACCOUNTS[nature].account, credit: tx.amount },
      ],
    });
  }
  await postInvoiceSale(invoiceId);
  return postEntry({
    organizationId: tx.organizationId!,
    journal: "TR",
    date: tx.createdAt,
    label: `Règlement ${invoiceId ? ticketRef(invoiceId) : ""} — ${tx.description}`.slice(0, 250),
    reference: invoiceId ? ticketRef(invoiceId) : null,
    sourceType: "PAYMENT",
    sourceId: tx.id,
    createdById: tx.recordedById,
    lines: [
      { account: treasuryAccount(tx.paymentMethod), debit: tx.amount },
      { account: "411", credit: tx.amount, customerId: tx.patientId },
    ],
  });
}

async function postExpense(tx: Tx) {
  const results: PostEntryResult[] = [];
  const { counterpart } = expenseAccounts(tx.expenseCategory);
  // Un retrait de caisse rattaché à un achat de stock n'est pas une charge : il règle le
  // fournisseur de cet achat (la charge est l'achat lui-même, cf. postStockPurchase).
  const payee = tx.absorbedByPurchaseId ? "401" : counterpart;
  const classification = tx.absorbedByPurchaseId ? null : classificationEntry(tx.expenseCategory, tx.amount, counterpart);
  if (classification) {
    results.push(
      await postEntry({
        organizationId: tx.organizationId!,
        date: tx.createdAt,
        label: tx.description,
        sourceType: "EXPENSE",
        sourceId: tx.id,
        createdById: tx.recordedById,
        ...classification,
      })
    );
  }
  results.push(
    await postEntry({
      organizationId: tx.organizationId!,
      journal: "TR",
      date: tx.createdAt,
      label: `Sortie de caisse — ${tx.description}`.slice(0, 250),
      sourceType: "EXPENSE_PAYMENT",
      sourceId: tx.id,
      createdById: tx.recordedById,
      lines: [
        { account: payee, debit: tx.amount },
        { account: treasuryAccount(tx.paymentMethod), credit: tx.amount },
      ],
    })
  );
  return results;
}

async function postStockPurchase(tx: Tx) {
  const results: PostEntryResult[] = [];
  results.push(
    await postEntry({
      organizationId: tx.organizationId!,
      journal: "AC",
      date: tx.createdAt,
      label: tx.description,
      sourceType: "STOCK_PURCHASE",
      sourceId: tx.id,
      createdById: tx.recordedById,
      lines: [
        { account: "601", debit: tx.amount },
        { account: "401", credit: tx.amount },
      ],
    })
  );
  // Payé depuis la caisse : règlement immédiat du fournisseur.
  if (tx.cashSessionId) {
    results.push(
      await postEntry({
        organizationId: tx.organizationId!,
        journal: "TR",
        date: tx.createdAt,
        label: `Règlement — ${tx.description}`.slice(0, 250),
        sourceType: "STOCK_PURCHASE_PAYMENT",
        sourceId: tx.id,
        createdById: tx.recordedById,
        lines: [
          { account: "401", debit: tx.amount },
          { account: treasuryAccount(tx.paymentMethod), credit: tx.amount },
        ],
      })
    );
  }
  // Retraits de caisse rattachés après coup à cet achat : leur charge provisoire est
  // contrepassée (leur règlement reste, il solde le fournisseur de l'achat).
  const absorbed = await prisma.financialTransaction.findMany({ where: { absorbedByPurchaseId: tx.id }, select: { id: true } });
  for (const expense of absorbed) {
    const charge = await prisma.accountingEntry.findFirst({ where: { organizationId: tx.organizationId!, sourceType: "EXPENSE", sourceId: expense.id } });
    if (charge) results.push(await reverseEntry(charge.id, { date: tx.createdAt, reason: "retrait rattaché à un achat de stock" }));
  }
  return results;
}

// Annulation d'un règlement en espèces faite hors séance de caisse (par le coordinateur) : MedDoc
// ne la sort pas du tiroir (espèces attendues inchangées). L'argent rendu, s'il l'est, passe par une
// sortie de caisse classée « Remboursement / correction d'un règlement annulé ». D'ici là, le
// montant attend sur le 471.
export function offDrawerReversal(reversal: { cashSessionId: string | null }, originalPaymentMethod: string | null) {
  return !reversal.cashSessionId && isDrawerCash(originalPaymentMethod);
}

// Corrige les annulations hors caisse comptabilisées avant cette règle (contre la caisse 571) :
// contrepassation, puis la bonne écriture contre le 471.
async function fixOffDrawerReversals(organizationId: string) {
  const reversals = await prisma.financialTransaction.findMany({
    where: { organizationId, category: "REVERSAL", cashSessionId: null, amount: { gt: 0 } },
    select: { id: true, createdAt: true, recordedById: true },
  });
  const out: PostEntryResult[] = [];
  for (const r of reversals) {
    const entry = await prisma.accountingEntry.findFirst({ where: { organizationId, sourceType: "PAYMENT_REVERSAL", sourceId: r.id }, include: { lines: true } });
    const cash = entry?.lines.find((l) => l.account === CASH_ACCOUNT && l.credit > BigInt(0));
    if (!entry || !cash) continue;
    const reversal = await reverseEntry(entry.id, { date: r.createdAt, reason: "annulation faite hors caisse : l'argent n'est pas sorti du tiroir", createdById: r.recordedById });
    out.push(reversal);
    out.push(
      await postEntry({
        organizationId,
        journal: "OD",
        date: r.createdAt,
        label: `${entry.label} (hors caisse — à régulariser)`.slice(0, 250),
        reference: entry.reference,
        sourceType: "PAYMENT_REVERSAL_FIX",
        sourceId: reversal.id,
        createdById: r.recordedById,
        lines: entry.lines.map((l) => ({
          account: l.account === CASH_ACCOUNT ? WITHDRAWAL_SUSPENSE_ACCOUNT : l.account,
          debit: Number(l.debit),
          credit: Number(l.credit),
          customerId: l.customerId,
        })),
      })
    );
  }
  return out;
}

// Contrepassation MedDoc (catégorie REVERSAL) : un règlement annulé remet la créance du patient ;
// une dépense ou un achat annulé contrepasse ses écritures.
async function postReversal(tx: Tx) {
  if (!tx.reversalOfId) return [];
  const original = await prisma.financialTransaction.findUnique({ where: { id: tx.reversalOfId } });
  if (!original?.organizationId) return [];
  if (original.type === "INCOME") {
    if (original.amount <= 0) return [];
    const invoiceId = original.pendingInvoiceId ?? original.reversedFromInvoiceId;
    const sale = await postPayment(original as Tx);
    const off = offDrawerReversal(tx, original.paymentMethod);
    // Vente au comptant sans ticket : on contrepasse la vente elle-même.
    if (!invoiceId && !off) return [await reverseEntry(sale.id, { date: tx.createdAt, reason: "annulation dans MedDoc", createdById: tx.recordedById })];
    if (!invoiceId) {
      const saleLine = (await prisma.accountingLine.findMany({ where: { entryId: sale.id } })).find((l) => l.credit > BigInt(0));
      return [
        await postEntry({
          organizationId: original.organizationId,
          journal: "OD",
          date: tx.createdAt,
          label: "Annulation de vente faite hors caisse — à régulariser",
          sourceType: "PAYMENT_REVERSAL",
          sourceId: tx.id,
          createdById: tx.recordedById,
          lines: [
            { account: saleLine?.account ?? "707", debit: original.amount },
            { account: WITHDRAWAL_SUSPENSE_ACCOUNT, credit: original.amount },
          ],
        }),
      ];
    }
    return [
      await postEntry({
        organizationId: original.organizationId,
        journal: "TR",
        date: tx.createdAt,
        label: `Annulation de règlement ${ticketRef(invoiceId)}${off ? " (hors caisse — à régulariser)" : ""}`,
        reference: ticketRef(invoiceId),
        sourceType: "PAYMENT_REVERSAL",
        sourceId: tx.id,
        createdById: tx.recordedById,
        lines: [
          { account: "411", debit: original.amount, customerId: original.patientId },
          { account: off ? WITHDRAWAL_SUSPENSE_ACCOUNT : treasuryAccount(original.paymentMethod), credit: original.amount },
        ],
      }),
    ];
  }
  await accountTransaction(original.id);
  const entries = await prisma.accountingEntry.findMany({ where: { organizationId: original.organizationId, sourceId: original.id } });
  const out: PostEntryResult[] = [];
  for (const entry of entries) out.push(await reverseEntry(entry.id, { date: tx.createdAt, reason: "annulation dans MedDoc", createdById: tx.recordedById }));
  return out;
}

// --- Reclassement d'une sortie de caisse ----------------------------------------------------------
// Une écriture validée ne se modifie pas : reclasser une sortie (ex. « Autres charges » → « Versement
// en banque ») contrepasse son classement actuel puis passe le nouveau, à la date de la sortie. Le
// règlement (D contrepartie / C caisse) ne bouge pas. Le classement courant se retrouve en suivant
// la chaîne : classement d'origine (EXPENSE, sourceId = la sortie) → sa contrepassation →
// reclassement (EXPENSE_RECLASS, sourceId = cette contrepassation) → ...
async function currentClassification(organizationId: string, transactionId: string) {
  let entry = await prisma.accountingEntry.findFirst({ where: { organizationId, sourceType: "EXPENSE", sourceId: transactionId } });
  while (entry) {
    const reversal = await prisma.accountingEntry.findFirst({ where: { organizationId, reversalOf: entry.id } });
    if (!reversal) return { entry, pendingReversalId: null as string | null };
    const next = await prisma.accountingEntry.findFirst({ where: { organizationId, sourceType: "EXPENSE_RECLASS", sourceId: reversal.id } });
    if (!next) return { entry: null, pendingReversalId: reversal.id as string | null };
    entry = next;
  }
  return { entry: null, pendingReversalId: null as string | null };
}

export async function reclassifyExpense(transactionId: string, category: string, createdById?: string | null) {
  if (!isCashOutCategory(category)) throw new Error("Catégorie inconnue.");
  const tx = (await prisma.financialTransaction.findUnique({ where: { id: transactionId } })) as Tx | null;
  if (!tx?.organizationId || tx.type !== "EXPENSE" || tx.category !== "OPERATIONAL_EXPENSE") throw new Error("Seules les sorties de caisse peuvent être reclassées.");
  if (tx.absorbedByPurchaseId) throw new Error("Ce retrait règle un achat de stock : il est déjà classé avec cet achat.");
  if (tx.reversedAt) throw new Error("Cette sortie a été annulée.");
  const orgId = tx.organizationId;
  await postExpense(tx);
  const payment = await prisma.accountingEntry.findFirst({ where: { organizationId: orgId, sourceType: "EXPENSE_PAYMENT", sourceId: tx.id }, include: { lines: true } });
  const counterpart = payment?.lines.find((l) => l.debit > BigInt(0))?.account;
  if (!counterpart) throw new Error("Règlement comptable de cette sortie introuvable.");

  const current = await currentClassification(orgId, tx.id);
  let reversalId: string | null = current.pendingReversalId;
  if (current.entry) {
    reversalId = (await reverseEntry(current.entry.id, { date: tx.createdAt, reason: "reclassement", createdById })).id;
  }
  const classification = classificationEntry(category, tx.amount, counterpart);
  if (classification && !reversalId) {
    // Sortie jamais classée (régularisation sur 471) : son premier classement porte son propre id.
    reversalId = tx.id;
  }
  const posted = classification
    ? await postEntry({
        organizationId: orgId,
        date: tx.createdAt,
        label: `Reclassement — ${tx.description}`.slice(0, 250),
        sourceType: reversalId === tx.id ? "EXPENSE" : "EXPENSE_RECLASS",
        sourceId: reversalId,
        createdById,
        ...classification,
      })
    : null;
  await prisma.financialTransaction.update({ where: { id: tx.id }, data: { expenseCategory: category } });
  return posted;
}

// Comptabilise une écriture financière de MedDoc selon sa nature (idempotent).
export async function accountTransaction(transactionId: string): Promise<PostEntryResult[]> {
  const tx = (await prisma.financialTransaction.findUnique({ where: { id: transactionId } })) as Tx | null;
  if (!tx?.organizationId || tx.amount <= 0) return [];
  if (tx.category === "REVERSAL") return postReversal(tx);
  if (tx.type === "INCOME") return [await postPayment(tx)];
  if (tx.category === "OPERATIONAL_EXPENSE") return postExpense(tx);
  if (tx.category === "PHARMACY_PURCHASE") return postStockPurchase(tx);
  // STOCK_ADJUSTMENT (écart d'inventaire) : déjà compris dans les achats (601), pas d'écriture.
  return [];
}

// Reste dû abandonné (ticket clôturé, statut CANCELLED) : passé en perte sur créance.
export async function postInvoiceWriteOff(invoiceId: string): Promise<PostEntryResult | null> {
  const invoice = await prisma.pendingInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice?.organizationId || invoice.status !== "CANCELLED") return null;
  const sale = await postInvoiceSale(invoiceId);
  if (!sale) return null;
  const total = roundAmount(((invoice.items as unknown as InvoiceItem[]) ?? []).reduce((s, i) => s + Math.max(0, Number(i.amount) || 0), 0));
  const paid = await prisma.financialTransaction.aggregate({ where: { pendingInvoiceId: invoiceId, type: "INCOME" }, _sum: { amount: true } });
  const remaining = roundAmount(total - (paid._sum.amount ?? 0));
  if (remaining <= 0) return null;
  return postEntry({
    organizationId: invoice.organizationId,
    journal: "OD",
    date: invoice.closedAt ?? new Date(),
    label: `Créance abandonnée ${ticketRef(invoice.id)}`,
    reference: ticketRef(invoice.id),
    sourceType: "INVOICE_WRITE_OFF",
    sourceId: invoice.id,
    createdById: invoice.closedById,
    lines: [
      { account: WRITE_OFF_ACCOUNT, debit: remaining },
      { account: "411", credit: remaining, customerId: invoice.patientId },
    ],
  });
}

// Ticket supprimé après avoir été comptabilisé : sa vente est contrepassée (ses règlements le
// sont déjà, chacun par sa propre contrepassation).
export async function reverseDeletedInvoiceSale(organizationId: string, invoiceId: string) {
  const sale = await prisma.accountingEntry.findFirst({ where: { organizationId, sourceType: "INVOICE", sourceId: invoiceId } });
  if (!sale) return null;
  return reverseEntry(sale.id, { reason: "ticket supprimé", sourceType: "INVOICE_DELETED" });
}

// --- Rattrapage : « Générer les écritures manquantes » --------------------------------------

export interface SyncReport {
  created: number;
  existing: number;
  errors: { document: string; message: string }[];
}

export async function syncAccounting(organizationId: string): Promise<SyncReport> {
  const report: SyncReport = { created: 0, existing: 0, errors: [] };
  const record = (results: (PostEntryResult | null)[]) => {
    for (const r of results) {
      if (!r) continue;
      if (r.created) report.created++;
      else report.existing++;
    }
  };
  const attempt = async (document: string, task: () => Promise<(PostEntryResult | null)[]>) => {
    try {
      record(await task());
    } catch (error) {
      report.errors.push({ document, message: error instanceof Error ? error.message : String(error) });
    }
  };

  // 1. Toutes les écritures financières, dans l'ordre chronologique (ventes avant règlements).
  const transactions = await prisma.financialTransaction.findMany({
    where: { organizationId, amount: { gt: 0 } },
    select: { id: true, description: true },
    orderBy: { createdAt: "asc" },
  });
  for (const t of transactions) await attempt(`Mouvement « ${t.description.slice(0, 60)} »`, () => accountTransaction(t.id));

  // 2. Restes dus abandonnés.
  const cancelled = await prisma.pendingInvoice.findMany({ where: { organizationId, status: "CANCELLED" }, select: { id: true } });
  for (const inv of cancelled) await attempt(`Ticket ${ticketRef(inv.id)}`, async () => [await postInvoiceWriteOff(inv.id)]);

  // 3. Ventes comptabilisées dont le ticket a depuis été supprimé.
  const sales = await prisma.accountingEntry.findMany({ where: { organizationId, sourceType: "INVOICE" }, select: { sourceId: true } });
  const saleIds = sales.map((s) => s.sourceId).filter((id): id is string => !!id);
  const alive = new Set((await prisma.pendingInvoice.findMany({ where: { id: { in: saleIds } }, select: { id: true } })).map((i) => i.id));
  for (const id of saleIds.filter((id) => !alive.has(id))) {
    await attempt(`Ticket supprimé ${ticketRef(id)}`, async () => [await reverseDeletedInvoiceSale(organizationId, id)]);
  }

  // 4. Annulations faites hors caisse comptabilisées autrefois contre la caisse.
  await attempt("Annulations hors caisse", () => fixOffDrawerReversals(organizationId));

  // 5. Séances de caisse : fond initial, écarts à la fermeture, argent sorti entre deux séances.
  await attempt("Séances de caisse", () => postCashSessions(organizationId));

  // 6. Écritures passées avant l'ajout de l'heure réelle : on la complète (simple métadonnée de tri).
  await attempt("Heure des écritures", async () => {
    await backfillOccurredAt(organizationId);
    return [];
  });
  return report;
}

// Complète l'heure réelle (occurredAt) des écritures qui ne l'ont pas, et renomme « Règlement — »
// en « Sortie de caisse — » sur les sorties de caisse. Ni les montants ni les comptes ne changent.
async function backfillOccurredAt(organizationId: string) {
  const entries = await prisma.accountingEntry.findMany({
    where: { organizationId, occurredAt: { isSet: false } },
    select: { id: true, sourceType: true, sourceId: true, entryDate: true, createdAt: true, label: true },
  });
  if (!entries.length) return;
  const ids = [...new Set(entries.map((e) => e.sourceId).filter((id): id is string => !!id))];
  const txs = await prisma.financialTransaction.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } });
  const txTime = new Map(txs.map((t) => [t.id, t.createdAt]));
  const invoiceIds = entries.filter((e) => e.sourceType === "INVOICE" && e.sourceId).map((e) => e.sourceId!);
  const firstPayments = invoiceIds.length
    ? await prisma.financialTransaction.findMany({
        where: { OR: [{ pendingInvoiceId: { in: invoiceIds } }, { reversedFromInvoiceId: { in: invoiceIds } }], type: "INCOME" },
        select: { pendingInvoiceId: true, reversedFromInvoiceId: true, createdAt: true },
      })
    : [];
  const saleTime = new Map<string, Date>();
  for (const p of firstPayments) {
    const id = p.pendingInvoiceId ?? p.reversedFromInvoiceId;
    if (!id) continue;
    const t = new Date(p.createdAt.getTime() - 1);
    if (!saleTime.has(id) || t < saleTime.get(id)!) saleTime.set(id, t);
  }
  // À défaut : l'instant de création s'il tombe le jour de l'écriture, sinon la fin de cette journée.
  const fallback = (e: (typeof entries)[number]) => (dayOf(e.createdAt) === e.entryDate ? e.createdAt : new Date(`${e.entryDate}T22:59:59.000Z`));
  for (let i = 0; i < entries.length; i += 50) {
    await Promise.all(
      entries.slice(i, i + 50).map(async (e) => {
        const occurredAt = (e.sourceId && (e.sourceType === "INVOICE" ? saleTime.get(e.sourceId) : txTime.get(e.sourceId))) || fallback(e);
        const relabel = e.sourceType === "EXPENSE_PAYMENT" && e.label.startsWith("Règlement — ");
        const label = relabel ? `Sortie de caisse — ${e.label.slice("Règlement — ".length)}` : e.label;
        await prisma.accountingEntry.update({ where: { id: e.id }, data: { occurredAt, label } });
        if (relabel) await prisma.accountingLine.updateMany({ where: { entryId: e.id, label: e.label }, data: { label } });
      })
    );
  }
}

export const todayKey = () => dayOf(new Date());
