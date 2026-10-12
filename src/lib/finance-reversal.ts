import type { Prisma } from "@prisma/client";

// Contrepassation : une écriture financière n'est jamais supprimée (cf. reverseInvoicePayments
// dans src/actions/finance.ts et cancelStockPurchase dans src/actions/stock.ts). L'écriture
// d'origine reste en base marquée `reversedAt` et une écriture inverse de catégorie REVERSAL est
// créée.
//
// - Sessions de caisse / solde du tiroir : les DEUX écritures comptent (l'argent a réellement
//   bougé dans le tiroir) — aucun filtre à appliquer.
// - Indicateurs de recettes/dépenses (KPI, graphiques, répartition par catégorie) : NI l'écriture
//   contrepassée NI son écriture inverse ne comptent, exactement comme avant lorsque l'écriture
//   était supprimée — sinon les recettes resteraient brutes et l'annulation gonflerait
//   artificiellement les dépenses (ou l'inverse pour un achat annulé).

export const REVERSAL_CATEGORY = "REVERSAL";

// Filtre Prisma « compte dans les KPI ». `reversedAt` est un champ optionnel ajouté après coup :
// sur MongoDB, { champ: null } ne retrouve pas les documents où il est ABSENT, d'où isSet: false
// (même piège que fieldIsEmpty dans src/actions/stock.ts).
export const COUNTS_IN_KPI_WHERE: Prisma.FinancialTransactionWhereInput = {
  AND: [
    { OR: [{ reversedAt: null }, { reversedAt: { isSet: false } }] },
    { category: { not: REVERSAL_CATEGORY } },
  ],
};

export function countsInKpi(t: { category?: string | null; reversedAt?: Date | string | null }): boolean {
  return !t.reversedAt && t.category !== REVERSAL_CATEGORY;
}

type ReversibleTransaction = {
  id: string;
  type: string;
  amount: number;
  description: string;
  patientId?: string | null;
  customPatientName?: string | null;
  customPatientPhone?: string | null;
  organizationId?: string | null;
  cashSessionId?: string | null;
  cashSession?: { status: string } | null;
};

// Écriture inverse d'une écriture existante : type opposé, même montant. Rattachée à la session
// d'origine si elle est encore ouverte (le tiroir reste juste), sinon hors session et datée du
// jour — une session clôturée n'est jamais modifiée.
export function buildReversalEntry(
  original: ReversibleTransaction,
  params: { userId: string; label: string; reason?: string | null; reversedFromInvoiceId?: string }
): Prisma.FinancialTransactionUncheckedCreateInput {
  return {
    type: original.type === "INCOME" ? "EXPENSE" : "INCOME",
    category: REVERSAL_CATEGORY,
    amount: original.amount,
    description: `${params.label} — ${original.description}${params.reason ? ` (motif : ${params.reason})` : ""}`,
    patientId: original.patientId ?? null,
    customPatientName: original.customPatientName ?? null,
    customPatientPhone: original.customPatientPhone ?? null,
    recordedById: params.userId,
    organizationId: original.organizationId ?? null,
    cashSessionId: original.cashSession?.status === "OPEN" ? original.cashSessionId ?? null : null,
    reversalOfId: original.id,
    ...(params.reversedFromInvoiceId ? { reversedFromInvoiceId: params.reversedFromInvoiceId } : {}),
  };
}
