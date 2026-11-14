import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/modules-server", () => ({ getOrganizationModules: vi.fn(async () => []) }));

const { natureOfItem, natureOfPayment, saleLines, treasuryAccount, expenseAccounts, classificationEntry } = await import("./postings");

describe("nature comptable des lignes de ticket", () => {
  it("pharmacie → 701, labo → actes, hospitalisation → 7063, consultation → 7061", () => {
    expect(natureOfItem({ type: "PHARMACY", amount: 1 })).toBe("PHARMACY");
    expect(natureOfItem({ type: "LAB", description: "Analyse : NFS", amount: 1 })).toBe("ACT");
    expect(natureOfItem({ type: "SERVICE", description: "Hospitalisation — Médecine / Ch. 101 (lit A) — 3 nuitées", amount: 1 })).toBe("HOSPITALIZATION");
    expect(natureOfItem({ type: "SERVICE", description: "Frais de consultation", amount: 1 })).toBe("CONSULTATION");
    expect(natureOfItem({ type: "SERVICE", description: "Imagerie : Radiographie du thorax", amount: 1 })).toBe("ACT");
  });
});

describe("écriture de vente d'un ticket", () => {
  it("D 411 du total, C produits par nature, équilibrée", () => {
    const lines = saleLines(
      [
        { type: "SERVICE", description: "Frais de consultation", amount: 10000 },
        { type: "PHARMACY", description: "Paracétamol", amount: 600 },
        { type: "LAB", description: "Analyse : NFS", amount: "5000" },
        { type: "SERVICE", description: "Remise", amount: 0 },
      ],
      "patient1"
    );
    expect(lines).toEqual([
      { account: "411", debit: 15600, customerId: "patient1" },
      { account: "7061", credit: 10000 },
      { account: "701", credit: 600 },
      { account: "7062", credit: 5000 },
    ]);
  });
  it("ticket à 0 : aucune écriture", () => {
    expect(saleLines([{ type: "SERVICE", description: "Frais de consultation", amount: 0 }], null)).toEqual([]);
  });
  it("encaissé supérieur au facturé (ligne restée à 0) : la vente couvre l'encaissé, la créance n'est jamais négative", () => {
    expect(saleLines([{ type: "SERVICE", description: "Frais de consultation", amount: 0 }], "p1", 5000, "CONSULTATION")).toEqual([
      { account: "411", debit: 5000, customerId: "p1" },
      { account: "7061", credit: 5000 },
    ]);
    expect(saleLines([{ type: "PHARMACY", description: "Paracétamol", amount: 1000 }], "p1", 1500, "PHARMACY")).toEqual([
      { account: "411", debit: 1500, customerId: "p1" },
      { account: "701", credit: 1500 },
    ]);
    // Paiement partiel : la vente reste au montant facturé.
    expect(saleLines([{ type: "PHARMACY", description: "Paracétamol", amount: 1800 }], "p1", 1799, "PHARMACY")[0]).toEqual({ account: "411", debit: 1800, customerId: "p1" });
  });
  it("nature d'un encaissement sans ticket : par sa catégorie", () => {
    expect(natureOfPayment("PHARMACY_SALE", "gants")).toBe("PHARMACY");
    expect(natureOfPayment("LAB_EXAM_FEE", "NFS")).toBe("ACT");
    expect(natureOfPayment("SERVICE_FEE", "Frais de consultation")).toBe("CONSULTATION");
    expect(natureOfPayment("OTHER", "divers")).toBe("ACCESSORY");
  });
});

describe("comptes de trésorerie et de charges", () => {
  it("moyen de paiement → 571 / 552 / 521 / 513, espèces par défaut", () => {
    expect(treasuryAccount("CASH")).toBe("571");
    expect(treasuryAccount("MOBILE")).toBe("552");
    expect(treasuryAccount("TRANSFER")).toBe("521");
    expect(treasuryAccount("CHEQUE")).toBe("513");
    expect(treasuryAccount(null)).toBe("571");
  });
  it("catégorie de dépense → compte de charge et contrepartie ; « autres » par défaut", () => {
    expect(expenseAccounts("electricity")).toMatchObject({ account: "6052", counterpart: "401" });
    expect(expenseAccounts("salaries")).toMatchObject({ account: "661", counterpart: "422" });
    expect(expenseAccounts(undefined)).toMatchObject({ account: "658", counterpart: "401" });
  });
  it("retraits qui ne sont pas des charges : hors classe 6, via le compte d'attente 471", () => {
    expect(expenseAccounts("ownerDraw")).toEqual({ account: "104", counterpart: "471", charge: false, transfer: false });
    expect(classificationEntry("ownerDraw", 50000, "471")).toEqual({ journal: "OD", lines: [{ account: "104", debit: 50000 }, { account: "471", credit: 50000 }] });
    expect(classificationEntry("electricity", 2000, "401")).toEqual({ journal: "AC", lines: [{ account: "6052", debit: 2000 }, { account: "401", credit: 2000 }] });
    // Versement en banque : virement interne par 581.
    expect(classificationEntry("bankDeposit", 100000, "471")?.lines).toEqual([
      { account: "581", debit: 100000 },
      { account: "471", credit: 100000 },
      { account: "521", debit: 100000 },
      { account: "581", credit: 100000 },
    ]);
  });
});
