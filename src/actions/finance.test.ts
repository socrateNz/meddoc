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

  it("reporte dispensedQuantity vers le nouveau panier lors du premier règlement (correctif reconcileItemsWithPriorDispense)", async () => {
    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING",
            organizationId: "org1",
            // 3 boîtes déjà remises en pharmacie avant ce tout premier règlement.
            items: [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, unitPrice: 500, amount: 2500, dispensedQuantity: 3 }],
          })),
          update: pendingInvoiceUpdate,
        },
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        financialTransaction: {
          create: vi.fn(async ({ data }: any) => ({ id: "tx1", ...data })),
          aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
        },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    // Le caissier ressaisit le même panier (même quantité totale, sans dispensedQuantity — ce
    // champ n'est jamais fourni par l'UI de caisse).
    const result = await payPendingInvoice("inv1", "sess1", 2500, [
      { type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, unitPrice: 500, amount: 2500 },
    ]);

    expect(result.success).toBe(true);
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ items: [expect.objectContaining({ dispensedQuantity: 3 })] }) })
    );
  });

  it("refuse un nouveau panier dont la quantité redescend sous ce qui a déjà été remis", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING",
            organizationId: "org1",
            items: [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, unitPrice: 500, amount: 2500, dispensedQuantity: 3 }],
          })),
          update: vi.fn(async () => ({})),
        },
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        financialTransaction: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    // Le caissier réduit la quantité à 2, alors que 3 ont déjà été physiquement remises.
    const result = await payPendingInvoice("inv1", "sess1", 1000, [
      { type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ne peut pas descendre en dessous/);
  });

  it("refuse de retirer du panier une ligne déjà remise en pharmacie", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING",
            organizationId: "org1",
            items: [
              { type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, unitPrice: 500, amount: 2500, dispensedQuantity: 3 },
              { type: "SERVICE", description: "Consultation", quantity: 1, unitPrice: 1000, amount: 1000 },
            ],
          })),
          update: vi.fn(async () => ({})),
        },
        cashSession: { findUnique: vi.fn(async () => ({ id: "sess1", status: "OPEN", organizationId: "org1" })) },
        financialTransaction: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
      },
    }));
    const { payPendingInvoice } = await import("./finance");

    // Le caissier ressaisit un panier qui a "oublié" la ligne Paracétamol déjà partiellement remise.
    const result = await payPendingInvoice("inv1", "sess1", 1000, [
      { type: "SERVICE", description: "Consultation", quantity: 1, unitPrice: 1000, amount: 1000 },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/il ne peut pas être retiré/);
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
  it("décrémente le stock, incrémente dispensedQuantity et pose dispensedAt pour un PHARMACIST", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pharmacyItemUpdate = vi.fn(async () => ({}));
    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    const items = [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 }];

    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })),
        update: pharmacyItemUpdate,
      },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: {
        // Relecture fraîche à l'intérieur de la transaction — cf. commentaire de
        // dispensePendingInvoice sur la protection contre les remises concurrentes.
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: null, status: "PAID" })),
        update: pendingInvoiceUpdate,
      },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PAID",
            organizationId: "org1",
            items,
            prescriptions: [],
            labOrders: [],
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // "inv1" tient déjà en 6 caractères : la référence attendue est son propre id en majuscules.
    const result = await dispensePendingInvoice("inv1", "INV1", [{ index: 0, quantity: 2 }]);

    expect(result.success).toBe(true);
    expect(result.data?.fullyDispensedNow).toBe(true);
    expect(pharmacyItemUpdate).toHaveBeenCalledWith({
      where: { id: "item1" },
      data: { stockQuantity: { decrement: 2 } },
    });
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1" },
        data: expect.objectContaining({
          items: [expect.objectContaining({ pharmacyItemId: "item1", dispensedQuantity: 2 })],
          dispensedAt: expect.any(Date),
        }),
      })
    );
  });

  it("remet une partie seulement d'une ligne : dispensedAt n'est PAS posé, le reste reste disponible", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pharmacyItemUpdate = vi.fn(async () => ({}));
    const pendingInvoiceUpdate = vi.fn(async () => ({}));
    const items = [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, unitPrice: 500, amount: 2500 }];

    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })),
        update: pharmacyItemUpdate,
      },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: {
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: null, status: "PENDING" })),
        update: pendingInvoiceUpdate,
      },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PENDING", // rien reçu — vente à crédit
            organizationId: "org1",
            items,
            prescriptions: [],
            labOrders: [],
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // 3 boîtes sur 5 données lors de cette visite.
    const result = await dispensePendingInvoice("inv1", "INV1", [{ index: 0, quantity: 3 }]);

    expect(result.success).toBe(true);
    expect(result.data?.fullyDispensedNow).toBe(false);
    expect(pharmacyItemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { stockQuantity: { decrement: 3 } } });
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: [expect.objectContaining({ dispensedQuantity: 3 })],
        }),
      })
    );
    // dispensedAt absent de l'appel (pas juste undefined) : pas encore intégralement remis.
    const [[{ data }]] = pendingInvoiceUpdate.mock.calls as any[];
    expect("dispensedAt" in data).toBe(false);
  });

  it("progression sur deux visites : la deuxième complète la ligne et pose dispensedAt", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    // État partagé simulant la persistance entre les deux appels successifs.
    const items = [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, unitPrice: 500, amount: 2500, dispensedQuantity: 3 }];
    const pendingInvoiceUpdate = vi.fn(async ({ data }: any) => { if (data.items) items[0] = data.items[0]; return {}; });

    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })),
        update: vi.fn(async () => ({})),
      },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: {
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: null, status: "PENDING" })),
        update: pendingInvoiceUpdate,
      },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1", items, prescriptions: [], labOrders: [] })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // Reste 2 (5 commandées, 3 déjà remises lors d'une visite précédente).
    const result = await dispensePendingInvoice("inv1", "INV1", [{ index: 0, quantity: 2 }]);

    expect(result.success).toBe(true);
    expect(result.data?.fullyDispensedNow).toBe(true);
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ items: [expect.objectContaining({ dispensedQuantity: 5 })], dispensedAt: expect.any(Date) }) })
    );
  });

  it("rejette une quantité demandée supérieure au reste disponible sur une ligne, sans toucher au stock", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pharmacyItemUpdate = vi.fn(async () => ({}));
    const items = [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000, dispensedQuantity: 1 }];

    const tx = {
      pharmacyItem: { findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })), update: pharmacyItemUpdate },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: {
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: null, status: "PENDING" })),
        update: vi.fn(async () => ({})),
      },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1", items, prescriptions: [], labOrders: [] })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // Reste seulement 1 (2 commandées, 1 déjà remise) — on en demande 2.
    const result = await dispensePendingInvoice("inv1", "INV1", [{ index: 0, quantity: 2 }]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/supérieure au reste disponible/);
    expect(pharmacyItemUpdate).not.toHaveBeenCalled();
  });

  it("rejette un index de ligne invalide ou non PHARMACY", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const items = [
      { type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000 },
      { type: "SERVICE", description: "Consultation", quantity: 1, unitPrice: 1000, amount: 1000 },
    ];
    const tx = {
      pharmacyItem: { findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })), update: vi.fn(async () => ({})) },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: {
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: null, status: "PENDING" })),
        update: vi.fn(async () => ({})),
      },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1", items, prescriptions: [], labOrders: [] })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // index 1 pointe vers la ligne SERVICE, pas une ligne PHARMACY.
    const result = await dispensePendingInvoice("inv1", "INV1", [{ index: 1, quantity: 1 }]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Ligne invalide/);
  });

  it("décrémente les produits consommés d'un examen labo lié, même avec une seule ligne SERVICE dans le panier", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pharmacyItemUpdates: any[] = [];
    const items = [{ type: "SERVICE", description: "Analyse : Exam A", quantity: 1, unitPrice: 1800, amount: 1800 }];
    const labOrders = [
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
    ];
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: `Produit ${where.id}`, stockQuantity: 10, reorderLevel: 5 })),
        update: vi.fn(async (args: any) => { pharmacyItemUpdates.push(args); return {}; }),
      },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: {
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: null, status: "PARTIAL" })),
        update: vi.fn(async () => ({})),
      },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({
            id: "inv1",
            status: "PARTIAL",
            organizationId: "org1",
            items,
            prescriptions: [],
            labOrders,
          })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // Aucune ligne PHARMACY dans ce panier (SERVICE seul) : lines vide, seuls les consommables
    // labo sont décomptés.
    const result = await dispensePendingInvoice("inv1", "INV1", []);

    expect(result.success).toBe(true);
    expect(pharmacyItemUpdates).toContainEqual({ where: { id: "x" }, data: { stockQuantity: { decrement: 2 } } });
    expect(pharmacyItemUpdates).toContainEqual({ where: { id: "y" }, data: { stockQuantity: { decrement: 1 } } });
  });

  it("ne redécompte pas les consommables labo une deuxième fois sur un appel ultérieur", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const pharmacyItemUpdates: any[] = [];
    const items = [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 2, unitPrice: 500, amount: 1000, dispensedQuantity: 0 }];
    const labOrders = [
      { id: "order1", testDetails: [{ testName: "Exam A", basePrice: 500, consumables: [{ pharmacyItemId: "x", name: "Produit X", quantity: 2, unitPrice: 500 }], totalPrice: 1500 }] },
    ];
    const tx = {
      pharmacyItem: {
        findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, name: `Produit ${where.id}`, stockQuantity: 10, reorderLevel: 5 })),
        update: vi.fn(async (args: any) => { pharmacyItemUpdates.push(args); return {}; }),
      },
      stockPurchase: { findMany: vi.fn(async () => []) },
      // Consommables labo DÉJÀ réglés lors d'une visite précédente.
      pendingInvoice: {
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: new Date("2026-01-01"), status: "PENDING" })),
        update: vi.fn(async () => ({})),
      },
      prescription: { update: vi.fn(async () => ({})) },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1", items, prescriptions: [], labOrders })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    const result = await dispensePendingInvoice("inv1", "INV1", [{ index: 0, quantity: 2 }]);

    expect(result.success).toBe(true);
    // Seule la ligne pharmacie (item1) est décomptée — pas le produit "x" du labo, déjà réglé.
    expect(pharmacyItemUpdates).toEqual([{ where: { id: "item1" }, data: { stockQuantity: { decrement: 2 } } }]);
  });

  it("ne marque une Prescription DISPENSED que lorsque la remise est désormais complète", async () => {
    const pharmacistUser = { id: "pharma1", role: "PHARMACIST", organizationId: "org1" };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => pharmacistUser) }));

    const prescriptionUpdate = vi.fn(async () => ({}));
    const items = [{ type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 4, unitPrice: 500, amount: 2000 }];
    const tx = {
      pharmacyItem: { findUnique: vi.fn(async () => ({ id: "item1", name: "Paracétamol", stockQuantity: 10, reorderLevel: 5 })), update: vi.fn(async () => ({})) },
      stockPurchase: { findMany: vi.fn(async () => []) },
      pendingInvoice: {
        findUnique: vi.fn(async () => ({ items, dispensedAt: null, labConsumablesDispensedAt: null, status: "PENDING" })),
        update: vi.fn(async () => ({})),
      },
      prescription: { update: prescriptionUpdate },
    };

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1", items, prescriptions: [{ id: "presc1" }], labOrders: [] })),
        },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    const { dispensePendingInvoice } = await import("./finance");

    // Remise partielle (2 sur 4) : la prescription ne doit PAS être marquée DISPENSED.
    const partial = await dispensePendingInvoice("inv1", "INV1", [{ index: 0, quantity: 2 }]);
    expect(partial.success).toBe(true);
    expect(prescriptionUpdate).not.toHaveBeenCalled();
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

