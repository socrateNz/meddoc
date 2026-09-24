import { describe, it, expect, vi, beforeEach } from "vitest";

// Blocage d'un produit par le coordinateur (cf. src/lib/pharmacy-sale-block.ts) : il ne peut plus
// être commandé à un fournisseur, ni réceptionné, même sur une commande passée avant le blocage.
describe("purchase-orders — produit bloqué par le coordinateur", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };
  const blockedItem = {
    id: "item1",
    name: "Amoxicilline",
    dosage: "500mg",
    saleBlockedAt: new Date(),
    saleBlockedReason: "Rappel de lot",
  };

  let applyStockReceipt: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    applyStockReceipt = vi.fn(async () => ({}));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
    // stock.ts est lourd et déjà testé à part : seules ces trois fonctions sont utilisées ici.
    vi.doMock("@/actions/stock", () => ({
      assertStockRead: vi.fn(async () => {}),
      assertStockWrite: vi.fn(async () => {}),
      applyStockReceipt,
    }));
  });

  describe("createPurchaseOrder", () => {
    it("refuse une commande contenant un produit bloqué, sans créer la commande", async () => {
      const purchaseOrderCreate = vi.fn();
      vi.doMock("@/lib/db", () => ({
        prisma: {
          pharmacyItem: { findMany: vi.fn(async () => [blockedItem]) },
          purchaseOrder: { create: purchaseOrderCreate },
        },
      }));
      const { createPurchaseOrder } = await import("./purchase-orders");

      const result = await createPurchaseOrder({
        supplierId: "sup1",
        lines: [
          { pharmacyItemId: "item0", quantityOrdered: 5, unitCost: 100 },
          { pharmacyItemId: "item1", quantityOrdered: 10, unitCost: 350 },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Commande impossible/);
      expect(result.error).toMatch(/Amoxicilline \(500mg\)/);
      expect(result.error).toMatch(/Rappel de lot/);
      expect(purchaseOrderCreate).not.toHaveBeenCalled();
    });

    it("accepte une commande dont aucun produit n'est bloqué", async () => {
      const purchaseOrderCreate = vi.fn(async ({ data }: any) => ({ id: "po1", ...data }));
      vi.doMock("@/lib/db", () => ({
        prisma: {
          pharmacyItem: { findMany: vi.fn(async () => [{ ...blockedItem, saleBlockedAt: null, saleBlockedReason: null }]) },
          purchaseOrder: { create: purchaseOrderCreate },
        },
      }));
      const { createPurchaseOrder } = await import("./purchase-orders");

      const result = await createPurchaseOrder({
        supplierId: "sup1",
        lines: [{ pharmacyItemId: "item1", quantityOrdered: 10, unitCost: 350 }],
      });

      expect(result.success).toBe(true);
      expect(purchaseOrderCreate).toHaveBeenCalledTimes(1);
    });

    it("ne vérifie rien (aucune requête) quand la commande ne contient que de nouveaux produits", async () => {
      const findMany = vi.fn(async () => []);
      vi.doMock("@/lib/db", () => ({
        prisma: {
          pharmacyItem: { findMany },
          purchaseOrder: { create: vi.fn(async ({ data }: any) => ({ id: "po1", ...data })) },
        },
      }));
      const { createPurchaseOrder } = await import("./purchase-orders");

      const result = await createPurchaseOrder({
        supplierId: "sup1",
        lines: [{ newItemName: "Compresses stériles", quantityOrdered: 10, unitCost: 350 }],
      });

      expect(result.success).toBe(true);
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe("receivePurchaseOrderLines", () => {
    const order = {
      id: "po1",
      status: "SENT",
      organizationId: "org1",
      receivedAt: null,
      supplier: { name: "Pharma SA" },
      lines: [{ id: "line1", pharmacyItemId: "item1", newItemName: null, quantityOrdered: 10, quantityReceived: 0, unitCost: 350 }],
    };

    function mockDb(item: unknown) {
      const lineUpdate = vi.fn();
      const tx = {
        pharmacyItem: { findUnique: vi.fn(async () => item) },
        purchaseOrderLine: { update: lineUpdate, findMany: vi.fn(async () => []) },
        purchaseOrder: { update: vi.fn() },
      };
      vi.doMock("@/lib/db", () => ({
        prisma: {
          purchaseOrder: { findUnique: vi.fn(async () => order) },
          $transaction: vi.fn(async (fn: any) => fn(tx)),
        },
      }));
      return { lineUpdate, tx };
    }

    it("refuse de réceptionner un produit bloqué depuis la commande, sans faire entrer de stock", async () => {
      const { lineUpdate } = mockDb(blockedItem);
      const { receivePurchaseOrderLines } = await import("./purchase-orders");

      const result = await receivePurchaseOrderLines("po1", [{ lineId: "line1", quantityReceived: 10 }]);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Achat impossible/);
      expect(result.error).toMatch(/Rappel de lot/);
      expect(applyStockReceipt).not.toHaveBeenCalled();
      expect(lineUpdate).not.toHaveBeenCalled();
    });

    it("réceptionne normalement un produit non bloqué", async () => {
      const { lineUpdate } = mockDb({ ...blockedItem, saleBlockedAt: null, saleBlockedReason: null });
      const { receivePurchaseOrderLines } = await import("./purchase-orders");

      const result = await receivePurchaseOrderLines("po1", [{ lineId: "line1", quantityReceived: 10 }]);

      expect(result.success).toBe(true);
      expect(applyStockReceipt).toHaveBeenCalledTimes(1);
      expect(lineUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
