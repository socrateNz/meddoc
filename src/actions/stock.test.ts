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
  function createFakeReceiptTx(currentStockAfterIncrement = 20) {
    return {
      stockPurchase: { create: vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data })) },
      // update() renvoie déjà la valeur APRÈS incrément (comportement réel de Prisma) — c'est ce
      // qu'applyStockReceipt lit pour déduire stockBefore/stockAfter sans lecture supplémentaire.
      pharmacyItem: { update: vi.fn(async () => ({ stockQuantity: currentStockAfterIncrement })) },
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

  it("déduit stockBefore/stockAfter de la valeur déjà incrémentée et lie la dépense au lot via stockPurchaseId", async () => {
    // Stock à 30 après incrément de 10 => avant l'achat, il était à 20.
    const tx = createFakeReceiptTx(30);

    const { purchase, transaction } = await applyStockReceipt(tx, {
      pharmacyItemId: "item1",
      itemName: "Paracétamol",
      quantity: 10,
      purchasePrice: 300,
      purchasedById: "user1",
      organizationId: "org1",
    });

    expect(purchase.stockBefore).toBe(20);
    expect(purchase.stockAfter).toBe(30);
    expect(transaction.stockPurchaseId).toBe("purchase1");
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
    // { absorbedByPurchaseId: null } seul ne retrouverait AUCUN retrait existant (le champ est absent
    // des documents, pas null — vérifié sur les données réelles : 0 sur 108) : il faut aussi isSet:false.
    expect(financialTransactionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "expense1",
        OR: [{ absorbedByPurchaseId: null }, { absorbedByPurchaseId: { isSet: false } }],
      },
      data: { absorbedByPurchaseId: "purchase-tx1" },
    });
  });

  it("getAvailableExpenseWithdrawals retrouve les retraits dont le champ absorbedByPurchaseId est absent (et pas seulement null)", async () => {
    const findMany = vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({ prisma: { financialTransaction: { findMany } } }));
    const { getAvailableExpenseWithdrawals } = await import("./stock");

    await getAvailableExpenseWithdrawals("org1");

    const [[{ where }]] = findMany.mock.calls as any[];
    expect(where.OR).toEqual([{ absorbedByPurchaseId: null }, { absorbedByPurchaseId: { isSet: false } }]);
    expect(where.absorbedByPurchaseId).toBeUndefined();
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

describe("recordStockPurchase — produit bloqué par le coordinateur", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("refuse l'achat d'un produit bloqué, avec le motif, sans rien écrire", async () => {
    const stockPurchaseCreate = vi.fn();
    const financialTransactionCreate = vi.fn();
    const itemUpdate = vi.fn();
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({
          id: "item1",
          name: "Amoxicilline",
          dosage: "500mg",
          saleBlockedAt: new Date(),
          saleBlockedReason: "Rappel de lot",
        })),
        update: itemUpdate,
      },
      stockPurchase: { create: stockPurchaseCreate, findFirst: vi.fn(async () => ({ purchasePrice: 100 })) },
      financialTransaction: { create: financialTransactionCreate },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: { $transaction: vi.fn(async (fn: any) => fn(tx)) },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({ pharmacyItemId: "item1", quantity: 10, purchasePrice: 350 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Achat impossible/);
    expect(result.error).toMatch(/Amoxicilline \(500mg\)/);
    expect(result.error).toMatch(/Rappel de lot/);
    expect(stockPurchaseCreate).not.toHaveBeenCalled();
    expect(financialTransactionCreate).not.toHaveBeenCalled();
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it("accepte l'achat d'un produit dont le blocage a été levé (saleBlockedAt null)", async () => {
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Amoxicilline", saleBlockedAt: null, saleBlockedReason: null })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { create: vi.fn(async ({ data }: any) => ({ id: "purchase1", ...data })), findFirst: vi.fn() },
      financialTransaction: { create: vi.fn(async ({ data }: any) => ({ id: "tx1", ...data })) },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: { $transaction: vi.fn(async (fn: any) => fn(tx)) },
    }));
    const { recordStockPurchase } = await import("./stock");

    const result = await recordStockPurchase({ pharmacyItemId: "item1", quantity: 10, purchasePrice: 350 });

    expect(result.success).toBe(true);
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
    const tx = { inventoryCountLine: { update: updateCall } };
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
        // Forme callback (pas tableau) : seule celle-ci accepte un timeout étendu, nécessaire
        // pour un grand catalogue — cf. commentaire de saveInventoryCounts.
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { saveInventoryCounts } = await import("./stock");

    const transactionCall = vi.mocked((await import("@/lib/db")).prisma.$transaction);
    const result = await saveInventoryCounts("inv1", [{ lineId: "line1", countedQuantity: 16 }]);

    expect(result.success).toBe(true);
    expect(updateCall).toHaveBeenCalledWith({
      where: { id: "line1" },
      data: { countedQuantity: 16, systemQuantity: 16 },
    });
    // Un catalogue de plusieurs centaines de produits dépasse le timeout par défaut de Prisma
    // (5s) — cf. bug signalé en production sur un inventaire de 276 produits.
    expect(transactionCall.mock.calls[0][1]).toEqual({ timeout: 60000, maxWait: 15000 });
  });

  function mockBulkDb(itemStock: Record<string, number>) {
    const update = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({}));
    const lines = Object.keys(itemStock).map((itemId, i) => ({ id: `line${i}`, pharmacyItemId: itemId, systemQuantity: 0, countedQuantity: null }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: { findUnique: vi.fn(async () => ({ id: "inv1", status: "IN_PROGRESS", lines })) },
        pharmacyItem: { findMany: vi.fn(async () => Object.entries(itemStock).map(([id, stockQuantity]) => ({ id, stockQuantity }))) },
        $transaction: vi.fn(async (fn: any) => fn({ inventoryCountLine: { update, updateMany } })),
      },
    }));
    return { update, updateMany, lines };
  }

  it("groupe en un seul updateMany les lignes qui reçoivent exactement les mêmes valeurs", async () => {
    // 4 produits : 3 comptés 5 avec un stock réel de 5 (même couple), 1 compté 2 avec un stock de 9.
    const { update, updateMany } = mockBulkDb({ a: 5, b: 5, c: 5, d: 9 });
    const { saveInventoryCounts } = await import("./stock");

    const result = await saveInventoryCounts("inv1", [
      { lineId: "line0", countedQuantity: 5 },
      { lineId: "line1", countedQuantity: 5 },
      { lineId: "line2", countedQuantity: 5 },
      { lineId: "line3", countedQuantity: 2 },
    ]);

    expect(result.success).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["line0", "line1", "line2"] } },
      data: { countedQuantity: 5, systemQuantity: 5 },
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "line3" }, data: { countedQuantity: 2, systemQuantity: 9 } });
  });

  it("refuse une ligne qui n'appartient pas à cet inventaire, sans rien écrire", async () => {
    const { update, updateMany } = mockBulkDb({ a: 5 });
    const { saveInventoryCounts } = await import("./stock");

    const result = await saveInventoryCounts("inv1", [
      { lineId: "line0", countedQuantity: 5 },
      { lineId: "ligne-d-un-autre-inventaire", countedQuantity: 1 },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/introuvable/);
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("garde le dernier comptage envoyé quand une même ligne est présente deux fois", async () => {
    const { update } = mockBulkDb({ a: 5 });
    const { saveInventoryCounts } = await import("./stock");

    const result = await saveInventoryCounts("inv1", [
      { lineId: "line0", countedQuantity: 3 },
      { lineId: "line0", countedQuantity: 4 },
    ]);

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "line0" }, data: { countedQuantity: 4, systemQuantity: 5 } });
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
        findMany: vi.fn(async () => [{ id: "item1", name: "Paracétamol", stockQuantity: 5, reorderLevel: 5 }]),
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
    const dbModule = await import("@/lib/db");
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
    // Un catalogue de plusieurs centaines de produits dépasse le timeout par défaut de Prisma
    // (5s) — cf. bug signalé en production sur un inventaire de 276 produits.
    expect(vi.mocked(dbModule.prisma.$transaction).mock.calls[0][1]).toEqual({ timeout: 60000, maxWait: 15000 });
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
        findMany: vi.fn(async () => [{ id: "item1", name: "Fluclox", stockQuantity: 16, reorderLevel: 5 }]),
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

// Régression : la clôture d'un inventaire de plusieurs centaines de produits dépassait la durée
// maximale de la fonction Vercel (504 FUNCTION_INVOCATION_TIMEOUT) parce qu'elle faisait une (puis
// ~6) requête(s) par ligne, à ~330ms l'aller-retour. Elle doit tenir en un nombre de requêtes
// indépendant du nombre de lignes.
describe("completeInventoryCount — requêtes groupées (pas une par ligne)", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  // Client Prisma factice qui compte chaque appel de méthode (= chaque aller-retour réseau).
  function setup(lines: any[], liveItems: any[], lots: any[] = []) {
    const count = { id: "inv1", organizationId: "org1", status: "IN_PROGRESS", lines };
    const calls: string[] = [];
    const track = <T extends (...args: any[]) => any>(name: string, fn: T) =>
      vi.fn(async (...args: any[]) => {
        calls.push(name);
        return fn(...args);
      });
    const tx = {
      pharmacyItem: {
        findMany: track("item.findMany", async () => liveItems),
        update: track("item.update", async () => ({})),
        updateMany: track("item.updateMany", async () => ({})),
      },
      stockPurchase: {
        findMany: track("lot.findMany", async () => lots),
        updateMany: track("lot.updateMany", async () => ({})),
        update: track("lot.update", async () => ({})),
        createMany: track("lot.createMany", async () => ({})),
      },
      stockAdjustment: { createMany: track("adjustment.createMany", async () => ({})) },
      financialTransaction: { createMany: track("expense.createMany", async () => ({})) },
      inventoryCount: { update: track("count.update", async () => ({})) },
    };
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: {
          findUnique: vi.fn(async (args: any) =>
            args.select
              ? { lines: lines.map((l) => ({ id: l.id, pharmacyItemId: l.pharmacyItemId, countedQuantity: l.countedQuantity, systemQuantity: l.systemQuantity })) }
              : count
          ),
        },
        pharmacyItem: { findMany: vi.fn(async () => liveItems.map((i) => ({ id: i.id, stockQuantity: i.stockQuantity }))) },
        inventoryCountLine: { createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    return { tx, calls };
  }

  it("applique perte (lots FEFO, dépense) et surplus (nouveau lot au coût moyen) en une poignée de requêtes", async () => {
    const lines = [
      { id: "l1", pharmacyItemId: "loss", systemQuantity: 10, countedQuantity: 7 }, // perte de 3
      { id: "l2", pharmacyItemId: "gain", systemQuantity: 4, countedQuantity: 6 }, // surplus de 2
      { id: "l3", pharmacyItemId: "ok", systemQuantity: 5, countedQuantity: 5 }, // conforme
      { id: "l4", pharmacyItemId: "skipped", systemQuantity: 8, countedQuantity: null }, // jamais comptée
    ];
    const liveItems = [
      { id: "loss", name: "Amox", stockQuantity: 10, reorderLevel: 8 },
      { id: "gain", name: "Para", stockQuantity: 4, reorderLevel: 2 },
      { id: "ok", name: "Vitamine", stockQuantity: 5, reorderLevel: 2 },
    ];
    // "loss" : deux lots, le plus proche de la péremption d'abord ; le 1er (2 u. à 100) est vidé,
    // le 2e (8 u. à 200) est entamé d'1 unité. "gain" : un lot restant à 50.
    const lots = [
      { id: "lotA", pharmacyItemId: "loss", remainingQuantity: 2, purchasePrice: 100 },
      { id: "lotB", pharmacyItemId: "loss", remainingQuantity: 8, purchasePrice: 200 },
      { id: "lotC", pharmacyItemId: "gain", remainingQuantity: 4, purchasePrice: 50 },
    ];
    const { tx, calls } = setup(lines, liveItems, lots);
    const { completeInventoryCount } = await import("./stock");

    const result = await completeInventoryCount("inv1");

    expect(result.success).toBe(true);
    // 2 u. × 100 + 1 u. × 200 = 400 de perte valorisée aux prix d'achat réels.
    expect((result.data as any).totalLossValue).toBe(400);

    expect(tx.stockPurchase.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["lotA"] } }, data: { remainingQuantity: 0 } });
    expect(tx.stockPurchase.update).toHaveBeenCalledWith({ where: { id: "lotB" }, data: { remainingQuantity: { decrement: 1 } } });

    expect(tx.financialTransaction.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: "EXPENSE", category: "STOCK_ADJUSTMENT", amount: 400, pharmacyItemId: "loss", quantity: 3 })],
    });
    expect(tx.stockPurchase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ pharmacyItemId: "gain", quantity: 2, remainingQuantity: 2, purchasePrice: 50, totalCost: 100, batchNumber: "AJUSTEMENT-INVENTAIRE" }),
      ],
    });

    // Un ajustement par écart (perte + surplus), rattaché à sa ligne de comptage ; ni la ligne
    // conforme ni celle jamais comptée n'en produisent.
    const adjustments = vi.mocked(tx.stockAdjustment.createMany).mock.calls.flatMap((c: any) => c[0].data);
    expect(adjustments).toEqual([
      expect.objectContaining({ pharmacyItemId: "loss", inventoryCountLineId: "l1", quantityDelta: -3, valuationAmount: 400 }),
      expect.objectContaining({ pharmacyItemId: "gain", inventoryCountLineId: "l2", quantityDelta: 2, valuationAmount: 100 }),
    ]);

    // Nouveau stock = quantité comptée, uniquement pour les produits en écart.
    expect(tx.pharmacyItem.update).toHaveBeenCalledWith({ where: { id: "loss" }, data: { stockQuantity: 7 } });
    expect(tx.pharmacyItem.update).toHaveBeenCalledWith({ where: { id: "gain" }, data: { stockQuantity: 6 } });
    expect(tx.pharmacyItem.update).toHaveBeenCalledTimes(2);

    expect(calls).toContain("count.update");
  });

  it("signale la rupture de stock franchie par une perte via l'événement stock.low", async () => {
    const lines = [{ id: "l1", pharmacyItemId: "loss", systemQuantity: 10, countedQuantity: 3 }];
    const liveItems = [{ id: "loss", name: "Amox", stockQuantity: 10, reorderLevel: 5 }];
    setup(lines, liveItems, [{ id: "lotA", pharmacyItemId: "loss", remainingQuantity: 10, purchasePrice: 100 }]);
    const emit = vi.fn();
    vi.doMock("@/lib/events", () => ({ appEvents: { emit } }));
    const { completeInventoryCount } = await import("./stock");

    const result = await completeInventoryCount("inv1");

    expect(result.success).toBe(true);
    expect(emit).toHaveBeenCalledWith(
      "stock.low",
      expect.objectContaining({ pharmacyItemId: "loss", itemName: "Amox", stockQuantity: 3, reorderLevel: 5 })
    );
  });

  it("garde un nombre de requêtes constant quel que soit le nombre de lignes (276 lignes conformes)", async () => {
    const lines = Array.from({ length: 276 }, (_, i) => ({ id: `l${i}`, pharmacyItemId: `p${i}`, systemQuantity: 5, countedQuantity: 5 }));
    const liveItems = lines.map((l) => ({ id: l.pharmacyItemId, name: `P${l.pharmacyItemId}`, stockQuantity: 5, reorderLevel: 1 }));
    const { calls } = setup(lines, liveItems);
    const { completeInventoryCount } = await import("./stock");

    const result = await completeInventoryCount("inv1");

    expect(result.success).toBe(true);
    // 1 lecture groupée des produits + la mise à jour du statut : rien par ligne.
    expect(calls).toEqual(["item.findMany", "count.update"]);
  });

  it("groupe les mises à jour de stock par quantité comptée identique (une écriture pour 30 produits à 0)", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, pharmacyItemId: `p${i}`, systemQuantity: 4, countedQuantity: 0 }));
    const liveItems = lines.map((l) => ({ id: l.pharmacyItemId, name: `P${l.pharmacyItemId}`, stockQuantity: 4, reorderLevel: 0 }));
    const lots = lines.map((l) => ({ id: `lot-${l.pharmacyItemId}`, pharmacyItemId: l.pharmacyItemId, remainingQuantity: 4, purchasePrice: 10 }));
    const { tx, calls } = setup(lines, liveItems, lots);
    const { completeInventoryCount } = await import("./stock");

    const result = await completeInventoryCount("inv1");

    expect(result.success).toBe(true);
    expect((result.data as any).totalLossValue).toBe(30 * 4 * 10);
    expect(tx.pharmacyItem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.pharmacyItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: lines.map((l) => l.pharmacyItemId) } },
      data: { stockQuantity: 0 },
    });
    // Tous les lots vidés d'un coup, un seul ajustement groupé, une seule dépense groupée.
    expect(tx.stockPurchase.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.stockAdjustment.createMany).toHaveBeenCalledTimes(1);
    expect(tx.financialTransaction.createMany).toHaveBeenCalledTimes(1);
    expect(calls.length).toBeLessThan(10);
  });
});

