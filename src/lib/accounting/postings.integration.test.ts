// Écritures automatiques sur une VRAIE base MongoDB, de bout en bout (documents MedDoc → écritures
// → états). Ignoré sans COMPTA_TEST_DATABASE_URL (base jetable en replica set), cf.
// engine.integration.test.ts.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const url = process.env.COMPTA_TEST_DATABASE_URL;
vi.mock("@/lib/modules-server", () => ({ getOrganizationModules: vi.fn(async () => ["COMPTABILITE"]) }));

describe.skipIf(!url)("écritures automatiques (base réelle)", async () => {
  if (url) process.env.DATABASE_URL = url;
  const { prisma } = await import("@/lib/db");
  const { accountTransaction, postInvoiceWriteOff, reclassifyExpense, reverseDeletedInvoiceSale, syncAccounting } = await import("./postings");
  const { loadReportLines, loadAccountTotals, loadIntegrity, loadAccountLines } = await import("./engine");
  const { balance, balanceSheet, dashboard, incomeStatement, integrityChecks, ledger, trialBalance } = await import("./reports");

  let org: string;
  let user: string;
  const patient = "65f1a2b3c4d5e6f708192b01";
  const day = (d: string) => new Date(`${d}T10:00:00Z`);
  const lines = () => loadReportLines(org, "2026-12-31");

  const income = (invoiceId: string, amount: number, date: string, paymentMethod = "CASH") =>
    prisma.financialTransaction.create({
      data: { type: "INCOME", category: "SERVICE_FEE", amount, description: "Règlement", patientId: patient, recordedById: user, organizationId: org, pendingInvoiceId: invoiceId, paymentMethod, createdAt: day(date) },
    });

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: `Clinique compta auto ${Date.now()}`, type: "CLINIC" } })).id;
    user = (await prisma.user.create({ data: { email: `compta-${Date.now()}@test.local`, passwordHash: "x", firstName: "Test", lastName: "Compta", role: "COMPTABLE", organizationId: org } })).id;
  });
  afterAll(async () => {
    const entries = await prisma.accountingEntry.findMany({ where: { organizationId: org }, select: { id: true } });
    await prisma.accountingLine.deleteMany({ where: { organizationId: org } });
    await prisma.accountingEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
    await prisma.accountingCounter.deleteMany({ where: { organizationId: org } });
    await prisma.financialTransaction.updateMany({ where: { organizationId: org }, data: { absorbedByPurchaseId: null, reversalOfId: null } });
    await prisma.financialTransaction.deleteMany({ where: { organizationId: org } });
    await prisma.pendingInvoice.deleteMany({ where: { organizationId: org } });
    await prisma.user.delete({ where: { id: user } });
    await prisma.organization.delete({ where: { id: org } });
    await prisma.$disconnect();
  });

  it("ticket payé en deux fois (espèces puis Mobile Money) : vente au 1er règlement, créance = reste dû", async () => {
    const invoice = await prisma.pendingInvoice.create({
      data: {
        organizationId: org, patientId: null, createdById: user, status: "PARTIAL",
        items: [
          { type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 10000, amount: 10000 },
          { type: "PHARMACY", description: "Paracétamol", quantity: 10, unitPrice: 250, amount: 2500 },
        ],
      },
    });
    const p1 = await income(invoice.id, 5000, "2026-03-10");
    const p2 = await income(invoice.id, 3000, "2026-03-12", "MOBILE");
    await accountTransaction(p1.id);
    await accountTransaction(p2.id);
    const l = await lines();
    const d = dashboard(l, { from: "2026-03-01", to: "2026-03-31" });
    expect(d.revenue).toBe(12500); // le CA n'est compté qu'une fois, à la vente
    expect(d.cashIn).toBe(8000);
    expect(d.cash).toBe(5000);
    expect(d.mobileMoney).toBe(3000);
    expect(balance(l, "411")).toBe(4500);
    expect(balance(l, "7061")).toBe(-10000);
    expect(balance(l, "701")).toBe(-2500);

    // Règlement Mobile Money annulé dans MedDoc : la créance revient, la trésorerie baisse.
    await prisma.financialTransaction.update({ where: { id: p2.id }, data: { pendingInvoiceId: null, reversedAt: day("2026-03-13"), reversedFromInvoiceId: invoice.id } });
    const rev = await prisma.financialTransaction.create({
      data: { type: "EXPENSE", category: "REVERSAL", amount: 3000, description: "Annulation de règlement", recordedById: user, organizationId: org, reversalOfId: p2.id, reversedFromInvoiceId: invoice.id, createdAt: day("2026-03-13") },
    });
    await accountTransaction(rev.id);
    // Reste dû abandonné : passé en perte.
    await prisma.pendingInvoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED", closedAt: day("2026-03-20") } });
    await postInvoiceWriteOff(invoice.id);
    const after = await lines();
    expect(balance(after, "552")).toBe(0);
    expect(balance(after, "411")).toBe(0);
    expect(balance(after, "651")).toBe(7500);
  });

  it("dépense de caisse (électricité) : charge 6052, fournisseur réglé, caisse diminuée", async () => {
    const before = balance(await lines(), "571");
    const exp = await prisma.financialTransaction.create({
      data: { type: "EXPENSE", category: "OPERATIONAL_EXPENSE", amount: 2000, description: "Facture ENEO", recordedById: user, organizationId: org, paymentMethod: "CASH", expenseCategory: "electricity", createdAt: day("2026-03-15") },
    });
    await accountTransaction(exp.id);
    const l = await lines();
    expect(balance(l, "6052")).toBe(2000);
    expect(balance(l, "401")).toBe(0);
    expect(balance(l, "571")).toBe(before - 2000);
  });

  it("ticket supprimé après paiement : vente contrepassée, rien ne reste", async () => {
    const invoice = await prisma.pendingInvoice.create({
      data: { organizationId: org, createdById: user, status: "PAID", items: [{ type: "LAB", description: "Analyse : CRP", quantity: 1, unitPrice: 4500, amount: 4500 }] },
    });
    const pay = await income(invoice.id, 4500, "2026-04-02");
    await accountTransaction(pay.id);
    await prisma.financialTransaction.update({ where: { id: pay.id }, data: { pendingInvoiceId: null, reversedAt: day("2026-04-03"), reversedFromInvoiceId: invoice.id } });
    const rev = await prisma.financialTransaction.create({
      data: { type: "EXPENSE", category: "REVERSAL", amount: 4500, description: "Annulation", recordedById: user, organizationId: org, reversalOfId: pay.id, reversedFromInvoiceId: invoice.id, createdAt: day("2026-04-03") },
    });
    await accountTransaction(rev.id);
    await prisma.pendingInvoice.delete({ where: { id: invoice.id } });
    await reverseDeletedInvoiceSale(org, invoice.id);
    const l = await lines();
    // La contrepassation est datée du jour de la suppression : le CA de l'année revient à son niveau.
    const year = { from: "2026-01-01", to: "2026-12-31" };
    expect(dashboard(l, year).revenue).toBe(12500);
    expect(balance(l, "7062")).toBe(0);
  });

  it("vente sans ticket et ticket dont la ligne est restée à 0 : CA = encaissé, créance nulle", async () => {
    const before = await lines();
    const r411 = balance(before, "411");
    const r701 = balance(before, "701");
    const r7061 = balance(before, "7061");
    const direct = await prisma.financialTransaction.create({
      data: { type: "INCOME", category: "PHARMACY_SALE", amount: 125000, description: "gants", recordedById: user, organizationId: org, paymentMethod: "CASH", createdAt: day("2026-05-02") },
    });
    await accountTransaction(direct.id);
    const invoice = await prisma.pendingInvoice.create({
      data: { organizationId: org, patientId: null, createdById: user, status: "PAID", items: [{ type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 0, amount: 0 }] },
    });
    const pay = await income(invoice.id, 5000, "2026-05-03");
    await accountTransaction(pay.id);
    let l = await lines();
    expect(balance(l, "411")).toBe(r411);
    expect(balance(l, "701")).toBe(r701 - 125000);
    expect(balance(l, "7061")).toBe(r7061 - 5000);

    // Vente au comptant annulée : la vente est contrepassée.
    const rev = await prisma.financialTransaction.create({
      data: { type: "EXPENSE", category: "REVERSAL", amount: 125000, description: "Annulation", recordedById: user, organizationId: org, reversalOfId: direct.id, createdAt: day("2026-05-04") },
    });
    await accountTransaction(rev.id);
    l = await lines();
    expect(balance(l, "701")).toBe(r701);
    expect(balance(l, "411")).toBe(r411);
  });

  it("retrait saisi en « Autres charges » puis reclassé : prélèvement, puis versement en banque", async () => {
    const before = await lines();
    const year = { from: "2026-01-01", to: "2026-12-31" };
    const expensesBefore = dashboard(before, year).expenses;
    const cashInBefore = dashboard(before, year).cashIn;
    const cashBefore = balance(before, "571");
    const w = await prisma.financialTransaction.create({
      data: { type: "EXPENSE", category: "OPERATIONAL_EXPENSE", amount: 100000, description: "Retrait patron", recordedById: user, organizationId: org, paymentMethod: "CASH", expenseCategory: "other", createdAt: day("2026-06-10") },
    });
    await accountTransaction(w.id);
    expect(dashboard(await lines(), year).expenses).toBe(expensesBefore + 100000);

    await reclassifyExpense(w.id, "ownerDraw", user);
    let l = await lines();
    expect(dashboard(l, year).expenses).toBe(expensesBefore);
    expect(balance(l, "104")).toBe(100000);
    expect(balance(l, "401")).toBe(balance(before, "401"));
    expect(balance(l, "571")).toBe(cashBefore - 100000);

    await reclassifyExpense(w.id, "bankDeposit", user);
    l = await lines();
    expect(balance(l, "104")).toBe(0);
    expect(balance(l, "521")).toBe(100000);
    expect(balance(l, "581")).toBe(0);
    expect(dashboard(l, year).expenses).toBe(expensesBefore);
    expect(dashboard(l, year).cashIn).toBe(cashInBefore); // un versement en banque n'est pas une rentrée
    expect((await prisma.financialTransaction.findUnique({ where: { id: w.id } }))?.expenseCategory).toBe("bankDeposit");

    // Nouvelle saisie directement classée en retrait : pas de charge.
    const w2 = await prisma.financialTransaction.create({
      data: { type: "EXPENSE", category: "OPERATIONAL_EXPENSE", amount: 20000, description: "Avance Paul", recordedById: user, organizationId: org, paymentMethod: "CASH", expenseCategory: "salaryAdvance", createdAt: day("2026-06-11") },
    });
    await accountTransaction(w2.id);
    l = await lines();
    expect(balance(l, "421")).toBe(20000);
    expect(balance(l, "471")).toBe(balance(before, "471")); // inchangé : la sortie classée est soldée par son règlement
    expect(dashboard(l, year).expenses).toBe(expensesBefore);
  });

  it("achats de stock : pas de dette fournisseur (caisse, retrait rattaché, ou payé par le propriétaire)", async () => {
    const before = await lines();
    const purchase = (amount: number, extra: Record<string, unknown> = {}) =>
      prisma.financialTransaction.create({
        data: { type: "EXPENSE", category: "PHARMACY_PURCHASE", amount, description: "Achat pharmacie : Paracétamol", recordedById: user, organizationId: org, createdAt: day("2026-07-01"), ...extra },
      });
    // Financement externe (argent du propriétaire) : fournisseur soldé, apport du propriétaire.
    const external = await purchase(30000);
    await accountTransaction(external.id);
    // Payé en partie par un retrait déjà saisi (10 000), le reste par le propriétaire (5 000).
    const linked = await purchase(15000);
    const withdrawal = await prisma.financialTransaction.create({
      data: { type: "EXPENSE", category: "OPERATIONAL_EXPENSE", amount: 10000, description: "Retrait pour achat", recordedById: user, organizationId: org, paymentMethod: "CASH", absorbedByPurchaseId: linked.id, createdAt: day("2026-07-01") },
    });
    await accountTransaction(withdrawal.id);
    await accountTransaction(linked.id);
    const l = await lines();
    expect(balance(l, "401")).toBe(balance(before, "401"));
    expect(balance(l, "601") - balance(before, "601")).toBe(45000);
    expect(balance(l, "104") - balance(before, "104")).toBe(-35000);
    expect(balance(l, "571") - balance(before, "571")).toBe(-10000);
  });

  it("rattrapage : relancé deux fois, il ne crée rien de plus ; la balance reste équilibrée", async () => {
    const first = await syncAccounting(org);
    expect(first.errors).toEqual([]);
    const second = await syncAccounting(org);
    expect(second.created).toBe(0);
    expect(trialBalance(await lines(), { from: "2026-01-01", to: "2026-12-31" }).balanced).toBe(true);
  });

  it("lectures rapides (totaux agrégés par MongoDB) = calcul sur toutes les lignes", async () => {
    for (const period of [{ from: "2026-01-01", to: "2026-12-31" }, { from: "2026-03-12", to: "2026-05-02" }]) {
      const full = await loadReportLines(org, period.to);
      const totals = await loadAccountTotals(org, period);
      expect(dashboard(totals, period)).toEqual(dashboard(full, period));
      expect(trialBalance(totals, period)).toEqual(trialBalance(full, period));
      expect(balanceSheet(totals, period.to)).toEqual(balanceSheet(full, period.to));
      expect(incomeStatement(totals, period)).toEqual(incomeStatement(full, period));
      expect(await loadIntegrity(org, period.to)).toEqual(integrityChecks(full));
      const a = ledger(full, "5", period);
      const b = ledger(await loadAccountLines(org, "5", period.to), "5", period);
      expect([b.opening, b.closing, b.rows.length]).toEqual([a.opening, a.closing, a.rows.length]);
    }
  });
});
