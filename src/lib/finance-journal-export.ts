import type { CellObject, Row, SheetData } from "write-excel-file/node";

// Export du Journal de caisse (PDF + Excel) : logique pure partagée par les deux formats, pour
// qu'un même mouvement porte exactement les mêmes libellés, statut et montant signé dans le PDF,
// dans le classeur et à l'écran (cf. src/app/dashboard/finance/finance-journal.tsx).

// Déplacé depuis finance-journal.tsx (qui le réexporte) : la lib ne doit pas dépendre d'un
// composant client.
export const TRANSACTION_CATEGORY_LABELS: Record<string, string> = {
  PHARMACY_SALE: "Vente Pharmacie",
  SERVICE_FEE: "Frais de service",
  LAB_EXAM_FEE: "Analyses de laboratoire",
  OPERATIONAL_EXPENSE: "Dépense opérationnelle",
  PHARMACY_PURCHASE: "Achat Pharmacie",
  STOCK_ADJUSTMENT: "Ajustement de stock",
  REVERSAL: "Contrepassation",
  OTHER: "Autre",
};

export function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  const sign = num < 0 ? "-" : "";
  return sign + Math.abs(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

// Sous-ensemble d'une ligne renvoyée par listFinancialTransactions (src/actions/finance.ts) utilisé
// par l'export.
export interface JournalTransaction {
  id: string;
  type: string;
  category: string;
  amount: number;
  description?: string | null;
  createdAt: string | Date;
  patient?: { user?: { firstName: string; lastName: string } | null } | null;
  recordedBy?: { firstName: string; lastName: string } | null;
  pendingInvoice?: { status: string } | null;
  absorbedByPurchaseId?: string | null;
  remainingDue?: number;
  reversedAt?: string | Date | null;
}

export interface JournalExportRow {
  id: string;
  date: Date;
  isIncome: boolean;
  categoryLabel: string;
  description: string;
  // Statut de règlement (même règle que PaymentStatusBadge dans le journal : rien pour un ticket
  // soldé) + mention « Absorbée » ; chaîne vide si rien à signaler.
  status: string;
  patient: string;
  recordedBy: string;
  // Signé : positif pour un encaissement, négatif pour une dépense — une seule colonne à sommer.
  signedAmount: number;
}

function paymentStatusLabel(t: JournalTransaction): string | null {
  const status = t.pendingInvoice?.status;
  if (!status || status === "PAID") return null;
  if (status === "CANCELLED") return "Clôturé — non réglé intégralement";
  if (status === "PENDING") return "Non payé — vente à crédit";
  if (status === "PARTIAL") {
    return t.remainingDue != null ? `Partiel — reste ${formatFCFA(t.remainingDue)}` : "Partiel";
  }
  return null;
}

export function buildJournalExportRows(transactions: JournalTransaction[]): JournalExportRow[] {
  return transactions.map((t) => {
    const isIncome = t.type === "INCOME";
    const status = [paymentStatusLabel(t), t.absorbedByPurchaseId ? "Absorbée" : null, t.reversedAt ? "Contrepassé" : null]
      .filter(Boolean)
      .join(" · ");
    const amount = Math.abs(Number(t.amount) || 0);
    return {
      id: t.id,
      date: new Date(t.createdAt),
      isIncome,
      categoryLabel: TRANSACTION_CATEGORY_LABELS[t.category] || (isIncome ? "Encaissement" : "Dépense"),
      description: t.description || "",
      status,
      patient: t.patient?.user ? `${t.patient.user.lastName} ${t.patient.user.firstName}` : "",
      recordedBy: t.recordedBy ? `${t.recordedBy.firstName} ${t.recordedBy.lastName}` : "",
      signedAmount: isIncome ? amount : -amount,
    };
  });
}

export interface JournalExportFilters {
  search?: string;
  type?: "INCOME" | "EXPENSE" | "";
  category?: string;
  minAmount?: string | number;
  maxAmount?: string | number;
}

// Rappel des filtres actifs en tête de document : un export filtré ne doit jamais pouvoir être
// pris pour le journal complet de la période.
export function describeJournalFilters(filters: JournalExportFilters): string[] {
  const parts: string[] = [];
  if (filters.search?.trim()) parts.push(`Recherche : « ${filters.search.trim()} »`);
  if (filters.type === "INCOME") parts.push("Encaissements uniquement");
  if (filters.type === "EXPENSE") parts.push("Dépenses uniquement");
  if (filters.category && filters.category !== "ALL") {
    parts.push(`Catégorie : ${TRANSACTION_CATEGORY_LABELS[filters.category] || filters.category}`);
  }
  const min = filters.minAmount === "" || filters.minAmount == null ? null : Number(filters.minAmount);
  const max = filters.maxAmount === "" || filters.maxAmount == null ? null : Number(filters.maxAmount);
  if (min != null && !Number.isNaN(min)) parts.push(`Montant min : ${formatFCFA(min)}`);
  if (max != null && !Number.isNaN(max)) parts.push(`Montant max : ${formatFCFA(max)}`);
  return parts;
}

// journal-caisse_2026-10-01_2026-10-11.pdf — à défaut de bornes, la date du jour de l'export.
export function journalExportFileName(
  period: { from?: string | null; to?: string | null },
  extension: "pdf" | "xlsx",
  now: Date = new Date()
): string {
  const today = now.toISOString().slice(0, 10);
  const range = period.from || period.to ? [period.from || "debut", period.to || today].join("_") : `complet_${today}`;
  return `journal-caisse_${range}.${extension}`;
}

// L'export est généré côté serveur (UTC) : l'heure affichée doit être celle de l'utilisateur, d'où
// le décalage du navigateur (Date.getTimezoneOffset, positif à l'ouest de Greenwich) transmis avec
// les filtres, comme pour la période (cf. src/lib/finance-period.ts).
function shiftToLocal(date: Date, tzOffsetMinutes = 0): Date {
  return new Date(date.getTime() - tzOffsetMinutes * 60 * 1000);
}

export function formatDateTimeInTz(date: Date, tzOffsetMinutes = 0): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(shiftToLocal(date, tzOffsetMinutes));
}

