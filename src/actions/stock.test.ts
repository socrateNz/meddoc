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

describe("recordStockPurchase — linkedExpenseTransactionId (retrait absorbé)", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("refuse de fournir à la fois cashSessionId et linkedExpenseTransactionId", async () => {
    vi.doMock("@/lib/db", () => ({ prisma: {} }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      cashSessionId: "sess1",
      linkedExpenseTransactionId: "expense1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ne peut pas à la fois/);
  });

  it("refuse un retrait introuvable", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: { financialTransaction: { findUnique: vi.fn(async () => null) } },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      linkedExpenseTransactionId: "expense1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/introuvable/);
  });

  it("refuse un retrait qui n'est pas une dépense opérationnelle (ex: déjà un autre achat pharmacie)", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findUnique: vi.fn(async () => ({ id: "expense1", type: "EXPENSE", category: "PHARMACY_PURCHASE", organizationId: "org1" })),
        },
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      linkedExpenseTransactionId: "expense1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/introuvable/);
  });

  it("refuse un retrait d'un autre établissement", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findUnique: vi.fn(async () => ({ id: "expense1", type: "EXPENSE", category: "OPERATIONAL_EXPENSE", organizationId: "org-autre" })),
        },
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      organizationId: "org1",
      linkedExpenseTransactionId: "expense1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à l'établissement/);
  });

  it("refuse un retrait déjà utilisé pour régler un autre achat", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findUnique: vi.fn(async () => ({
            id: "expense1",
            type: "EXPENSE",
            category: "OPERATIONAL_EXPENSE",
            organizationId: "org1",
            absorbedByPurchaseId: "already-used-tx",
          })),
        },
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      organizationId: "org1",
      linkedExpenseTransactionId: "expense1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà été utilisé/);
  });

  it("réclame le retrait (absorbedByPurchaseId posé sur la dépense) quand tout est valide", async () => {
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "purchase-tx1", ...data }));
    const financialTransactionUpdateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol" })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { create: vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data })) },
      financialTransaction: { create: financialTransactionCreate, updateMany: financialTransactionUpdateMany },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findUnique: vi.fn(async () => ({ id: "expense1", type: "EXPENSE", category: "OPERATIONAL_EXPENSE", organizationId: "org1", absorbedByPurchaseId: null })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      organizationId: "org1",
      linkedExpenseTransactionId: "expense1",
    });

    expect(result.success).toBe(true);
    expect(financialTransactionUpdateMany).toHaveBeenCalledWith({
      where: { id: "expense1", absorbedByPurchaseId: null },
      data: { absorbedByPurchaseId: "purchase-tx1" },
    });
  });

  it("échoue si un autre achat a réclamé le retrait entre-temps (course évitée par updateMany conditionnel)", async () => {
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol" })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { create: vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data })) },
      financialTransaction: {
        create: vi.fn(async ({ data }: any) => ({ id: "purchase-tx1", ...data })),
        // Simule qu'un autre achat a déjà réclamé ce retrait juste avant.
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findUnique: vi.fn(async () => ({ id: "expense1", type: "EXPENSE", category: "OPERATIONAL_EXPENSE", organizationId: "org1", absorbedByPurchaseId: null })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 300,
      organizationId: "org1",
      linkedExpenseTransactionId: "expense1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà été utilisé/);
  });
});

