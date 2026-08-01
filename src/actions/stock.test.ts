import { describe, it, expect, vi } from "vitest";

// src/actions/stock.ts importe @/lib/db au niveau module (transitivement via
// @/lib/auth, @/lib/permissions et @/middlewares/auditLogger). On le mocke
// pour éviter d'instancier un vrai PrismaClient et de déclencher le
// planificateur en arrière-plan (src/lib/db.ts) pendant les tests —
// consumeStockLots n'utilise de toute façon que le paramètre `tx` injecté.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { consumeStockLots } = await import("./stock");

interface FakeLot {
  id: string;
  remainingQuantity: number;
  purchasePrice: number;
}

// Simule un client Prisma transactionnel limité aux deux méthodes utilisées par
// consumeStockLots. findMany renvoie les lots déjà dans l'ordre FEFO attendu
// (le tri lui-même est une responsabilité de la requête Prisma réelle ; ce
// test se concentre sur la logique de consommation/valorisation).
function createFakeTx(initialLots: FakeLot[]) {
  const lots = initialLots.map((l) => ({ ...l }));
  return {
    tx: {
      stockPurchase: {
        findMany: vi.fn(async () => lots.filter((l) => l.remainingQuantity > 0)),
        update: vi.fn(async ({ where, data }: any) => {
          const lot = lots.find((l) => l.id === where.id);
          if (lot && data.remainingQuantity?.decrement !== undefined) {
            lot.remainingQuantity -= data.remainingQuantity.decrement;
          }
          return lot;
        }),
      },
    },
    lots,
  };
}

describe("consumeStockLots", () => {
  it("consumes a single lot that fully covers the requested quantity", async () => {
    const { tx, lots } = createFakeTx([{ id: "lot1", remainingQuantity: 20, purchasePrice: 400 }]);

    const result = await consumeStockLots(tx, "item1", 5);

    expect(result).toEqual({ consumedCost: 2000, unmatchedQuantity: 0 });
    expect(lots[0].remainingQuantity).toBe(15);
  });

  it("consumes across multiple lots in the order returned (FEFO), valuing each portion at its own price", async () => {
    const { tx, lots } = createFakeTx([
      { id: "lot-expiring-soon", remainingQuantity: 3, purchasePrice: 400 },
      { id: "lot-expiring-later", remainingQuantity: 20, purchasePrice: 450 },
    ]);

    const result = await consumeStockLots(tx, "item1", 8);

    // 3 unités à 400 (lot 1, épuisé) + 5 unités à 450 (lot 2)
    expect(result.consumedCost).toBe(3 * 400 + 5 * 450);
    expect(result.unmatchedQuantity).toBe(0);
    expect(lots[0].remainingQuantity).toBe(0);
    expect(lots[1].remainingQuantity).toBe(15);
  });

  it("reports the unmatched quantity when the lots don't cover the request", async () => {
    const { tx, lots } = createFakeTx([{ id: "lot1", remainingQuantity: 4, purchasePrice: 400 }]);

    const result = await consumeStockLots(tx, "item1", 10);

    expect(result.consumedCost).toBe(4 * 400);
    expect(result.unmatchedQuantity).toBe(6);
    expect(lots[0].remainingQuantity).toBe(0);
  });

  it("does nothing when the requested quantity is zero", async () => {
    const { tx, lots } = createFakeTx([{ id: "lot1", remainingQuantity: 10, purchasePrice: 400 }]);

    const result = await consumeStockLots(tx, "item1", 0);

    expect(result).toEqual({ consumedCost: 0, unmatchedQuantity: 0 });
    expect(lots[0].remainingQuantity).toBe(10);
    expect(tx.stockPurchase.update).not.toHaveBeenCalled();
  });
});
