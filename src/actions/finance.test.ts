import { describe, it, expect, vi, beforeEach } from "vitest";

const activeUser = { id: "user1", role: "CASHIER", organizationId: "org1" };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: vi.fn(async () => activeUser),
  }));
});

describe("payPendingInvoice", () => {
  it("encaisse une facture en attente sans toucher au stock", async () => {
    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    const labOrderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const pharmacyItemUpdate = vi.fn(async () => ({}));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", patientId: "p1", organizationId: "org1" })),
          update: pendingInvoiceUpdate,
        },
        cashSession: {
          findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })),
        },
        financialTransaction: {
          create: vi.fn(async ({ data }: any) => ({ id: "tx1", ...data })),
        },
        pharmacyItem: { update: pharmacyItemUpdate },
        labOrder: { updateMany: labOrderUpdateMany },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", [
      { type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 0, amount: 0 },
    ]);

    expect(result.success).toBe(true);
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ status: "PAID", cashSessionId: "sess1" }) })
    );
    expect(labOrderUpdateMany).toHaveBeenCalledWith({
      where: { pendingInvoiceId: "inv1", paymentStatus: "PENDING" },
      data: { paymentStatus: "PAID" },
    });
    expect(pharmacyItemUpdate).not.toHaveBeenCalled();
  });

  it("refuse d'encaisser sans session de caisse ouverte", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", patientId: "p1", organizationId: "org1" })),
        },
        cashSession: {
          findUnique: vi.fn(async () => null),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", [
      { type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 1000, amount: 1000 },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Aucune session de caisse ouverte/);
  });

  it("refuse de régler une facture déjà réglée", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PAID" })),
        },
        cashSession: {
          findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", []);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'existe plus ou a déjà été réglée/);
  });
});

describe("dispensePendingInvoice", () => {
  it("décrémente le stock et passe la facture à DISPENSED pour un PHARMACIST", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pharmacyItemUpdate = vi.fn(async () => ({}));
    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    const stockPurchaseFindMany = vi.fn(async () => []);

    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })),
        update: pharmacyItemUpdate,
      },
      stockPurchase: { findMany: stockPurchaseFindMany },
      pendingInvoice: { update: pendingInvoiceUpdate },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PAID",
            organizationId: "org1",
            items: [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
            prescriptions: [],
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // "inv1" tient déjà en 6 caractères : la référence attendue est son propre id en majuscules.
    const result = await dispensePendingInvoice("inv1", "INV1");

    expect(result.success).toBe(true);
    expect(pharmacyItemUpdate).toHaveBeenCalledWith({
      where: { id: "item1" },
      data: { stockQuantity: { decrement: 2 } },
    });
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ status: "DISPENSED" }) })
    );
  });

  it("refuse un COORDINATOR — la remise en pharmacie est réservée aux pharmacien(ne)s", async () => {
    const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
    vi.doMock("@/lib/db", () => ({ prisma: {} }));

    const { dispensePendingInvoice } = await import("./finance");
    const result = await dispensePendingInvoice("inv1", "INV1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pharmacien/i);
  });

  it("refuse de dispenser une facture pas encore payée", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1", items: [], prescriptions: [] })),
        },
      },
    }));

    const { dispensePendingInvoice } = await import("./finance");
    const result = await dispensePendingInvoice("inv1", "INV1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pas encore réglée/);
  });

  it("refuse de dispenser si la référence saisie ne correspond pas au ticket (sans toucher au stock)", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const transactionFn = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PAID",
            organizationId: "org1",
            items: [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
            prescriptions: [],
          })),
        },
        $transaction: transactionFn,
      },
    }));

    const { dispensePendingInvoice } = await import("./finance");
    const result = await dispensePendingInvoice("inv1", "WRONG1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Référence incorrecte/);
    expect(transactionFn).not.toHaveBeenCalled();
  });
});