describe("recordStockPurchase — prix d'achat optionnel pour un produit existant", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("reprend le dernier prix d'achat connu quand purchasePrice est omis pour un produit existant", async () => {
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));
    const stockPurchaseCreate = vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data }));
    const stockPurchaseFindFirst = vi.fn(async () => ({ id: "old-lot", purchasePrice: 275 }));
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol" })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { create: stockPurchaseCreate, findFirst: stockPurchaseFindFirst },
      financialTransaction: { create: financialTransactionCreate },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: { $transaction: vi.fn(async (fn: any) => fn(tx)) },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      // purchasePrice volontairement omis
    });

    expect(result.success).toBe(true);
    expect(stockPurchaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pharmacyItemId: "item1" }, orderBy: { createdAt: "desc" } })
    );
    expect(stockPurchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purchasePrice: 275, totalCost: 2750 }) })
    );
  });

  it("refuse un produit existant sans prix saisi ET sans aucun historique d'achat", async () => {
    const tx = {
      pharmacyItem: { findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol" })) },
      stockPurchase: { findFirst: vi.fn(async () => null) },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: { $transaction: vi.fn(async (fn: any) => fn(tx)) },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Aucun historique d'achat/);
  });

  it("utilise le prix saisi plutôt que l'historique quand purchasePrice est explicitement fourni", async () => {
    const stockPurchaseCreate = vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data }));
    const stockPurchaseFindFirst = vi.fn(async () => ({ id: "old-lot", purchasePrice: 275 }));
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol" })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { create: stockPurchaseCreate, findFirst: stockPurchaseFindFirst },
      financialTransaction: { create: vi.fn(async ({ data }: any) => ({ id: "tx1", ...data })) },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: { $transaction: vi.fn(async (fn: any) => fn(tx)) },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({
      pharmacyItemId: "item1",
      quantity: 10,
      purchasePrice: 350,
    });

    expect(result.success).toBe(true);
    expect(stockPurchaseFindFirst).not.toHaveBeenCalled();
    expect(stockPurchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purchasePrice: 350 }) })
    );
  });
});

describe("saveInventoryCounts — rafraîchit systemQuantity au moment du comptage", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("fige systemQuantity à la valeur actuelle du stock au moment de l'enregistrement, pas celle figée au démarrage", async () => {
    const updateCall = vi.fn(async ({ data }: any) => ({ ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "IN_PROGRESS",
            // systemQuantity figé au démarrage (6), potentiellement obsolète.
            lines: [{ id: "line1", pharmacyItemId: "item1", systemQuantity: 6, countedQuantity: null }],
          })),
        },
        // Un ravitaillement de +10 a été reçu depuis le démarrage : stock réel maintenant 16.
        pharmacyItem: { findMany: vi.fn(async () => [{ id: "item1", stockQuantity: 16 }]) },
        inventoryCountLine: { update: updateCall },
        $transaction: vi.fn(async (arr: any[]) => Promise.all(arr)),
      },
    }));
    const { saveInventoryCounts } = await import("./stock");

    const result = await saveInventoryCounts("inv1", [{ lineId: "line1", countedQuantity: 16 }]);

    expect(result.success).toBe(true);
    expect(updateCall).toHaveBeenCalledWith({
      where: { id: "line1" },
      data: { countedQuantity: 16, systemQuantity: 16 },
    });
  });
});

