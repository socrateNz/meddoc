import { describe, it, expect } from "vitest";
import { balanceSheet, closingLines, dashboard, incomeStatement, integrityChecks, ledger, trialBalance, vatReturn, type ReportLine } from "./reports";

// Jeu de lignes figé : une consultation en tiers payant, le virement de la mutuelle, une facture
// d'électricité payée par virement, un apport en capital.
let n = 0;
const entry = (date: string, journal: string, lines: [string, number, number][], extra: Partial<ReportLine> = {}): ReportLine[] => {
  const entryId = `e${++n}`;
  return lines.map(([account, debit, credit]) => ({ entryId, entryDate: date, journal, account, label: "", debit, credit, ...extra }));
};
const LINES: ReportLine[] = [
  ...entry("2026-01-01", "OD", [["521", 1000000, 0], ["101", 0, 1000000]]),
  ...entry("2026-03-10", "VE", [["571", 3000, 0], ["4111", 7000, 0], ["7061", 0, 10000]]),
  ...entry("2026-03-20", "TR", [["521", 7000, 0], ["4111", 0, 7000]]),
  ...entry("2026-03-25", "AC", [["6052", 50000, 0], ["4452", 9625, 0], ["401", 0, 59625]]),
  ...entry("2026-03-28", "TR", [["401", 59625, 0], ["521", 0, 59625]]),
  ...entry("2026-04-02", "VE", [["571", 11925, 0], ["701", 0, 10000], ["4431", 0, 1925]]),
];
const MARCH = { from: "2026-03-01", to: "2026-03-31" };

describe("tableau de bord", () => {
  const d = dashboard(LINES, MARCH);
  it("CA = 70x de la période ; le règlement de la mutuelle ne le compte pas deux fois", () => {
    expect(d.revenue).toBe(10000);
  });
  it("charges, résultat, TVA nette", () => {
    expect(d.expenses).toBe(50000);
    expect(d.result).toBe(-40000);
    expect(d.vatNet).toBe(-9625);
  });
  it("encaissements de la période = débits des 5x (≠ CA)", () => {
    expect(d.cashIn).toBe(3000 + 7000);
  });
  it("soldes cumulés à la date de fin, tiers payant séparé des patients", () => {
    expect(d.cash).toBe(3000);
    expect(d.bank).toBe(1000000 + 7000 - 59625);
    expect(d.supplierDebt).toBe(0);
    expect(d.thirdPartyReceivables).toBe(0);
    expect(d.patientReceivables).toBe(0);
  });
});

describe("grand livre et balance", () => {
  it("grand livre de la banque : ouverture, solde progressif, clôture", () => {
    const l = ledger(LINES, "521", MARCH);
    expect(l.opening).toBe(1000000);
    expect(l.rows.map((r) => r.running)).toEqual([1007000, 947375]);
    expect(l.closing).toBe(947375);
  });
  it("balance équilibrée sur chaque colonne", () => {
    const b = trialBalance(LINES, { from: "2026-03-01", to: "2026-04-30" });
    expect(b.balanced).toBe(true);
    expect(b.totals.debit).toBe(b.totals.credit);
  });
});

describe("résultat, bilan, TVA", () => {
  it("compte de résultat de l'année", () => {
    const r = incomeStatement(LINES, { from: "2026-01-01", to: "2026-12-31" });
    expect(r.totalProducts).toBe(20000);
    expect(r.totalCharges).toBe(50000);
    expect(r.result).toBe(-30000);
  });
  it("bilan : actif = passif, résultat non affecté inclus", () => {
    const b = balanceSheet(LINES, "2026-12-31");
    expect(b.balanced).toBe(true);
    expect(b.unallocatedResult).toBe(-30000);
  });
  it("déclaration de TVA : crédit à reporter", () => {
    expect(vatReturn(LINES, MARCH)).toMatchObject({ collected: 0, deductible: 9625, net: -9625, toPay: 0, creditCarriedForward: 9625 });
  });
});

describe("clôture", () => {
  it("produits 500 000, charges 380 000 → C 131 120 000 (test de référence)", () => {
    const year = [
      ...entry("2026-05-01", "VE", [["571", 500000, 0], ["7061", 0, 500000]]),
      ...entry("2026-06-01", "AC", [["622", 380000, 0], ["571", 0, 380000]]),
    ];
    const c = closingLines(year, { from: "2026-01-01", to: "2026-12-31" });
    expect(c.result).toBe(120000);
    expect(c.lines).toContainEqual({ account: "131", debit: 0, credit: 120000, closing: true });
    const total = c.lines.reduce((s, l) => s + l.debit - l.credit, 0);
    expect(total).toBe(0);
  });
  it("les écritures de clôture sont exclues du compte de résultat", () => {
    const year = [
      ...entry("2026-05-01", "VE", [["571", 500000, 0], ["7061", 0, 500000]]),
      ...entry("2026-12-31", "OD", [["7061", 500000, 0], ["131", 0, 500000]], { closing: true }),
    ];
    expect(incomeStatement(year, { from: "2026-01-01", to: "2026-12-31" }).result).toBe(500000);
  });
});

describe("intégrité", () => {
  it("aucune écriture déséquilibrée ni ligne invalide sur le jeu de référence", () => {
    expect(integrityChecks(LINES)).toEqual({ unbalancedEntries: 0, invalidLines: 0, globalBalanced: true });
  });
  it("détecte une écriture déséquilibrée", () => {
    const bad = [...LINES, { entryId: "x", entryDate: "2026-03-01", journal: "OD", account: "571", label: "", debit: 5, credit: 0 }];
    expect(integrityChecks(bad).unbalancedEntries).toBe(1);
  });
});
