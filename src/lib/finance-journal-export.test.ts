import { describe, it, expect } from "vitest";
import { buildJournalExportRows, buildJournalSheetData, describeJournalFilters, formatDateTimeInTz, formatFCFA, journalExportFileName, toExcelLocalDate, type JournalTransaction } from "./finance-journal-export";

const tx = (overrides: Partial<JournalTransaction> = {}): JournalTransaction => ({
  id: "t1",
  type: "INCOME",
  category: "PHARMACY_SALE",
  amount: 12500,
  description: "Vente comptant",
  createdAt: "2026-10-10T09:30:00.000Z",
  patient: { user: { firstName: "Awa", lastName: "NDIAYE" } },
  recordedBy: { firstName: "Paul", lastName: "Mbarga" },
  pendingInvoice: null,
  absorbedByPurchaseId: null,
  ...overrides,
});

describe("buildJournalExportRows", () => {
  it("signe le montant selon le type et reprend les libellés du journal", () => {
    const [income, expense] = buildJournalExportRows([
      tx(),
      tx({ id: "t2", type: "EXPENSE", category: "OPERATIONAL_EXPENSE", amount: 3000, patient: null }),
    ]);
    expect(income).toMatchObject({ signedAmount: 12500, categoryLabel: "Vente Pharmacie", patient: "NDIAYE Awa", recordedBy: "Paul Mbarga", status: "" });
    expect(expense).toMatchObject({ signedAmount: -3000, categoryLabel: "Dépense opérationnelle", patient: "" });
  });

  it("n'affiche un statut que pour un ticket non soldé ou une dépense absorbée", () => {
    const rows = buildJournalExportRows([
      tx({ pendingInvoice: { status: "PAID" } }),
      tx({ pendingInvoice: { status: "PARTIAL" }, remainingDue: 4000 }),
      tx({ pendingInvoice: { status: "PENDING" } }),
      tx({ type: "EXPENSE", absorbedByPurchaseId: "p1" }),
    ]);
    expect(rows.map((r) => r.status)).toEqual(["", "Partiel — reste 4 000 FCFA", "Non payé — vente à crédit", "Absorbée"]);
  });

  it("retombe sur Encaissement / Dépense pour une catégorie inconnue", () => {
    const [row] = buildJournalExportRows([tx({ type: "EXPENSE", category: "INCONNUE" })]);
    expect(row.categoryLabel).toBe("Dépense");
  });
});

describe("describeJournalFilters", () => {
  it("liste uniquement les filtres actifs", () => {
    expect(describeJournalFilters({ search: "", type: "", category: "ALL", minAmount: "", maxAmount: "" })).toEqual([]);
    expect(describeJournalFilters({ search: " awa ", type: "EXPENSE", category: "OTHER", minAmount: "1000", maxAmount: 50000 })).toEqual([
      "Recherche : « awa »",
      "Dépenses uniquement",
      "Catégorie : Autre",
      "Montant min : 1 000 FCFA",
      "Montant max : 50 000 FCFA",
    ]);
  });
});

describe("journalExportFileName / formatFCFA", () => {
  const now = new Date("2026-10-11T08:00:00.000Z");
  it("nomme le fichier d'après la période", () => {
    expect(journalExportFileName({ from: "2026-10-01", to: "2026-10-11" }, "pdf", now)).toBe("journal-caisse_2026-10-01_2026-10-11.pdf");
    expect(journalExportFileName({ from: null, to: null }, "xlsx", now)).toBe("journal-caisse_complet_2026-10-11.xlsx");
  });
  it("formate les montants négatifs", () => {
    expect(formatFCFA(-1234567)).toBe("-1 234 567 FCFA");
  });
});

describe("buildJournalSheetData", () => {
  it("place l'en-tête, une ligne par mouvement puis les totaux, et fige l'en-tête", () => {
    const rows = buildJournalExportRows([tx(), tx({ id: "t2", type: "EXPENSE", amount: 3000 })]);
    const { data, stickyRowsCount } = buildJournalSheetData({
      rows,
      totalIncome: 12500,
      totalExpenses: 3000,
      periodLabel: "Le 10 oct. 2026",
      filters: ["Encaissements uniquement"],
      generatedAt: new Date("2026-10-11T08:00:00.000Z"),
      organizationName: "Clinique Test",
    });
    // titre, période, filtres, date d'édition, ligne vide → titres de colonnes en 6e ligne
    expect(stickyRowsCount).toBe(6);
    const headerRow = data[5] as { value: string }[];
    expect(headerRow.map((c) => c.value)[0]).toBe("Date & heure");
    expect(data).toHaveLength(6 + 2 + 1 + 3);
    const amountOf = (row: unknown) => ((row as { value: number }[])[7]).value;
    expect(amountOf(data[6])).toBe(12500);
    expect(amountOf(data[7])).toBe(-3000);
    expect(data.slice(-3).map(amountOf)).toEqual([12500, -3000, 9500]);
  });
});

describe("fuseau de l'utilisateur (export généré côté serveur)", () => {
  // Douala : UTC+1 → Date.getTimezoneOffset() = -60
  it("affiche l'heure locale dans le PDF et dans les cellules Excel", () => {
    const d = new Date("2026-10-10T09:30:00.000Z");
    expect(formatDateTimeInTz(d, -60)).toBe("10/10/2026 10:30");
    expect(formatDateTimeInTz(d, 0)).toBe("10/10/2026 09:30");
    expect(toExcelLocalDate(d, -60).toISOString()).toBe("2026-10-10T10:30:00.000Z");
  });
});