describe("getActiveInventoryCount — rattrapage des produits ajoutés après le démarrage", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("ajoute une ligne pour un produit créé après le démarrage de l'inventaire, et retourne la liste à jour", async () => {
    const createManyCall = vi.fn(async () => ({ count: 1 }));
    let includeCallCount = 0;
    const findFirst = vi.fn(async () => {
      includeCallCount++;
      const lines = [{ id: "line1", pharmacyItemId: "item1", systemQuantity: 5, countedQuantity: null }];
      if (includeCallCount === 2) {
        lines.push({ id: "line2", pharmacyItemId: "item2", systemQuantity: 10, countedQuantity: null } as any);
      }
      return { id: "inv1", organizationId: "org1", status: "IN_PROGRESS", lines };
    });

    const updateCall = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findFirst,
          // Appel interne de syncInventoryCountLines : ne connaît encore que item1, pas comptée,
          // système déjà à jour (5) — pas de rafraîchissement attendu pour elle.
          findUnique: vi.fn(async () => ({ lines: [{ id: "line1", pharmacyItemId: "item1", countedQuantity: null, systemQuantity: 5 }] })),
        },
        pharmacyItem: { findMany: vi.fn(async () => [{ id: "item1", stockQuantity: 5 }, { id: "item2", stockQuantity: 10 }]) },
        stockPurchase: { findMany: vi.fn(async () => []) },
        inventoryCountLine: { createMany: createManyCall, update: updateCall },
      },
    }));
    const { getActiveInventoryCount } = await import("./stock");

    const result = await getActiveInventoryCount("org1");

    expect(result.success).toBe(true);
    expect(createManyCall).toHaveBeenCalledWith({
      data: [{ inventoryCountId: "inv1", pharmacyItemId: "item2", systemQuantity: 10, unitCost: null }],
    });
    // item1 était déjà à jour (systemQuantity 5 == stock réel 5) : aucun rafraîchissement inutile.
    expect(updateCall).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect((result.data as any).lines).toHaveLength(2);
  });

  it("rafraîchit systemQuantity d'une ligne pas encore comptée dont le stock a bougé (ravitaillement reçu pendant que l'inventaire reste ouvert)", async () => {
    const updateCall = vi.fn(async () => ({}));
    const findFirst = vi.fn(async () => ({
      id: "inv1",
      organizationId: "org1",
      status: "IN_PROGRESS",
      lines: [{ id: "line1", pharmacyItemId: "item1", systemQuantity: 6, countedQuantity: null }],
    }));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findFirst,
          findUnique: vi.fn(async () => ({ lines: [{ id: "line1", pharmacyItemId: "item1", countedQuantity: null, systemQuantity: 6 }] })),
        },
        // Un ravitaillement de +10 a été reçu depuis le démarrage : le stock réel est maintenant 16.
        pharmacyItem: { findMany: vi.fn(async () => [{ id: "item1", stockQuantity: 16 }]) },
        inventoryCountLine: { createMany: vi.fn(), update: updateCall },
      },
    }));
    const { getActiveInventoryCount } = await import("./stock");

    const result = await getActiveInventoryCount("org1");

    expect(result.success).toBe(true);
    expect(updateCall).toHaveBeenCalledWith({ where: { id: "line1" }, data: { systemQuantity: 16 } });
  });

  it("ne fait aucun appel de rattrapage quand tous les produits du catalogue sont déjà dans l'inventaire", async () => {
    const createManyCall = vi.fn();
    const findFirst = vi.fn(async () => ({
      id: "inv1",
      organizationId: "org1",
      status: "IN_PROGRESS",
      lines: [{ id: "line1", pharmacyItemId: "item1", systemQuantity: 5, countedQuantity: null }],
    }));

    const updateCall = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findFirst,
          findUnique: vi.fn(async () => ({ lines: [{ id: "line1", pharmacyItemId: "item1", countedQuantity: null, systemQuantity: 5 }] })),
        },
        pharmacyItem: { findMany: vi.fn(async () => [{ id: "item1", stockQuantity: 5 }]) },
        inventoryCountLine: { createMany: createManyCall, update: updateCall },
      },
    }));
    const { getActiveInventoryCount } = await import("./stock");

    const result = await getActiveInventoryCount("org1");

    expect(result.success).toBe(true);
    expect(createManyCall).not.toHaveBeenCalled();
    expect(updateCall).not.toHaveBeenCalled();
    // Un seul appel : pas de deuxième lecture inutile quand rien n'a changé.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("completeInventoryCount — rattrapage de sécurité avant clôture", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("synchronise un produit manquant avant de clôturer ; la ligne ajoutée (jamais comptée) n'entraîne aucun ajustement", async () => {
    const createManyCall = vi.fn(async () => ({ count: 1 }));
    let includeCallCount = 0;
    const findUnique = vi.fn(async (args: any) => {
      if (args.select) {
        // Appel interne de syncInventoryCountLines.
        return { lines: [{ pharmacyItemId: "item1" }] };
      }
      includeCallCount++;
      const lines = [{ id: "line1", pharmacyItemId: "item1", systemQuantity: 5, countedQuantity: 5 }];
      if (includeCallCount === 2) {
        lines.push({ id: "line2", pharmacyItemId: "item2", systemQuantity: 10, countedQuantity: null } as any);
      }
      return { id: "inv1", organizationId: "org1", status: "IN_PROGRESS", lines };
    });

    const txPharmacyItemUpdate = vi.fn(async () => ({}));
    const txStockAdjustmentCreate = vi.fn(async () => ({}));
    const tx = {
      pharmacyItem: {
        // item1 : stock réel (5) toujours identique à systemQuantity (5) — pas de mouvement
        // depuis l'enregistrement du comptage, donc pas "périmée".
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 5, reorderLevel: 5 })),
        update: txPharmacyItemUpdate,
      },
      stockAdjustment: { create: txStockAdjustmentCreate },
      inventoryCount: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: { findUnique },
        pharmacyItem: { findMany: vi.fn(async () => [{ id: "item1", stockQuantity: 5 }, { id: "item2", stockQuantity: 10 }]) },
        stockPurchase: { findMany: vi.fn(async () => []) },
        inventoryCountLine: { createMany: createManyCall },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { completeInventoryCount } = await import("./stock");

    const result = await completeInventoryCount("inv1");

    expect(result.success).toBe(true);
    expect(createManyCall).toHaveBeenCalledWith({
      data: [{ inventoryCountId: "inv1", pharmacyItemId: "item2", systemQuantity: 10, unitCost: null }],
    });
    // item1 est conforme (comptée == système) et item2 vient d'être ajoutée sans comptage
    // (countedQuantity null) : aucune des deux ne doit déclencher un ajustement de stock.
    expect(txPharmacyItemUpdate).not.toHaveBeenCalled();
    expect(txStockAdjustmentCreate).not.toHaveBeenCalled();
  });

  it("ignore (sans ajustement) une ligne dont le stock a bougé depuis l'enregistrement du comptage — ex: ravitaillement reçu entretemps — et la signale dans staleProducts", async () => {
    // Comptage enregistré alors que le système disait 6 (systemQuantity figé à cet instant par
    // saveInventoryCounts) ; l'utilisateur a compté 6 (conforme À CE MOMENT-LÀ). Mais un
    // ravitaillement de +10 a été reçu depuis (stock réel maintenant 16) avant la clôture.
    const count = {
      id: "inv1",
      organizationId: "org1",
      status: "IN_PROGRESS",
      lines: [{ id: "line1", pharmacyItemId: "item1", systemQuantity: 6, countedQuantity: 6 }],
    };
    const txPharmacyItemUpdate = vi.fn(async () => ({}));
    const txStockAdjustmentCreate = vi.fn(async () => ({}));
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Fluclox", stockQuantity: 16, reorderLevel: 5 })),
        update: txPharmacyItemUpdate,
      },
      stockAdjustment: { create: txStockAdjustmentCreate },
      inventoryCount: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findUnique: vi.fn(async (args: any) =>
            args.select ? { lines: [{ id: "line1", pharmacyItemId: "item1", countedQuantity: 6, systemQuantity: 6 }] } : count
          ),
        },
        pharmacyItem: { findMany: vi.fn(async () => [{ id: "item1", stockQuantity: 16 }]) },
        inventoryCountLine: { createMany: vi.fn() },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { completeInventoryCount } = await import("./stock");

    const result = await completeInventoryCount("inv1");

    expect(result.success).toBe(true);
    expect((result.data as any).staleProducts).toEqual(["Fluclox"]);
    // Aucun ajustement appliqué sur une ligne périmée : ni écriture de perte/surplus, ni mise à
    // jour du stock — elle doit être recomptée, pas corrigée automatiquement (dans un sens ou
    // l'autre, l'écart calculé serait faux).
    expect(txPharmacyItemUpdate).not.toHaveBeenCalled();
    expect(txStockAdjustmentCreate).not.toHaveBeenCalled();
  });
});