// Excel n'a pas de fuseau : write-excel-file convertit une Date depuis son instant UTC, on la
// décale donc pour que la cellule affiche l'heure locale de l'utilisateur.
export function toExcelLocalDate(date: Date, tzOffsetMinutes = 0): Date {
  return shiftToLocal(date, tzOffsetMinutes);
}

const AMOUNT_FORMAT = '#,##0" FCFA";[Red]-#,##0" FCFA"';

export const JOURNAL_SHEET_COLUMNS = [17, 14, 22, 45, 28, 24, 22, 18].map((width) => ({ width }));

// Feuille Excel du journal : en-tête (organisation, période, filtres, date d'édition), tableau
// des mouvements (dates et montants en vraies cellules typées) puis totaux du résultat filtré.
// `stickyRowsCount` fige l'en-tête et les titres de colonnes pendant le défilement.
export function buildJournalSheetData(input: {
  rows: JournalExportRow[];
  totalIncome: number;
  totalExpenses: number;
  periodLabel: string;
  filters: string[];
  generatedAt: Date;
  tzOffsetMinutes?: number;
  organizationName?: string;
}): { data: SheetData; stickyRowsCount: number } {
  const header = (value: string): CellObject => ({ value, fontWeight: "bold", backgroundColor: "#F1F5F9", borderColor: "#CBD5E1", borderStyle: "thin" });
  const meta: Row[] = [
    [{ value: `Journal de caisse — ${input.organizationName || "MedDoc"}`, fontWeight: "bold", fontSize: 14 }],
    [`Période : ${input.periodLabel}`],
    ...(input.filters.length > 0 ? [[`Filtres : ${input.filters.join(" • ")}`]] : []),
    [`Édité le ${formatDateTimeInTz(input.generatedAt, input.tzOffsetMinutes)}`],
    [],
  ];
  const headerRow = ["Date & heure", "Type", "Catégorie", "Motif / Description", "Statut", "Patient", "Enregistré par", "Montant (FCFA)"].map(header);
  const dataRows = input.rows.map((r): Row => [
    { value: toExcelLocalDate(r.date, input.tzOffsetMinutes), type: Date, format: "dd/mm/yyyy hh:mm" },
    r.isIncome ? "Encaissement" : "Dépense",
    r.categoryLabel,
    r.description,
    r.status || null,
    r.patient || null,
    r.recordedBy || null,
    { value: r.signedAmount, type: Number, format: AMOUNT_FORMAT },
  ]);
  const total = (label: string, value: number): Row => [
    null, null, null, null, null, null,
    { value: label, fontWeight: "bold", align: "right" },
    { value, type: Number, format: AMOUNT_FORMAT, fontWeight: "bold" },
  ];
  return {
    data: [
      ...meta,
      headerRow,
      ...dataRows,
      [],
      total("Total encaissé", input.totalIncome),
      total("Total dépensé", -input.totalExpenses),
      total("Solde net", input.totalIncome - input.totalExpenses),
    ],
    stickyRowsCount: meta.length + 1,
  };
}