describe("closeUnpaidInvoice", () => {
  it("clôture un ticket PENDING sans toucher au stock ni créer d'écriture financière", async () => {
    const pendingInvoiceUpdate = vi.fn(async () => ({ id: "inv1", status: "CANCELLED" }));
    // Aucune propriété pharmacyItem/stockPurchase/financialTransaction sur ce mock : la clôture
    // doit se limiter à un seul document PendingInvoice, sans jamais y toucher.
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1" })),
          update: pendingInvoiceUpdate,
        },
      },
    }));
    const { closeUnpaidInvoice } = await import("./finance");

    const result = await closeUnpaidInvoice("inv1");

    expect(result.success).toBe(true);
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1" },
        data: expect.objectContaining({ status: "CANCELLED", closedById: "user1" }),
      })
    );
  });

  it("clôture aussi un ticket PARTIAL", async () => {
    const pendingInvoiceUpdate = vi.fn(async () => ({ id: "inv1", status: "CANCELLED" }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PARTIAL", organizationId: "org1" })),
          update: pendingInvoiceUpdate,
        },
      },
    }));
    const { closeUnpaidInvoice } = await import("./finance");

    const result = await closeUnpaidInvoice("inv1");

    expect(result.success).toBe(true);
    expect(pendingInvoiceUpdate).toHaveBeenCalled();
  });

  it("refuse de clôturer une facture déjà PAID", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PAID", organizationId: "org1" })),
          update: vi.fn(async () => ({})),
        },
      },
    }));
    const { closeUnpaidInvoice } = await import("./finance");

    const result = await closeUnpaidInvoice("inv1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà réglée intégralement ou déjà clôturée/);
  });

  it("refuse de clôturer une facture déjà CANCELLED", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "CANCELLED", organizationId: "org1" })),
          update: vi.fn(async () => ({})),
        },
      },
    }));
    const { closeUnpaidInvoice } = await import("./finance");

    const result = await closeUnpaidInvoice("inv1");

    expect(result.success).toBe(false);
  });

  it("refuse un rôle non autorisé (ex: un rôle sans accès caisse)", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "doc1", role: "DOCTOR", organizationId: "org1" })) }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", organizationId: "org1" })),
          update: vi.fn(async () => ({})),
        },
      },
    }));
    const { closeUnpaidInvoice } = await import("./finance");

    const result = await closeUnpaidInvoice("inv1");

    expect(result.success).toBe(false);
  });
});

