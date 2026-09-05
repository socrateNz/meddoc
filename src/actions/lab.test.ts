import { describe, it, expect, vi, beforeEach } from "vitest";

const activeUser = { id: "user1", role: "MEDECIN", organizationId: "org1" };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createLabOrder", () => {
  // catalog: { [testName]: { basePrice, consumables } | null (non catalogué) }
  // products: { [pharmacyItemId]: unitPrice } — pour la résolution de prix des consommables
  function mockDb(
    catalog: Record<string, { basePrice: number; consumables?: { pharmacyItemId: string; name: string; quantity: number }[] } | null>,
    products: Record<string, number> = {}
  ) {
    const labOrderCreate = vi.fn(async ({ data }: any) => ({ id: "order1", ...data }));
    const labOrderUpdate = vi.fn(async ({ data }: any) => ({ id: "order1", ...data }));
    const pendingInvoiceCreate = vi.fn(async ({ data }: any) => ({ id: "inv1", ...data }));
    const pharmacyItemFindMany = vi.fn(async ({ where }: any) => {
      const ids: string[] = where.id.in;
      return ids.map((id) => ({ id, unitPrice: products[id] ?? 0 }));
    });
    vi.doMock("@/lib/db", () => ({
      prisma: {
        patient: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
        labTest: {
          findFirst: vi.fn(async ({ where }: any) => {
            const entry = catalog[where.name.equals];
            if (!entry) return null;
            return { id: `lt-${where.name.equals}`, name: where.name.equals, basePrice: entry.basePrice, consumables: entry.consumables || [] };
          }),
        },
        pharmacyItem: { findMany: pharmacyItemFindMany },
        labOrder: { create: labOrderCreate, update: labOrderUpdate },
        pendingInvoice: { create: pendingInvoiceCreate },
      },
    }));
    return { labOrderCreate, labOrderUpdate, pendingInvoiceCreate };
  }

  it("facture le prix de base seul quand l'examen ne consomme aucun produit", async () => {
    const { labOrderCreate } = mockDb({ NFS: { basePrice: 1000 } });
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["NFS"] });

    expect(result.success).toBe(true);
    expect(labOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          testDetails: [expect.objectContaining({ testName: "NFS", basePrice: 1000, totalPrice: 1000 })],
        }),
      })
    );
  });

  it("facture prix de base + somme des produits consommés (2x produit X, 1x produit Y)", async () => {
    const { labOrderCreate, pendingInvoiceCreate } = mockDb(
      {
        A: {
          basePrice: 500,
          consumables: [
            { pharmacyItemId: "x", name: "Produit X", quantity: 2 },
            { pharmacyItemId: "y", name: "Produit Y", quantity: 1 },
          ],
        },
      },
      { x: 500, y: 300 }
    );
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["A"] });

    expect(result.success).toBe(true);
    // 500 (base) + 2*500 (X) + 1*300 (Y) = 1800
    expect(labOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          testDetails: [expect.objectContaining({ testName: "A", basePrice: 500, totalPrice: 1800 })],
        }),
      })
    );
    expect(pendingInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: [expect.objectContaining({ type: "SERVICE", description: "Analyse : A", unitPrice: 1800, amount: 1800 })],
        }),
      })
    );
  });

  it("ne crée pas de facture pour un examen non catalogué", async () => {
    const { pendingInvoiceCreate } = mockDb({});
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["Examen inconnu"] });

    expect(result.success).toBe(true);
    expect(result.invoiceCreated).toBe(false);
    expect(pendingInvoiceCreate).not.toHaveBeenCalled();
  });

  it("refuse un rôle non autorisé (CAREGIVER ne peut pas prescrire un examen)", async () => {
    const { labOrderCreate } = mockDb({});
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, role: "CAREGIVER" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["NFS"] });

    expect(result.success).toBe(false);
    expect(labOrderCreate).not.toHaveBeenCalled();
  });
});

describe("collectSample", () => {
  it("réussit même si la facture liée n'est pas encore réglée (vente à crédit, comme en pharmacie)", async () => {
    const labOrderUpdate = vi.fn(async ({ data }: any) => ({ id: "order1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labOrder: {
          findUnique: vi.fn(async () => ({ id: "order1", status: "PRESCRIBED", patientId: "p1" })),
          update: labOrderUpdate,
        },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { collectSample } = await import("./lab");

    const result = await collectSample({ labOrderId: "order1", sampleType: "BLOOD" });

    expect(result.success).toBe(true);
    expect(labOrderUpdate).toHaveBeenCalled();
  });

  it("refuse un second prélèvement sur une demande déjà prélevée", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labOrder: {
          findUnique: vi.fn(async () => ({ id: "order1", status: "SAMPLE_COLLECTED", patientId: "p1" })),
        },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { collectSample } = await import("./lab");

    const result = await collectSample({ labOrderId: "order1", sampleType: "BLOOD" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà été enregistré/);
  });
});

describe("validateLabResult", () => {
  it("refuse de re-valider un résultat déjà verrouillé (maker-checker)", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labResult: {
          findUnique: vi.fn(async () => ({
            id: "result1",
            labOrderId: "order1",
            validatedAt: new Date("2026-01-01"),
            labOrder: { patientId: "p1" },
          })),
          update: vi.fn(),
        },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, role: "COORDINATOR" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { validateLabResult } = await import("./lab");

    const result = await validateLabResult("result1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà validé et verrouillé/);
  });

  it("refuse un rôle non autorisé (CAREGIVER ne peut pas valider un résultat)", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labResult: { findUnique: vi.fn(), update: vi.fn() },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, role: "CAREGIVER" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { validateLabResult } = await import("./lab");

    const result = await validateLabResult("result1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/coordinateur ou un médecin/);
  });
});