describe("cancelInventoryCount", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("marque l'inventaire CANCELLED sans toucher au stock ni aux lignes", async () => {
    const inventoryCountUpdate = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findUnique: vi.fn(async () => ({ id: "inv1", organizationId: "org1", status: "IN_PROGRESS" })),
          update: inventoryCountUpdate,
        },
      },
    }));
    const { cancelInventoryCount } = await import("./stock");

    const result = await cancelInventoryCount("inv1", "démarré par erreur");

    expect(result.success).toBe(true);
    expect(inventoryCountUpdate).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date), cancelledById: "coord1", notes: "démarré par erreur" },
    });
  });

  it("refuse d'annuler un inventaire déjà clôturé", async () => {
    const inventoryCountUpdate = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findUnique: vi.fn(async () => ({ id: "inv1", organizationId: "org1", status: "COMPLETED" })),
          update: inventoryCountUpdate,
        },
      },
    }));
    const { cancelInventoryCount } = await import("./stock");

    const result = await cancelInventoryCount("inv1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'est plus modifiable/);
    expect(inventoryCountUpdate).not.toHaveBeenCalled();
  });

  it("refuse pour un rôle hors COORDINATOR/PHARMACIST", async () => {
    const cashierUser = { id: "cash1", role: "CASHIER", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => cashierUser) }));
    vi.doMock("@/lib/db", () => ({ prisma: {} }));
    const { cancelInventoryCount } = await import("./stock");

    const result = await cancelInventoryCount("inv1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Réservé aux coordinateurs et pharmacien/);
  });
});
