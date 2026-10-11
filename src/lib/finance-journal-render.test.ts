import { describe, it, expect } from "vitest";
import { renderJournalExport, type JournalExportInput } from "./finance-journal-render";
import { buildJournalExportRows } from "./finance-journal-export";

// Test de fumée : les deux fichiers se génèrent réellement côté serveur (un style invalide ou une
// donnée inattendue ferait échouer la route d'export, pas la compilation).
describe("renderJournalExport", () => {
  const rows = buildJournalExportRows(
    Array.from({ length: 80 }, (_, i) => ({
      id: `t${i}`,
      type: i % 3 === 0 ? "EXPENSE" : "INCOME",
      category: i % 3 === 0 ? "OPERATIONAL_EXPENSE" : "PHARMACY_SALE",
      amount: 1000 + i * 250,
      description: `Mouvement ${i}`,
      createdAt: new Date(Date.UTC(2026, 9, 1 + (i % 10), 9, i % 60)),
      patient: i % 3 === 0 ? null : { user: { firstName: "Awa", lastName: "NDIAYE" } },
      recordedBy: { firstName: "Paul", lastName: "Mbarga" },
      pendingInvoice: i % 7 === 0 ? { status: "PARTIAL" } : null,
      remainingDue: i % 7 === 0 ? 500 : undefined,
    }))
  );
  const input: JournalExportInput = {
    rows,
    totalIncome: 100000,
    totalExpenses: 25000,
    periodLabel: "Du 1 au 10 oct. 2026",
    filters: ["Encaissements uniquement"],
    generatedAt: new Date("2026-10-11T08:00:00.000Z"),
    tzOffsetMinutes: -60,
    organizationName: "Clinique Le Bien-être",
  };

  it("génère un PDF valide sur plusieurs pages", async () => {
    const buffer = await renderJournalExport("pdf", input);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5000);
  });

  it("génère un classeur .xlsx valide", async () => {
    const buffer = await renderJournalExport("xlsx", input);
    // Un .xlsx est une archive zip : signature « PK ».
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(2000);
  });
});
