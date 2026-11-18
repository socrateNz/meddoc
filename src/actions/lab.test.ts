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
    catalog: Record<string, { basePrice: number; baseCost?: number; consumables?: { pharmacyItemId: string; name: string; quantity: number }[] } | null>,
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
            return { id: `lt-${where.name.equals}`, name: where.name.equals, basePrice: entry.basePrice, baseCost: entry.baseCost ?? 0, consumables: entry.consumables || [] };
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
          items: [expect.objectContaining({ type: "LAB", description: "Analyse : A", unitPrice: 1800, amount: 1800 })],
        }),
      })
    );
  });

  it("fige le coût de base du catalogue (LabTest.baseCost) sur testDetails, pour le calcul de marge côté Finance", async () => {
    const { labOrderCreate } = mockDb({ NFS: { basePrice: 1000, baseCost: 250 } });
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
          testDetails: [expect.objectContaining({ testName: "NFS", basePrice: 1000, baseCost: 250 })],
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

  function mockVisit(patientId: string) {
    return vi.fn(async () => ({ pregnancy: { patientId } }));
  }

  it("autorise la sage-femme (CAREGIVER) à demander le bilan d'une visite prénatale, rattaché à la visite", async () => {
    const { labOrderCreate } = mockDb({ NFS: { basePrice: 1000 } });
    const { prisma } = (await import("@/lib/db")) as any;
    prisma.prenatalVisit = { findUnique: mockVisit("p1") };
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, role: "CAREGIVER" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["NFS"], prenatalVisitId: "v1" });

    expect(result.success).toBe(true);
    expect(labOrderCreate.mock.calls[0][0].data.prenatalVisitId).toBe("v1");
  });

  it("refuse une visite prénatale qui n'est pas celle de cette patiente", async () => {
    const { labOrderCreate } = mockDb({ NFS: { basePrice: 1000 } });
    const { prisma } = (await import("@/lib/db")) as any;
    prisma.prenatalVisit = { findUnique: mockVisit("autre-patiente") };
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["NFS"], prenatalVisitId: "v1" });

    expect(result.success).toBe(false);
    expect(labOrderCreate).not.toHaveBeenCalled();
  });
});