describe("getInventoryReport — rapport PDF d'un inventaire clôturé", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
  });

  const completedCount = (overrides: any = {}) => ({
    id: "inv1",
    organizationId: "org1",
    status: "COMPLETED",
    createdAt: new Date("2026-09-01"),
    completedAt: new Date("2026-09-02"),
    startedBy: { firstName: "Awa", lastName: "Ndiaye" },
    organization: { name: "Clinique Bien-être", logoUrl: null, parentId: "holding1" },
    lines: [
      { id: "l1", pharmacyItemId: "p1", systemQuantity: 10, countedQuantity: 7, pharmacyItem: { name: "Amoxicilline", dosage: "500mg", category: "MEDICATION" } },
      { id: "l2", pharmacyItemId: "p2", systemQuantity: 5, countedQuantity: 5, pharmacyItem: { name: "Vitamine C", dosage: null, category: "MEDICATION" } },
    ],
    ...overrides,
  });

  function mockDb(user: any, count: any) {
    const adjustmentFindMany = vi.fn(async () => [{ inventoryCountLineId: "l1", quantityDelta: -3, valuationAmount: 400 }]);
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        inventoryCount: { findUnique: vi.fn(async () => count) },
        stockAdjustment: { findMany: adjustmentFindMany },
      },
    }));
    return { adjustmentFindMany };
  }

  it("retourne le rapport avec les produits dont le stock a été modifié (ajustements rattachés aux lignes)", async () => {
    const { adjustmentFindMany } = mockDb(coordinatorUser, completedCount());
    const { getInventoryReport } = await import("./stock");

    const result = await getInventoryReport("inv1");

    expect(result.success).toBe(true);
    expect(adjustmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { inventoryCountLineId: { in: ["l1", "l2"] } } })
    );
    const data = (result as any).data;
    expect(data.organization.name).toBe("Clinique Bien-être");
    expect(data.report.modified).toHaveLength(1);
    expect(data.report.modified[0]).toMatchObject({ name: "Amoxicilline", stockBefore: 10, stockAfter: 7, delta: -3, valuation: 400 });
    expect(data.report.totals).toMatchObject({ modified: 1, conform: 1, lossUnits: 3, lossValue: 400 });
  });

  it("refuse un inventaire d'un autre établissement", async () => {
    mockDb(coordinatorUser, completedCount({ organizationId: "org2", organization: { name: "Autre", logoUrl: null, parentId: "autre-holding" } }));
    const { getInventoryReport } = await import("./stock");

    const result = await getInventoryReport("inv1");

    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/n'appartient pas à votre établissement/);
  });

  it("autorise la holding parente à lire le rapport d'une de ses cliniques", async () => {
    const holdingAdmin = { id: "admin1", role: "ADMIN", organizationId: "holding1", organization: { type: "HOLDING" } };
    mockDb(holdingAdmin, completedCount({ organizationId: "org2" }));
    const { getInventoryReport } = await import("./stock");

    const result = await getInventoryReport("inv1");

    expect(result.success).toBe(true);
  });

  it("refuse un inventaire encore en cours (pas de rapport avant la clôture)", async () => {
    mockDb(coordinatorUser, completedCount({ status: "IN_PROGRESS" }));
    const { getInventoryReport } = await import("./stock");

    const result = await getInventoryReport("inv1");

    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/inventaire clôturé/);
  });

  it("refuse un rôle sans accès au stock", async () => {
    mockDb({ id: "u1", role: "CASHIER", organizationId: "org1", organization: { type: "CLINIC" } }, completedCount());
    const { getInventoryReport } = await import("./stock");

    const result = await getInventoryReport("inv1");

    expect(result.success).toBe(false);
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

describe("cancelStockPurchase", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  it("décrémente le stock, supprime le lot et sa dépense associée, et libère un retrait absorbé", async () => {
    const pharmacyItemUpdate = vi.fn(async () => ({}));
    const financialTransactionUpdateMany = vi.fn(async () => ({ count: 1 }));
    const financialTransactionDelete = vi.fn(async () => ({}));
    const stockPurchaseDelete = vi.fn(async () => ({}));
    const tx = {
      pharmacyItem: { update: pharmacyItemUpdate },
      financialTransaction: { updateMany: financialTransactionUpdateMany, delete: financialTransactionDelete },
      stockPurchase: { delete: stockPurchaseDelete },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        stockPurchase: {
          findUnique: vi.fn(async () => ({
            id: "purchase1",
            pharmacyItemId: "item1",
            quantity: 3000,
            remainingQuantity: 3000,
            totalCost: 2100000,
            batchNumber: null,
            pharmacyItem: { name: "Metronidazol" },
            financialTransactions: [{ id: "tx1" }],
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { cancelStockPurchase } = await import("./stock");

    const result = await cancelStockPurchase("purchase1", "erreur de saisie");

    expect(result.success).toBe(true);
    expect(pharmacyItemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { stockQuantity: { decrement: 3000 } } });
    expect(financialTransactionUpdateMany).toHaveBeenCalledWith({
      where: { absorbedByPurchaseId: "tx1" },
      data: { absorbedByPurchaseId: null },
    });
    expect(financialTransactionDelete).toHaveBeenCalledWith({ where: { id: "tx1" } });
    expect(stockPurchaseDelete).toHaveBeenCalledWith({ where: { id: "purchase1" } });
    expect((result.data as any).warning).toBeNull();
  });

  it("refuse pour un PHARMACIST : seul le coordinateur peut annuler un achat", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));
    const findUnique = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { stockPurchase: { findUnique } } }));
    const { cancelStockPurchase } = await import("./stock");

    const result = await cancelStockPurchase("purchase1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Seul le coordinateur peut annuler un achat/);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("refuse d'annuler l'achat d'un autre établissement", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        stockPurchase: {
          findUnique: vi.fn(async () => ({
            id: "purchase1",
            organizationId: "org-autre",
            pharmacyItemId: "item1",
            quantity: 10,
            remainingQuantity: 10,
            totalCost: 5000,
            batchNumber: null,
            pharmacyItem: { name: "Metronidazol" },
            financialTransactions: [],
          })),
        },
      },
    }));
    const { cancelStockPurchase } = await import("./stock");

    const result = await cancelStockPurchase("purchase1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à votre établissement/);
  });

  it("refuse d'annuler un achat déjà partiellement consommé", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        stockPurchase: {
          findUnique: vi.fn(async () => ({
            id: "purchase1",
            pharmacyItemId: "item1",
            quantity: 3000,
            remainingQuantity: 1987,
            totalCost: 2100000,
            batchNumber: null,
            pharmacyItem: { name: "Metronidazol" },
            financialTransactions: [{ id: "tx1" }],
          })),
        },
      },
    }));
    const { cancelStockPurchase } = await import("./stock");

    const result = await cancelStockPurchase("purchase1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/1013 unité\(s\) sur 3000/);
  });

  it("refuse d'annuler un lot de surplus d'inventaire ou de retour de remise annulée", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        stockPurchase: {
          findUnique: vi.fn(async () => ({
            id: "purchase1",
            pharmacyItemId: "item1",
            quantity: 10,
            remainingQuantity: 10,
            totalCost: 5000,
            batchNumber: "AJUSTEMENT-INVENTAIRE",
            pharmacyItem: { name: "Metronidazol" },
            financialTransactions: [],
          })),
        },
      },
    }));
    const { cancelStockPurchase } = await import("./stock");

    const result = await cancelStockPurchase("purchase1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'est pas un achat direct/);
  });

  it("corrige quand même le stock (avec un avertissement) quand aucune dépense liée n'est retrouvée — achat antérieur à ce lien", async () => {
    const pharmacyItemUpdate = vi.fn(async () => ({}));
    const stockPurchaseDelete = vi.fn(async () => ({}));
    const tx = {
      pharmacyItem: { update: pharmacyItemUpdate },
      financialTransaction: { updateMany: vi.fn(), delete: vi.fn() },
      stockPurchase: { delete: stockPurchaseDelete },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        stockPurchase: {
          findUnique: vi.fn(async () => ({
            id: "purchase1",
            pharmacyItemId: "item1",
            quantity: 10,
            remainingQuantity: 10,
            totalCost: 5000,
            batchNumber: null,
            pharmacyItem: { name: "Metronidazol" },
            financialTransactions: [],
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { cancelStockPurchase } = await import("./stock");

    const result = await cancelStockPurchase("purchase1");

    expect(result.success).toBe(true);
    expect(pharmacyItemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { stockQuantity: { decrement: 10 } } });
    expect(stockPurchaseDelete).toHaveBeenCalledWith({ where: { id: "purchase1" } });
    expect((result.data as any).warning).toMatch(/Aucune dépense associée/);
  });
});

describe("setPharmacyItemSaleBlock", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  function mockItem(overrides: any = {}) {
    const update = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pharmacyItem: {
          findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", organizationId: "org1", ...overrides })),
          update,
        },
      },
    }));
    return update;
  }

  it("bloque la vente avec le motif, la date et l'auteur", async () => {
    const update = mockItem();
    const { setPharmacyItemSaleBlock } = await import("./stock");

    const result = await setPharmacyItemSaleBlock({ pharmacyItemId: "item1", blocked: true, reason: "  rappel de lot  " });

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "item1" },
      data: { saleBlockedAt: expect.any(Date), saleBlockedReason: "rappel de lot", saleBlockedById: "coord1" },
    });
  });

  it("refuse de bloquer sans motif (ou avec un motif trop court)", async () => {
    const update = mockItem();
    const { setPharmacyItemSaleBlock } = await import("./stock");

    const noReason = await setPharmacyItemSaleBlock({ pharmacyItemId: "item1", blocked: true });
    const shortReason = await setPharmacyItemSaleBlock({ pharmacyItemId: "item1", blocked: true, reason: "  a " });

    expect(noReason.success).toBe(false);
    expect(noReason.error).toMatch(/motif est requis/);
    expect(shortReason.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("débloque sans exiger de motif et efface les trois champs", async () => {
    const update = mockItem({ saleBlockedAt: new Date(), saleBlockedReason: "rappel de lot" });
    const { setPharmacyItemSaleBlock } = await import("./stock");

    const result = await setPharmacyItemSaleBlock({ pharmacyItemId: "item1", blocked: false });

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "item1" },
      data: { saleBlockedAt: null, saleBlockedReason: null, saleBlockedById: null },
    });
  });

  it("refuse pour tout rôle autre que COORDINATOR, y compris le PHARMACIST", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));
    const update = mockItem();
    const { setPharmacyItemSaleBlock } = await import("./stock");

    const result = await setPharmacyItemSaleBlock({ pharmacyItemId: "item1", blocked: true, reason: "rappel de lot" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Seul le coordinateur/);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuse un produit d'un autre établissement", async () => {
    const update = mockItem({ organizationId: "org-autre" });
    const { setPharmacyItemSaleBlock } = await import("./stock");

    const result = await setPharmacyItemSaleBlock({ pharmacyItemId: "item1", blocked: true, reason: "rappel de lot" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à votre établissement/);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("deletePharmacyItem / getPharmacyItemDeletionInfo", () => {
  const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => {}) }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));
  });

  function mockCatalogDb(overrides: any = {}) {
    const tx = {
      stockPurchase: { deleteMany: vi.fn(async () => ({})) },
      inventoryCountLine: { deleteMany: vi.fn(async () => ({})) },
      prescriptionItem: { updateMany: vi.fn(async () => ({})) },
      pharmacyItem: { delete: vi.fn(async () => ({})) },
    };
    const prisma = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", dosage: "500mg", stockQuantity: 12, organizationId: "org1", ...overrides.item })),
      },
      financialTransaction: { count: vi.fn(async () => overrides.transactionCount ?? 0) },
      stockAdjustment: { count: vi.fn(async () => overrides.adjustmentCount ?? 0) },
      stockPurchase: { findMany: vi.fn(async () => overrides.lots ?? []) },
      inventoryCountLine: {
        count: vi.fn(async ({ where }: any) =>
          where.inventoryCount.status === "COMPLETED" ? overrides.closedLines ?? 0 : overrides.removableLines ?? 0
        ),
      },
      purchaseOrderLine: { count: vi.fn(async () => overrides.poLines ?? 0) },
      labTest: { findMany: vi.fn(async () => overrides.labTests ?? []) },
      pendingInvoice: { findMany: vi.fn(async () => overrides.openInvoices ?? []) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    vi.doMock("@/lib/db", () => ({ prisma }));
    return { tx, prisma };
  }

  it("supprime un produit sans historique, avec ses lots intacts, ses lignes d'inventaire non clôturé, et détache ses lignes d'ordonnance", async () => {
    const { tx } = mockCatalogDb({
      lots: [{ quantity: 12, remainingQuantity: 12 }],
      removableLines: 1,
    });
    const { deletePharmacyItem } = await import("./stock");

    const result = await deletePharmacyItem("item1");

    expect(result.success).toBe(true);
    expect(tx.stockPurchase.deleteMany).toHaveBeenCalledWith({ where: { pharmacyItemId: "item1" } });
    expect(tx.inventoryCountLine.deleteMany).toHaveBeenCalledWith({ where: { pharmacyItemId: "item1" } });
    expect(tx.prescriptionItem.updateMany).toHaveBeenCalledWith({ where: { pharmacyItemId: "item1" }, data: { pharmacyItemId: null } });
    expect(tx.pharmacyItem.delete).toHaveBeenCalledWith({ where: { id: "item1" } });
  });

  it("refuse et ne supprime rien quand le produit a un historique comptable, un lot entamé ou un inventaire clôturé", async () => {
    const { tx, prisma } = mockCatalogDb({
      transactionCount: 2,
      adjustmentCount: 1,
      lots: [{ quantity: 10, remainingQuantity: 4 }],
      closedLines: 3,
    });
    const { deletePharmacyItem } = await import("./stock");

    const result = await deletePharmacyItem("item1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Suppression impossible/);
    expect(result.error).toMatch(/2 écriture\(s\) comptable\(s\)/);
    expect(result.error).toMatch(/1 ajustement\(s\) de stock/);
    expect(result.error).toMatch(/1 lot\(s\) d'achat ont déjà été en partie vendus/);
    expect(result.error).toMatch(/3 inventaire\(s\) déjà clôturé\(s\)/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.pharmacyItem.delete).not.toHaveBeenCalled();
  });

  it("refuse quand le produit figure dans une commande fournisseur, une recette d'examen labo ou un ticket en cours (panier ou consommable labo)", async () => {
    const { tx, prisma } = mockCatalogDb({
      poLines: 1,
      labTests: [
        { name: "NFS", consumables: [{ pharmacyItemId: "item1", name: "Tube", quantity: 1 }] },
        { name: "Glycémie", consumables: [{ pharmacyItemId: "autre", name: "Bandelette", quantity: 1 }] },
      ],
      openInvoices: [
        { items: [{ type: "PHARMACY", pharmacyItemId: "item1" }], labOrders: [] },
        { items: [{ type: "SERVICE" }], labOrders: [{ testDetails: [{ consumables: [{ pharmacyItemId: "item1" }] }] }] },
        { items: [{ type: "PHARMACY", pharmacyItemId: "autre" }], labOrders: [] },
      ],
    });
    const { deletePharmacyItem } = await import("./stock");

    const result = await deletePharmacyItem("item1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/1 ligne\(s\) de commande fournisseur/);
    expect(result.error).toMatch(/recette de l'examen labo : NFS/);
    expect(result.error).not.toMatch(/Glycémie/);
    expect(result.error).toMatch(/2 ticket\(s\) en cours/);
    expect(tx.pharmacyItem.delete).not.toHaveBeenCalled();

    // Un ticket jamais remis n'a pas de dispensedAt du tout (champ absent, pas null) : { dispensedAt:
    // null } seul n'en retrouvait aucun sur les données réelles (0 sur 55) — d'où isSet:false.
    const [[{ where }]] = (prisma.pendingInvoice.findMany as any).mock.calls;
    expect(where.OR).toEqual([{ dispensedAt: null }, { dispensedAt: { isSet: false } }]);
  });

  it("refuse pour tout rôle autre que COORDINATOR, y compris le PHARMACIST", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "pharma1", role: "PHARMACIST", organizationId: "org1" })) }));
    const { prisma } = mockCatalogDb();
    const { deletePharmacyItem } = await import("./stock");

    const result = await deletePharmacyItem("item1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Seul le coordinateur peut supprimer un produit/);
    expect(prisma.pharmacyItem.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un produit d'un autre établissement", async () => {
    const { tx } = mockCatalogDb({ item: { organizationId: "org-autre" } });
    const { deletePharmacyItem } = await import("./stock");

    const result = await deletePharmacyItem("item1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à votre établissement/);
    expect(tx.pharmacyItem.delete).not.toHaveBeenCalled();
  });

  it("getPharmacyItemDeletionInfo décrit ce qui serait perdu (ou bloqué) sans rien modifier", async () => {
    const { tx, prisma } = mockCatalogDb({ lots: [{ quantity: 12, remainingQuantity: 12 }], removableLines: 2 });
    const { getPharmacyItemDeletionInfo } = await import("./stock");

    const result = await getPharmacyItemDeletionInfo("item1");

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ name: "Paracétamol", stockQuantity: 12, blockers: [], lotsToRemove: 1, inventoryLinesToRemove: 2 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.pharmacyItem.delete).not.toHaveBeenCalled();
  });
});
