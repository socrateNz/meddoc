import { describe, it, expect, vi, beforeEach } from "vitest";

// Cliniques partenaires : vente à crédit au 4111 à la demande, contrepassation à l'annulation,
// règlement D 5xx / C 4111.
const db = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  settlement: null as Record<string, unknown> | null,
  sale: null as Record<string, unknown> | null,
}));
const engine = vi.hoisted(() => ({
  postEntry: vi.fn(async (input: Record<string, unknown>) => ({ created: true, entry: { id: "e1", ...input } })),
  reverseEntry: vi.fn(async () => ({ created: true })),
}));

vi.mock("@/lib/modules-server", () => ({ getOrganizationModules: vi.fn(async () => ["COMPTABILITE"]) }));
vi.mock("./engine", () => engine);
vi.mock("@/lib/db", () => ({
  prisma: {
    labOrder: { findUnique: vi.fn(async () => db.order) },
    partnerSettlement: { findFirst: vi.fn(async () => db.settlement) },
    accountingEntry: { findFirst: vi.fn(async () => db.sale) },
    financialTransaction: {
      findUnique: vi.fn(async () => ({
        id: "tx1",
        type: "INCOME",
        category: "LAB_EXAM_FEE",
        amount: 30000,
        description: "Règlement partenaire",
        organizationId: "org1",
        patientId: null,
        pendingInvoiceId: null,
        reversedFromInvoiceId: null,
        reversalOfId: null,
        cashSessionId: null,
        absorbedByPurchaseId: null,
        stockPurchaseId: null,
        paymentMethod: "TRANSFER",
        expenseCategory: null,
        recordedById: "u1",
        createdAt: new Date("2026-11-30T10:00:00Z"),
      })),
    },
  },
}));

const { postPartnerLabSale, reversePartnerLabSale, accountTransaction, partnerOrderTotal } = await import("./postings");

beforeEach(() => {
  engine.postEntry.mockClear();
  engine.reverseEntry.mockClear();
  db.order = null;
  db.settlement = null;
  db.sale = null;
});

describe("examens facturés à un partenaire", () => {
  it("passe la vente à crédit D 4111 (tiers partenaire) / C 7062 pour le total figé à la demande", async () => {
    db.order = {
      id: "65a000000000000000abc123",
      organizationId: "org1",
      partnerId: "pa1",
      pendingInvoiceId: null,
      testDetails: [{ totalPrice: 3500 }, { totalPrice: 5000 }],
      createdAt: new Date("2026-11-03T09:00:00Z"),
      orderedById: "lab1",
      partner: { name: "La Plénitude" },
    };
    await postPartnerLabSale("o1");
    expect(engine.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        journal: "VE",
        sourceType: "PARTNER_LAB_ORDER",
        label: expect.stringMatching(/La Plénitude/),
        lines: [
          { account: "4111", debit: 8500, customerId: "pa1" },
          { account: "7062", credit: 8500 },
        ],
      })
    );
  });

  it("ne passe rien pour une demande avec ticket de caisse (déjà vendue par le ticket) ni sans montant", async () => {
    db.order = { id: "o1", organizationId: "org1", partnerId: "pa1", pendingInvoiceId: "inv1", testDetails: [{ totalPrice: 1000 }], createdAt: new Date(), partner: { name: "X" } };
    expect(await postPartnerLabSale("o1")).toBeNull();
    db.order = { id: "o1", organizationId: "org1", partnerId: "pa1", pendingInvoiceId: null, testDetails: [], createdAt: new Date(), partner: { name: "X" } };
    expect(await postPartnerLabSale("o1")).toBeNull();
    expect(engine.postEntry).not.toHaveBeenCalled();
    expect(partnerOrderTotal([{ totalPrice: "1200" }, { totalPrice: -5 }])).toBe(1200);
  });

  it("contrepasse la vente d'une demande annulée", async () => {
    db.sale = { id: "sale1" };
    await reversePartnerLabSale("org1", "o1");
    expect(engine.reverseEntry).toHaveBeenCalledWith("sale1", expect.objectContaining({ sourceType: "PARTNER_LAB_ORDER_CANCELLED" }));
  });
});

describe("règlement d'un partenaire", () => {
  it("solde la créance : D 521 (virement) / C 4111 au nom du partenaire", async () => {
    db.settlement = { partnerId: "pa1", month: "2026-11", reference: "VIR-42", partner: { name: "La Plénitude" } };
    await accountTransaction("tx1");
    expect(engine.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        journal: "TR",
        sourceType: "PAYMENT",
        sourceId: "tx1",
        label: expect.stringMatching(/La Plénitude — relevé 2026-11/),
        lines: [
          { account: "521", debit: 30000 },
          { account: "4111", credit: 30000, customerId: "pa1" },
        ],
      })
    );
  });
});