describe("collectSample", () => {
  function mockOrder(order: Record<string, unknown>) {
    const labOrderUpdate = vi.fn(async ({ data }: any) => ({ id: "order1", ...order, ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labOrder: {
          findUnique: vi.fn(async () => ({ id: "order1", patientId: "p1", samples: [], sampleCollectedAt: null, ...order })),
          update: labOrderUpdate,
        },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, firstName: "Awa", lastName: "Ndiaye" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    return labOrderUpdate;
  }

  it("réussit même si la facture liée n'est pas encore réglée (vente à crédit, comme en pharmacie)", async () => {
    const labOrderUpdate = mockOrder({ status: "PRESCRIBED", tests: ["NFS"] });
    const { collectSample } = await import("./lab");

    const result = await collectSample({ labOrderId: "order1", sampleType: "BLOOD" });

    expect(result.success).toBe(true);
    expect(labOrderUpdate).toHaveBeenCalled();
  });

  it("sans examens précisés, un seul tube couvre tous les examens de la demande", async () => {
    const labOrderUpdate = mockOrder({ status: "PRESCRIBED", tests: ["NFS", "GE"] });
    const { collectSample } = await import("./lab");

    await collectSample({ labOrderId: "order1", sampleType: "BLOOD" });

    const data = labOrderUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("SAMPLE_COLLECTED");
    expect(data.samples).toHaveLength(1);
    expect(data.samples[0]).toMatchObject({ sampleType: "BLOOD", tests: ["NFS", "GE"], collectedByName: "Awa Ndiaye", receivedAt: null });
    expect(data.sampleCollectedAt).toBeInstanceOf(Date);
  });

  it("ajoute un second tube pour les examens restants, sans toucher au premier", async () => {
    const first = { id: "s1", sampleType: "BLOOD", tests: ["NFS", "GE"], collectedAt: new Date(), collectedById: "user1", receivedAt: null };
    const labOrderUpdate = mockOrder({ status: "SAMPLE_COLLECTED", tests: ["NFS", "GE", "BU"], samples: [first], sampleCollectedAt: first.collectedAt });
    const { collectSample } = await import("./lab");

    const result = await collectSample({ labOrderId: "order1", sampleType: "URINE", tests: ["BU"] });

    expect(result.success).toBe(true);
    const data = labOrderUpdate.mock.calls[0][0].data;
    expect(data.samples).toHaveLength(2);
    expect(data.samples[0]).toBe(first);
    expect(data.samples[1]).toMatchObject({ sampleType: "URINE", tests: ["BU"] });
    // Le statut et les champs du premier prélèvement ne changent pas.
    expect(data.status).toBeUndefined();
    expect(data.sampleType).toBeUndefined();
  });

  it("refuse un examen déjà couvert par un tube", async () => {
    const first = { id: "s1", sampleType: "BLOOD", tests: ["NFS"], collectedAt: new Date(), collectedById: "user1", receivedAt: null };
    const labOrderUpdate = mockOrder({ status: "SAMPLE_COLLECTED", tests: ["NFS", "BU"], samples: [first], sampleCollectedAt: first.collectedAt });
    const { collectSample } = await import("./lab");

    const result = await collectSample({ labOrderId: "order1", sampleType: "BLOOD", tests: ["NFS"] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Déjà prélevé/);
    expect(labOrderUpdate).not.toHaveBeenCalled();
  });

  it("refuse un nouveau prélèvement quand tous les examens sont déjà prélevés (ancienne demande à tube unique)", async () => {
    const labOrderUpdate = mockOrder({ status: "SAMPLE_COLLECTED", tests: ["NFS"], sampleType: "BLOOD", sampleCollectedAt: new Date() });
    const { collectSample } = await import("./lab");

    const result = await collectSample({ labOrderId: "order1", sampleType: "BLOOD" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà un prélèvement/);
    expect(labOrderUpdate).not.toHaveBeenCalled();
  });
});

describe("receiveAtLab", () => {
  function mockOrder(order: Record<string, unknown>) {
    const labOrderUpdate = vi.fn(async ({ data }: any) => ({ id: "order1", ...order, ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: { labOrder: { findUnique: vi.fn(async () => ({ id: "order1", patientId: "p1", ...order })), update: labOrderUpdate } },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    return labOrderUpdate;
  }
  const tube = (id: string, tests: string[], receivedAt: Date | null = null) => ({ id, sampleType: "BLOOD", tests, collectedAt: new Date(), collectedById: "user1", receivedAt });

  it("reçoit un tube sans faire avancer la demande tant qu'un autre tube est attendu", async () => {
    const labOrderUpdate = mockOrder({ status: "SAMPLE_COLLECTED", tests: ["NFS", "BU"], samples: [tube("s1", ["NFS"]), tube("s2", ["BU"])] });
    const { receiveAtLab } = await import("./lab");

    const result = await receiveAtLab("order1", "s1");

    expect(result.success).toBe(true);
    const data = labOrderUpdate.mock.calls[0][0].data;
    expect(data.samples[0].receivedAt).toBeInstanceOf(Date);
    expect(data.samples[1].receivedAt).toBeNull();
    expect(data.status).toBeUndefined();
  });

  it("passe la demande à « Reçu au laboratoire » quand le dernier tube arrive", async () => {
    const labOrderUpdate = mockOrder({ status: "SAMPLE_COLLECTED", tests: ["NFS", "BU"], samples: [tube("s1", ["NFS"], new Date()), tube("s2", ["BU"])] });
    const { receiveAtLab } = await import("./lab");

    await receiveAtLab("order1", "s2");

    expect(labOrderUpdate.mock.calls[0][0].data.status).toBe("RECEIVED_AT_LAB");
  });

  it("n'avance pas tant qu'un examen n'a aucun prélèvement", async () => {
    const labOrderUpdate = mockOrder({ status: "SAMPLE_COLLECTED", tests: ["NFS", "BU"], samples: [tube("s1", ["NFS"])] });
    const { receiveAtLab } = await import("./lab");

    await receiveAtLab("order1", "s1");

    expect(labOrderUpdate.mock.calls[0][0].data.status).toBeUndefined();
  });

  it("ancienne demande à tube unique : la réception fait avancer la demande comme avant", async () => {
    const labOrderUpdate = mockOrder({ status: "SAMPLE_COLLECTED", tests: ["NFS"], samples: [], sampleType: "BLOOD", sampleCollectedAt: new Date() });
    const { receiveAtLab } = await import("./lab");

    await receiveAtLab("order1");

    expect(labOrderUpdate.mock.calls[0][0].data).toEqual({ status: "RECEIVED_AT_LAB" });
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
