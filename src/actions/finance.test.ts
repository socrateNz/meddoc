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
  it("encaisse intégralement une facture en un seul règlement", async () => {
    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    const pharmacyItemUpdate = vi.fn(async () => ({}));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING",
            patientId: "p1",
            organizationId: "org1",
            items: [{ type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 1000, amount: 1000 }],
          })),
          update: pendingInvoiceUpdate,
        },
        cashSession: {
          findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })),
        },
        financialTransaction: {
          create: vi.fn(async ({ data }: any) => ({ id: "tx1", ...data })),
          aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
        },
        pharmacyItem: { update: pharmacyItemUpdate },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", 1000, [
      { type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 1000, amount: 1000 },
    ]);

    expect(result.success).toBe(true);
    expect(result.data?.remainingDue).toBe(0);
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ status: "PAID", cashSessionId: "sess1" }) })
    );
    expect(pharmacyItemUpdate).not.toHaveBeenCalled();
  });

  it("accepte un paiement partiel, passe la facture à PARTIAL et ne débloque pas le labo", async () => {
    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING",
            patientId: null,
            organizationId: "org1",
            items: [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
          })),
          update: pendingInvoiceUpdate,
        },
        cashSession: {
          findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })),
        },
        financialTransaction: {
          create: financialTransactionCreate,
          aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", 400);

    expect(result.success).toBe(true);
    expect(result.data?.remainingDue).toBe(600);
    expect(financialTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 400, cashSessionId: "sess1", pendingInvoiceId: "inv1" }) })
    );
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PARTIAL" }) })
    );
  });

  it("chaque règlement porte le cashSessionId de la session réellement ouverte au moment du paiement", async () => {
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: `tx-${data.cashSessionId}`, ...data }));
    let alreadyPaid = 0;

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: alreadyPaid === 0 ? "PENDING" : "PARTIAL",
            organizationId: "org1",
            items: [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
          })),
          update: vi.fn(async () => ({})),
        },
        cashSession: {
          findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, status: "OPEN", organizationId: "org1" })),
        },
        financialTransaction: {
          create: financialTransactionCreate,
          aggregate: vi.fn(async () => ({ _sum: { amount: alreadyPaid } })),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const first = await payPendingInvoice("inv1", "sess1", 400);
    expect(first.success).toBe(true);
    alreadyPaid = 400;

    const second = await payPendingInvoice("inv1", "sess2", 600);
    expect(second.success).toBe(true);
    expect(second.data?.remainingDue).toBe(0);

    expect(financialTransactionCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ amount: 400, cashSessionId: "sess1" }) })
    );
    expect(financialTransactionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ amount: 600, cashSessionId: "sess2" }) })
    );
  });

  it("refuse un paiement qui dépasse le reste à payer", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PARTIAL",
            organizationId: "org1",
            items: [{ type: "SERVICE", description: "Consultation", quantity: 1, unitPrice: 1000, amount: 1000 }],
          })),
        },
        cashSession: {
          findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })),
        },
        financialTransaction: {
          aggregate: vi.fn(async () => ({ _sum: { amount: 400 } })),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", 900);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/dépasse le reste à payer/);
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

    const result = await payPendingInvoice("inv1", "sess1", 1000);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Aucune session de caisse ouverte/);
  });

  it("refuse de régler une facture déjà intégralement réglée", async () => {
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

    const result = await payPendingInvoice("inv1", "sess1", 500);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/intégralement réglée/);
  });

  it("catégorise un paiement d'examen labo en LAB_EXAM_FEE (pas SERVICE_FEE)", async () => {
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING",
            organizationId: "org1",
            items: [{ type: "LAB", description: "Analyse : NFS", quantity: 1, unitPrice: 1500, amount: 1500 }],
          })),
          update: vi.fn(async () => ({})),
        },
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        financialTransaction: {
          create: financialTransactionCreate,
          aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", 1500);

    expect(result.success).toBe(true);
    expect(financialTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: "LAB_EXAM_FEE" }) })
    );
  });

  it("priorise PHARMACY_SALE sur un panier mixte PHARMACY + LAB", async () => {
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING",
            organizationId: "org1",
            items: [
              { type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 1, unitPrice: 500, amount: 500 },
              { type: "LAB", description: "Analyse : NFS", quantity: 1, unitPrice: 1500, amount: 1500 },
            ],
          })),
          update: vi.fn(async () => ({})),
        },
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        financialTransaction: {
          create: financialTransactionCreate,
          aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    const result = await payPendingInvoice("inv1", "sess1", 2000);

    expect(result.success).toBe(true);
    expect(financialTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: "PHARMACY_SALE" }) })
    );
  });
});

