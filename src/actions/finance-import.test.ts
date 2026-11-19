import { describe, it, expect, vi, beforeEach } from "vitest";

// Import CSV du stock pharmacie : lignes sans ID = créations, lignes avec l'ID MedDoc d'un produit
// exporté = mises à jour, l'écart de quantité passant par un inventaire clôturé automatiquement.
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u1", role: "PHARMACIST", organizationId: "org1" }),
}));

const ID_A = "65a000000000000000000001";
const ID_B = "65a000000000000000000002";

const row = (extra: Record<string, unknown> = {}) => ({ name: "Paracétamol", dosage: "500mg", reorderLevel: 10, unitPrice: 500, ...extra });

function setup(opts: { inventoryInProgress?: boolean; staleProducts?: string[] } = {}) {
  const pharmacyItemUpdate = vi.fn(async () => ({}));
  const pharmacyItemCreate = vi.fn(async () => ({ id: "new" }));
  const start = vi.fn(async () => ({
    success: true,
    data: { id: "inv1", lines: [{ id: "lineA", pharmacyItemId: ID_A }, { id: "lineB", pharmacyItemId: ID_B }] },
  }));
  const save = vi.fn(async () => ({ success: true }));
  const complete = vi.fn(async () => ({ success: true, data: { staleProducts: opts.staleProducts ?? [] } }));
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
  vi.doMock("@/lib/db", () => ({
    prisma: {
      pharmacyItem: {
        findMany: vi.fn(async () => [
          { id: ID_A, stockQuantity: 20 },
          { id: ID_B, stockQuantity: 5 },
        ]),
        update: pharmacyItemUpdate,
        create: pharmacyItemCreate,
      },
      inventoryCount: { findFirst: vi.fn(async () => (opts.inventoryInProgress ? { id: "manuel" } : null)) },
    },
  }));
  return { pharmacyItemUpdate, pharmacyItemCreate, start, save, complete, cancel };
}

beforeEach(() => {
  vi.resetModules();
});

describe("importPharmacyItems — réimport d'un export du stock", () => {
  it("met à jour les produits par leur ID et applique les écarts de quantité par un inventaire", async () => {
    const m = setup();
    const { importPharmacyItems } = await import("./finance");

    const res: any = await importPharmacyItems({
      items: [row({ id: ID_A, stockQuantity: 12, unitPrice: 600 }), row({ id: ID_B, name: "Amoxicilline", stockQuantity: 5 }), row({ name: "Nouveau" })],
    });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ count: 1, updated: 2, stockChanged: 1, failures: [] });
    // La mise à jour ne touche jamais au stock directement.
    expect(m.pharmacyItemUpdate).toHaveBeenCalledWith({ where: { id: ID_A }, data: expect.not.objectContaining({ stockQuantity: expect.anything() }) });
    expect(m.pharmacyItemUpdate).toHaveBeenCalledWith({ where: { id: ID_A }, data: expect.objectContaining({ unitPrice: 600 }) });
    // Seul le produit dont la quantité change est compté (B est déjà à 5).
    expect(m.save).toHaveBeenCalledWith("inv1", [{ lineId: "lineA", countedQuantity: 12 }]);
    expect(m.complete).toHaveBeenCalledWith("inv1");
    expect(m.pharmacyItemCreate).toHaveBeenCalledTimes(1);
  });

  it("n'ouvre aucun inventaire quand aucune quantité ne change (quantité vide = inchangée)", async () => {
    const m = setup();
    const { importPharmacyItems } = await import("./finance");

    const res: any = await importPharmacyItems({ items: [row({ id: ID_A }), row({ id: ID_B, stockQuantity: 5 })] });

    expect(res.data).toMatchObject({ updated: 2, stockChanged: 0 });
    expect(m.start).not.toHaveBeenCalled();
  });

  it("refuse tout l'import, sans rien écrire, si un inventaire manuel est en cours", async () => {
    const m = setup({ inventoryInProgress: true });
    const { importPharmacyItems } = await import("./finance");

    const res: any = await importPharmacyItems({ items: [row({ id: ID_A, stockQuantity: 3 })] });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/inventaire est en cours/);
    expect(m.pharmacyItemUpdate).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it("signale un ID inconnu de l'établissement et un produit en double dans le fichier", async () => {
    const m = setup();
    const { importPharmacyItems } = await import("./finance");

    const res: any = await importPharmacyItems({
      items: [row({ id: "65a0000000000000000000ff" }), row({ id: ID_A }), row({ id: ID_A, name: "Doublon" })],
    });

    expect(res.data.updated).toBe(1);
    expect(res.data.failures.map((f: any) => f.error)).toEqual([
      expect.stringMatching(/introuvable/),
      expect.stringMatching(/plusieurs fois/),
    ]);
    expect(m.pharmacyItemUpdate).toHaveBeenCalledTimes(1);
  });

  it("annule l'inventaire automatique si l'enregistrement du comptage échoue", async () => {
    const m = setup();
    m.save.mockResolvedValueOnce({ success: false, error: "boom" } as any);
    const { importPharmacyItems } = await import("./finance");

    const res: any = await importPharmacyItems({ items: [row({ id: ID_A, stockQuantity: 1 })] });

    expect(m.cancel).toHaveBeenCalledWith("inv1", "Import CSV interrompu");
    expect(res.data.failures[0]).toMatchObject({ name: "Quantités en stock" });
    expect(res.data.stockChanged).toBe(0);
  });
});
