import { describe, it, expect, vi, beforeEach } from "vitest";

// Correction du stock et du prix d'achat depuis la fiche d'un produit.
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "ph1", role: "PHARMACIST", organizationId: "org1", organization: { type: "CLINIC" } }) }));

function setup(opts: { inventoryInProgress?: boolean; lotsRemaining?: number; stale?: string[] } = {}) {
  const lotUpdateMany = vi.fn(async () => ({ count: 2 }));
  const lotCreate = vi.fn(async () => ({}));
  const start = vi.fn(async () => ({ success: true, data: { id: "inv1", lines: [{ id: "line1", pharmacyItemId: "item1" }] } }));
  const save = vi.fn(async () => ({ success: true }));
  const complete = vi.fn(async () => ({ success: true, data: { staleProducts: opts.stale ?? [] } }));
  const cancel = vi.fn(async () => ({ success: true }));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/org-scope", () => ({ resolveTargetOrgId: async () => "org1", assertOrganizationAccess: vi.fn() }));
  vi.doMock("@/actions/stock", () => ({
    assertStockWrite: vi.fn(),
    getItemUnitCostMap: vi.fn(async () => new Map()),
    startInventoryCount: start,
    saveInventoryCounts: save,
    completeInventoryCount: complete,
    cancelInventoryCount: cancel,
  }));
  const prisma: any = {
    pharmacyItem: { findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", organizationId: "org1", stockQuantity: 50 })) },
    inventoryCount: { findFirst: vi.fn(async () => (opts.inventoryInProgress ? { id: "manual" } : null)) },
    stockPurchase: {
      updateMany: lotUpdateMany,
      aggregate: vi.fn(async () => ({ _sum: { remainingQuantity: opts.lotsRemaining ?? 50 } })),
      create: lotCreate,
    },
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  vi.doMock("@/lib/db", () => ({ prisma }));
  return { lotUpdateMany, lotCreate, start, save, complete, cancel };
}

beforeEach(() => {
  vi.resetModules();
});

describe("adjustPharmacyItemStock", () => {
  it("applique la nouvelle quantité par un inventaire automatique", async () => {
    const m = setup();
    const { adjustPharmacyItemStock } = await import("./finance");

    const res = await adjustPharmacyItemStock({ id: "item1", stockQuantity: 42 });

    expect(res).toMatchObject({ success: true, data: { stockChanged: true, revalued: false } });
    expect(m.save).toHaveBeenCalledWith("inv1", [{ lineId: "line1", countedQuantity: 42 }]);
    expect(m.complete).toHaveBeenCalledWith("inv1");
    expect(m.lotUpdateMany).not.toHaveBeenCalled();
  });

  it("réévalue le stock restant au nouveau prix d'achat et donne un lot au stock sans prix", async () => {
    const m = setup({ lotsRemaining: 30 });
    const { adjustPharmacyItemStock } = await import("./finance");

    const res = await adjustPharmacyItemStock({ id: "item1", purchasePrice: 250 });

    expect(res).toMatchObject({ success: true, data: { revalued: true, stockChanged: false } });
    expect(m.lotUpdateMany).toHaveBeenCalledWith({ where: { pharmacyItemId: "item1", remainingQuantity: { gt: 0 } }, data: { purchasePrice: 250 } });
    expect(m.lotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantity: 20, remainingQuantity: 20, purchasePrice: 250, totalCost: 5000, batchNumber: "AJUSTEMENT-COUT" }),
    });
    expect(m.start).not.toHaveBeenCalled();
  });

  it("refuse une correction de quantité pendant un inventaire manuel, sans rien écrire", async () => {
    const m = setup({ inventoryInProgress: true });
    const { adjustPharmacyItemStock } = await import("./finance");

    const res = await adjustPharmacyItemStock({ id: "item1", stockQuantity: 10, purchasePrice: 300 });

    expect(res.success ? "" : res.error).toMatch(/inventaire est en cours/);
    expect(m.lotUpdateMany).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it("signale un stock qui a bougé pendant la correction", async () => {
    setup({ stale: ["Paracétamol"] });
    const { adjustPharmacyItemStock } = await import("./finance");
    const res = await adjustPharmacyItemStock({ id: "item1", stockQuantity: 10 });
    expect(res.success ? "" : res.error).toMatch(/a bougé/);
  });
});