describe("createCaisseSale", () => {
  it("règle intégralement par défaut quand amountReceived est omis (comportement inchangé)", async () => {
    const pendingInvoiceCreate = vi.fn(async ({ data }: any) => ({ id: "inv1", ...data }));
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        pendingInvoice: { create: pendingInvoiceCreate },
        financialTransaction: { create: financialTransactionCreate },
      },
    }));
    const { createCaisseSale } = await import("./finance");

    const result = await createCaisseSale({
      cashSessionId: "sess1",
      items: [{ type: "PHARMACY", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
    });

    expect(result.success).toBe(true);
    expect(pendingInvoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) }));
    expect(financialTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 1000, pendingInvoiceId: "inv1" }) }));
  });

  it("crée une facture PARTIAL quand amountReceived est inférieur au total du panier", async () => {
    const pendingInvoiceCreate = vi.fn(async ({ data }: any) => ({ id: "inv1", ...data }));
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        pendingInvoice: { create: pendingInvoiceCreate },
        financialTransaction: { create: financialTransactionCreate },
      },
    }));
    const { createCaisseSale } = await import("./finance");

    const result = await createCaisseSale({
      cashSessionId: "sess1",
      items: [{ type: "PHARMACY", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
      amountReceived: 400,
    });

    expect(result.success).toBe(true);
    expect(result.data?.remainingDue).toBe(600);
    expect(pendingInvoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PARTIAL" }) }));
    expect(financialTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 400 }) }));
  });

  it("crée quand même une FinancialTransaction à 0 FCFA pour une vente 100% à crédit (client comptant)", async () => {
    const pendingInvoiceCreate = vi.fn(async ({ data }: any) => ({ id: "inv1", ...data }));
    const financialTransactionCreate = vi.fn(async ({ data }: any) => ({ id: "tx1", ...data }));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        pendingInvoice: { create: pendingInvoiceCreate },
        financialTransaction: { create: financialTransactionCreate },
      },
    }));
    const { createCaisseSale } = await import("./finance");

    const result = await createCaisseSale({
      cashSessionId: "sess1",
      items: [{ type: "PHARMACY", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
      amountReceived: 0,
    });

    expect(result.success).toBe(true);
    expect(pendingInvoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) }));
    // Garde-fou : sans cette transaction (même à 0), le ticket d'une vente 100% à crédit ne peut
    // ni s'afficher ni s'imprimer (InvoiceModal/invoice-pdf.tsx n'ont alors rien à lire).
    expect(financialTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 0 }) }));
  });
});

