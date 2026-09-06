import { describe, it, expect, vi, beforeEach } from "vitest";

// src/actions/stock.ts importe @/lib/db au niveau module (transitivement via
// @/lib/auth, @/lib/permissions et @/middlewares/auditLogger). On le mocke
// pour éviter d'instancier un vrai PrismaClient et de déclencher le
// planificateur en arrière-plan (src/lib/db.ts) pendant les tests —
// consumeStockLots n'utilise de toute façon que le paramètre `tx` injecté.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { consumeStockLots, applyStockReceipt } = await import("./stock");

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

// applyStockReceipt ne lit que le paramètre `tx` injecté (jamais le `prisma` de module),
// donc réutilise directement l'import statique du haut de fichier — pas besoin de
// vi.resetModules()/vi.doMock ici.
describe("applyStockReceipt — décaissement conditionnel", () => {
  function createFakeReceiptTx() {
    return {
      stockPurchase: { create: vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data })) },
      pharmacyItem: { update: vi.fn(async () => ({})) },
      financialTransaction: { create: vi.fn(async ({ data }: any) => ({ id: "tx1", ...data })) },
    };
  }

  it("ne pose pas cashSessionId sur la FinancialTransaction quand aucune session n'est fournie (comportement actuel inchangé)", async () => {
    const tx = createFakeReceiptTx();

    await applyStockReceipt(tx, {
      pharmacyItemId: "item1",
      itemName: "Paracétamol",
      quantity: 10,
      purchasePrice: 300,
      purchasedById: "user1",
      organizationId: "org1",
    });

    const [[{ data }]] = tx.financialTransaction.create.mock.calls;
    expect("cashSessionId" in data).toBe(false);
  });

  it("pose cashSessionId sur la FinancialTransaction quand une session est fournie", async () => {
    const tx = createFakeReceiptTx();

    await applyStockReceipt(tx, {
      pharmacyItemId: "item1",
      itemName: "Paracétamol",
      quantity: 10,
      purchasePrice: 300,
      purchasedById: "user1",
      organizationId: "org1",
      cashSessionId: "sess1",
    });

    const [[{ data }]] = tx.financialTransaction.create.mock.calls;
    expect(data.cashSessionId).toBe("sess1");
  });
});

describe("recordStockPurchase — deductFromCash", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    // assertStockWrite appelle requirePermission (@/lib/permissions), qui lit
    // prisma.permission en base — non pertinent pour ces tests, on le neutralise.
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("refuse une session de caisse fermée", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "CLOSED", organizationId: "org1" })) },
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      cashSessionId: "sess1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Aucune session de caisse ouverte/);
  });

  it("refuse une session de caisse appartenant à un autre établissement", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org-autre-clinique" })) },
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      organizationId: "org1",
      cashSessionId: "sess1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à l'établissement/);
  });

  it("décaisse correctement une session ouverte du même établissement", async () => {
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol" })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { create: vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data })) },
      financialTransaction: { create: financialTransactionCreate },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      cashSessionId: "sess1",
    });

    expect(result.success).toBe(true);
    expect(financialTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cashSessionId: "sess1" }) })
    );
  });

  it("n'impacte aucune caisse quand cashSessionId est omis (comportement actuel inchangé)", async () => {
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol" })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { create: vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data })) },
      financialTransaction: { create: financialTransactionCreate },
    };
    const cashSessionFindUnique = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: { findUnique: cashSessionFindUnique },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
    });

    expect(result.success).toBe(true);
    expect(cashSessionFindUnique).not.toHaveBeenCalled();
    const [[{ data }]] = financialTransactionCreate.mock.calls;
    expect("cashSessionId" in data).toBe(false);
  });
});