describe("listPendingInvoices — forme de computeDispenseLines", () => {
  it("expose cartLines (index/dispensedQuantity/remainingQuantity) et labLines regroupées", async () => {
    const items = [
      { type: "PHARMACY", pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, unitPrice: 500, amount: 2500, dispensedQuantity: 2 },
      { type: "SERVICE", description: "Consultation", quantity: 1, unitPrice: 1000, amount: 1000 },
    ];
    const labOrders = [
      { testDetails: [{ testName: "Exam A", consumables: [{ pharmacyItemId: "x", name: "Produit X", quantity: 2 }] }] },
    ];

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findMany: vi.fn(async () => [{ id: "inv1", organizationId: "org1", items, labOrders, createdAt: new Date() }]),
        },
        financialTransaction: { findMany: vi.fn(async () => []) },
      },
    }));
    const { listPendingInvoices } = await import("./finance");

    // activeUser par défaut (beforeEach global) : CASHIER — couvert par REGISTER_READ_ROLES.
    const result = await listPendingInvoices("org1");

    expect(result.success).toBe(true);
    const invoice = (result.data as any[])[0];
    expect(invoice.cartLines).toEqual([
      { index: 0, pharmacyItemId: "item1", description: "Paracétamol", quantity: 5, dispensedQuantity: 2, remainingQuantity: 3 },
    ]);
    expect(invoice.labLines).toEqual([{ description: "Produit X", quantity: 2 }]);
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
        },
        pharmacyItem: {},
        user: { findMany: vi.fn(async () => []) },
        cashSession: { findMany: vi.fn(async () => []) },
        // Coût "Médicament" de la marge simple : lots StockPurchase de la période (inclut les
        // produits amorcés par import CSV avec un prix d'achat, cf. la description de
        // stockPurchaseWhere dans finance.ts) — tout-temps puis aujourd'hui, même discrimination
        // par where.createdAt.
        stockPurchase: {
          aggregate: vi.fn(async ({ where }: any) => ({ _sum: { totalCost: where.createdAt ? 2000 : 100000 } })),
        },
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
        },
        pharmacyItem: {},
        user: { findMany: vi.fn(async () => []) },
        cashSession: { findMany: vi.fn(async () => []) },
        labOrder: { findMany: vi.fn(async () => labOrders) },
        stockPurchase: {
          // Coût moyen pondéré du produit X : un seul lot restant, 300 FCFA/unité.
          findMany: vi.fn(async () => [{ pharmacyItemId: "x", remainingQuantity: 10, purchasePrice: 300 }]),
          // Aucune vente pharmacie dans ce test (seul LAB_EXAM_FEE est mocké côté revenu) : coût
          // Médicament neutre.
          aggregate: vi.fn(async () => ({ _sum: { totalCost: 0 } })),
        },
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

  it("cashBalance reprend le dernier montant compté d'une caisse sans session ouverte, au lieu de tomber à 0 entre deux sessions", async () => {
    const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findMany: vi.fn(async () => []),
          groupBy: vi.fn(async () => []),
        },
        pharmacyItem: {},
        user: { findMany: vi.fn(async () => []) },
        labOrder: { findMany: vi.fn(async () => []) },
        stockPurchase: { aggregate: vi.fn(async () => ({ _sum: { totalCost: 0 } })) },
        cashSession: {
          findMany: vi.fn(async ({ where }: any) => {
            if (where.status === "OPEN") {
              // Caisse A : session ouverte, fond 1000 + 500 encaissés - 200 dépensés = 1300.
              return [
                {
                  registerId: "regA",
                  openingFloat: 1000,
                  transactions: [{ type: "INCOME", amount: 500 }, { type: "EXPENSE", amount: 200 }],
                },
              ];
            }
            // Caisse B : aucune session ouverte, dernière clôture comptée à 14 350.
            // Caisse A a aussi une ancienne session clôturée (comptée 9999) : ne doit PAS être
            // recomptée puisque sa session ouverte fait déjà foi (pas de double comptage).
            return [
              { registerId: "regB", countedAmount: 14350 },
              { registerId: "regA", countedAmount: 9999 },
            ];
          }),
        },
        $runCommandRaw: vi.fn(async () => ({ cursor: { firstBatch: [] } })),
      },
    }));
    const { getFinanceSummary } = await import("./finance");

    const result = await getFinanceSummary("org1");

    expect(result.success).toBe(true);
    expect(result.data?.cashBalance).toBe(1300 + 14350);
  });

  it("le coût Médicament inclut les lots StockPurchase amorcés par import CSV (aucune FinancialTransaction associée), en excluant les ajustements d'inventaire", async () => {
    const coordinatorUser = { id: "coord1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorUser) }));

    const stockPurchaseAggregateCalls: any[] = [];
    vi.doMock("@/lib/db", () => ({
      prisma: {
        financialTransaction: {
          findMany: vi.fn(async () => []),
          // Aucune dépense PHARMACY_PURCHASE mockée : le seul achat de la période vient de
          // l'import CSV, qui ne crée jamais de FinancialTransaction (cf. importPharmacyItems).
          groupBy: vi.fn(async ({ where }: any) =>
            where.createdAt ? [] : [{ category: "PHARMACY_SALE", _sum: { amount: 50000 } }]
          ),
        },
        pharmacyItem: {},
        user: { findMany: vi.fn(async () => []) },
        cashSession: { findMany: vi.fn(async () => []) },
        labOrder: { findMany: vi.fn(async () => []) },
        stockPurchase: {
          // Simule le lot créé par importPharmacyItems (prix d'achat renseigné à l'import).
          aggregate: vi.fn(async ({ where }: any) => {
            stockPurchaseAggregateCalls.push(where);
            return { _sum: { totalCost: where.createdAt ? 0 : 30000 } };
          }),
        },
        $runCommandRaw: vi.fn(async () => ({ cursor: { firstBatch: [] } })),
      },
    }));
    const { getFinanceSummary } = await import("./finance");

    const result = await getFinanceSummary("org1");

    expect(result.success).toBe(true);
    // Exclut explicitement les lots créés par un ajustement de surplus d'inventaire (pas un
    // achat) de chaque appel — tout-temps et aujourd'hui.
    expect(stockPurchaseAggregateCalls).toHaveLength(2);
    for (const where of stockPurchaseAggregateCalls) {
      expect(where.batchNumber).toEqual({ not: "AJUSTEMENT-INVENTAIRE" });
    }
    const pharmacyEntry = result.data?.profitByCategory?.find((c: any) => c.category === "PHARMACY_SALE");
    expect(pharmacyEntry).toEqual({
      category: "PHARMACY_SALE",
      revenue: 50000,
      cost: 30000,
      profit: 20000,
      todayRevenue: 0,
      todayCost: 0,
      todayProfit: 0,
    });
  });
});