describe("dispensePendingInvoice", () => {
  it("décrémente le stock et pose dispensedAt pour un PHARMACIST", async () => {
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
      expect.objectContaining({ where: { id: "inv1" }, data: { dispensedAt: expect.any(Date) } })
    );
  });

  it("remet les médicaments même si la facture n'est pas payée (vente à crédit / paiement échelonné)", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: { update: pendingInvoiceUpdate },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING", // rien reçu — vente à crédit
            organizationId: "org1",
            items: [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }],
            prescriptions: [],
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    const result = await dispensePendingInvoice("inv1", "INV1");

    expect(result.success).toBe(true);
    expect(pendingInvoiceUpdate).toHaveBeenCalled();
  });

  it("décrémente les produits consommés d'un examen labo lié, même avec une seule ligne SERVICE dans le panier", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pharmacyItemUpdates: any[] = [];
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: `Produit ${where.id}`, stockQuantity: 10, reorderLevel: 5 })),
        update: vi.fn(async (args: any) => { pharmacyItemUpdates.push(args); return {}; }),
      },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: { update: vi.fn(async () => ({})) },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PARTIAL",
            organizationId: "org1",
            items: [{ type: "SERVICE", description: "Analyse : Exam A", quantity: 1, unitPrice: 1800, amount: 1800 }],
            prescriptions: [],
            labOrders: [
              {
                id: "order1",
                testDetails: [
                  {
                    testName: "Exam A",
                    basePrice: 500,
                    consumables: [
                      { pharmacyItemId: "x", name: "Produit X", quantity: 2, unitPrice: 500 },
                      { pharmacyItemId: "y", name: "Produit Y", quantity: 1, unitPrice: 300 },
                    ],
                    totalPrice: 1800,
                  },
                ],
              },
            ],
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    const result = await dispensePendingInvoice("inv1", "INV1");

    expect(result.success).toBe(true);
    expect(pharmacyItemUpdates).toContainEqual({ where: { id: "x" }, data: { stockQuantity: { decrement: 2 } } });
    expect(pharmacyItemUpdates).toContainEqual({ where: { id: "y" }, data: { stockQuantity: { decrement: 1 } } });
  });

  it("refuse si l'examen labo lié ne consomme aucun produit (rien à remettre)", async () => {
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
            items: [{ type: "SERVICE", description: "Analyse : Exam B", quantity: 1, unitPrice: 500, amount: 500 }],
            prescriptions: [],
            labOrders: [{ id: "order1", testDetails: [{ testName: "Exam B", basePrice: 500, consumables: [], totalPrice: 500 }] }],
          })),
        },
        $transaction: transactionFn,
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    const result = await dispensePendingInvoice("inv1", "INV1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/aucun médicament à remettre/);
    expect(transactionFn).not.toHaveBeenCalled();
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

  it("refuse de dispenser une facture déjà remise", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PAID",
            organizationId: "org1",
            dispensedAt: new Date(),
            items: [],
            prescriptions: [],
          })),
        },
      },
    }));

    const { dispensePendingInvoice } = await import("./finance");
    const result = await dispensePendingInvoice("inv1", "INV1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà été remis/);
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

describe("getFinanceSummary — revenueByCategory", () => {
  it("regroupe le revenu par catégorie (tout-temps + aujourd'hui) sans passer par le tableau plafonné à 500 lignes", async () => {
    const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));

    const groupByCalls: any[] = [];
    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findMany: vi.fn(async () => []),
          groupBy: vi.fn(async ({ where }: any) => {
            groupByCalls.push(where);
            // Deuxième appel = "aujourd'hui" (porte un filtre createdAt) ; premier = tout-temps.
            if (where.createdAt) {
              return [{ category: "PHARMACY_SALE", _sum: { amount: 5000 } }];
            }
            return [
              { category: "PHARMACY_SALE", _sum: { amount: 244000 } },
              { category: "LAB_EXAM_FEE", _sum: { amount: 30000 } },
              { category: "SERVICE_FEE", _sum: { amount: 13000 } },
            ];
          }),
          // Coût "Médicament" de la marge simple : achats de stock (PHARMACY_PURCHASE) de la
          // même période — tout-temps puis aujourd'hui, même discrimination par where.createdAt.
          aggregate: vi.fn(async ({ where }: any) => ({ _sum: { amount: where.createdAt ? 2000 : 100000 } })),
        },
        pharmacyItem: {},
        user: { findMany: vi.fn(async () => []) },
        cashSession: { findMany: vi.fn(async () => []) },
        labOrder: { findMany: vi.fn(async () => []) },
        $runCommandRaw: vi.fn(async () => ({ cursor: { firstBatch: [] } })),
      },
    }));
    const { getFinanceSummary } = await import("./finance");

    const result = await getFinanceSummary("org1");

    expect(result.success).toBe(true);
    expect(groupByCalls).toHaveLength(2);
    expect(result.data?.revenueByCategory).toEqual([
      { category: "PHARMACY_SALE", totalIncome: 244000, todayIncome: 5000 },
      { category: "LAB_EXAM_FEE", totalIncome: 30000, todayIncome: 0 },
      { category: "SERVICE_FEE", totalIncome: 13000, todayIncome: 0 },
    ]);
    // Marge simple : Médicament = revenu - achats de stock de la période ; Examens/Services =
    // aucun coût connu ici (aucun LabOrder mocké) donc marge = 100% du revenu.
    expect(result.data?.profitByCategory).toEqual([
      { category: "PHARMACY_SALE", revenue: 244000, cost: 100000, profit: 144000, todayRevenue: 5000, todayCost: 2000, todayProfit: 3000 },
      { category: "LAB_EXAM_FEE", revenue: 30000, cost: 0, profit: 30000, todayRevenue: 0, todayCost: 0, todayProfit: 0 },
      { category: "SERVICE_FEE", revenue: 13000, cost: 0, profit: 13000, todayRevenue: 0, todayCost: 0, todayProfit: 0 },
    ]);
  });

  it("calcule le coût des examens (marge Examens) depuis testDetails : baseCost du test figé + coût moyen actuel des consommables", async () => {
    const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));

    const labOrders = [
      {
        createdAt: new Date(), // commande d'aujourd'hui
        testDetails: [
          {
            testName: "NFS",
            basePrice: 1000,
            baseCost: 200,
            consumables: [{ pharmacyItemId: "x", name: "Produit X", quantity: 2, unitPrice: 500 }],
            totalPrice: 2000,
          },
        ],
      },
      {
        createdAt: new Date("2020-01-01"), // commande passée, hors "aujourd'hui"
        testDetails: [{ testName: "Glycémie", basePrice: 500, baseCost: 100, consumables: [], totalPrice: 500 }],
      },
    ];

    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findMany: vi.fn(async () => []),
          groupBy: vi.fn(async ({ where }: any) =>
            where.createdAt ? [{ category: "LAB_EXAM_FEE", _sum: { amount: 2000 } }] : [{ category: "LAB_EXAM_FEE", _sum: { amount: 2500 } }]
          ),
          aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
        },
        pharmacyItem: {},
        user: { findMany: vi.fn(async () => []) },
        cashSession: { findMany: vi.fn(async () => []) },
        labOrder: { findMany: vi.fn(async () => labOrders) },
        // Coût moyen pondéré du produit X : un seul lot restant, 300 FCFA/unité.
        stockPurchase: { findMany: vi.fn(async () => [{ pharmacyItemId: "x", remainingQuantity: 10, purchasePrice: 300 }]) },
        $runCommandRaw: vi.fn(async () => ({ cursor: { firstBatch: [] } })),
      },
    }));
    const { getFinanceSummary } = await import("./finance");

    const result = await getFinanceSummary("org1");

    expect(result.success).toBe(true);
    // Commande d'aujourd'hui : 200 (baseCost) + 2 x 300 (coût moyen produit X) = 800
    // Commande passée : 100 (baseCost) + 0 = 100 → total tout-temps = 900, aujourd'hui = 800
    expect(result.data?.profitByCategory).toEqual([
      { category: "LAB_EXAM_FEE", revenue: 2500, cost: 900, profit: 1600, todayRevenue: 2000, todayCost: 800, todayProfit: 1200 },
    ]);
  });
});
