import { describe, it, expect, vi, beforeEach } from "vitest";

// Examens externes d'une clinique partenaire : prix partenaire, facturation au partenaire (pas de
// ticket de caisse) ou au patient, saisie par le laborantin.
const state = vi.hoisted(() => ({ user: { id: "u1", role: "MEDECIN", organizationId: "org1" } as Record<string, unknown> }));

function mockDb(partner: { id: string; name: string; billing: string } | null) {
  const labOrderCreate = vi.fn(async ({ data }: any) => ({ id: "order1", ...data }));
  const pendingInvoiceCreate = vi.fn(async ({ data }: any) => ({ id: "inv1", ...data }));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      patient: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
      partner: { findFirst: vi.fn(async () => partner) },
      labTest: {
        findFirst: vi.fn(async ({ where }: any) => ({
          id: `lt-${where.name.equals}`,
          name: where.name.equals,
          basePrice: 5000,
          baseCost: 0,
          partnerPrice: where.name.equals === "NFS" ? 3500 : null,
          consumables: [],
        })),
      },
      pharmacyItem: { findMany: vi.fn(async () => []) },
      labOrder: { create: labOrderCreate, update: vi.fn(async () => ({})) },
      pendingInvoice: { create: pendingInvoiceCreate },
    },
  }));
  return { labOrderCreate, pendingInvoiceCreate };
}

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "u1", role: "MEDECIN", organizationId: "org1" };
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => state.user), verifyPatientAccess: vi.fn(async () => true) }));
});

describe("recordLabResult — compte rendu structuré", () => {
  function mockResultDb(resultTemplate: unknown) {
    const labResultCreate = vi.fn(async ({ data }: any) => ({ id: "r1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labOrder: {
          findUnique: vi.fn(async () => ({ id: "o1", status: "RECEIVED_AT_LAB", patientId: "p1", organizationId: "org1", tests: ["ASAT/ALAT"], results: [] })),
          update: vi.fn(async () => ({})),
        },
        labTest: { findFirst: vi.fn(async () => ({ id: "lt1", name: "ASAT/ALAT", resultTemplate, criticalLow: null, criticalHigh: null })) },
        labResult: { create: labResultCreate },
      },
    }));
    vi.doMock("@/lib/idempotency", () => ({ runIdempotent: (_n: string, _k: unknown, _p: unknown, fn: () => unknown) => fn() }));
    return { labResultCreate };
  }

  it("fige le modèle avec les valeurs, calcule le résumé et l'anomalie", async () => {
    const { presetById } = await import("@/lib/lab-templates");
    const template = presetById("transaminases")!.template;
    const { labResultCreate } = mockResultDb(template);
    const { recordLabResult } = await import("./lab");

    const res = await recordLabResult({ labOrderId: "o1", testName: "ASAT/ALAT", data: { values: { asat: "20", alat: "97.6" } } });

    expect(res.success).toBe(true);
    expect(labResultCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        value: "ASAT : 20 UI/L ; ALAT : 97.6 UI/L",
        isAbnormal: true,
        data: expect.objectContaining({ template, values: { asat: "20", alat: "97.6" } }),
      }),
    });
  });

  it("refuse un compte rendu structuré pour un examen sans modèle, ou vide", async () => {
    mockResultDb(null);
    let { recordLabResult } = await import("./lab");
    const noTemplate = await recordLabResult({ labOrderId: "o1", testName: "ASAT/ALAT", data: { values: { asat: "20" } } });
    expect(noTemplate.success ? "" : noTemplate.error).toMatch(/pas de modèle/);

    vi.resetModules();
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => state.user), verifyPatientAccess: vi.fn(async () => true) }));
    const { presetById } = await import("@/lib/lab-templates");
    mockResultDb(presetById("transaminases")!.template);
    ({ recordLabResult } = await import("./lab"));
    const empty = await recordLabResult({ labOrderId: "o1", testName: "ASAT/ALAT", data: { values: { asat: "" } } });
    expect(empty.success ? "" : empty.error).toMatch(/au moins un résultat/);
  });
});

describe("collectSample — consommables d'un examen facturé au partenaire", () => {
  function mockCollectDb(order: Record<string, unknown>) {
    const decrement = vi.fn(async () => []);
    const claim = vi.fn(async () => ({ count: 1 }));
    const prisma: any = {
      labOrder: {
        findUnique: vi.fn(async () => ({ id: "o1", status: "PRESCRIBED", patientId: "p1", organizationId: "org1", tests: ["NFS"], samples: [], ...order })),
        update: vi.fn(async ({ data }: any) => ({ id: "o1", ...data })),
        updateMany: claim,
      },
    };
    prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
    vi.doMock("@/lib/db", () => ({ prisma }));
    vi.doMock("@/lib/stock-decrement", () => ({ decrementStockForItems: decrement }));
    return { decrement, claim };
  }
  const details = [{ testName: "NFS", consumables: [{ pharmacyItemId: "tube", name: "Tube EDTA", quantity: 1 }] }];

  it("décompte les produits consommés au premier prélèvement, une seule fois", async () => {
    const m = mockCollectDb({ partnerId: "pa1", pendingInvoiceId: null, consumablesConsumedAt: null, testDetails: details });
    const { collectSample } = await import("./lab");

    const res = await collectSample({ labOrderId: "o1", sampleType: "BLOOD" });

    expect(res.success).toBe(true);
    expect(m.claim).toHaveBeenCalledWith({ where: { id: "o1", consumablesConsumedAt: null }, data: { consumablesConsumedAt: expect.any(Date) } });
    expect(m.decrement).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ pharmacyItemId: "tube", quantity: 1 })], "org1");
  });

  it("laisse la pharmacie décompter quand il y a un ticket de caisse", async () => {
    const m = mockCollectDb({ partnerId: "pa1", pendingInvoiceId: "inv1", consumablesConsumedAt: null, testDetails: details });
    const { collectSample } = await import("./lab");
    await collectSample({ labOrderId: "o1", sampleType: "BLOOD" });
    expect(m.decrement).not.toHaveBeenCalled();
  });
});

describe("createLabOrder pour un partenaire", () => {
  it("applique le prix partenaire (prix maison à défaut) et ne crée aucun ticket de caisse quand le partenaire paie", async () => {
    const { labOrderCreate, pendingInvoiceCreate } = mockDb({ id: "pa1", name: "Clinique Espoir", billing: "PARTNER" });
    const { createLabOrder } = await import("./lab");

    const res = await createLabOrder({ patientId: "p1", tests: ["NFS", "Glycémie"], partnerId: "pa1", partnerReference: "B-42" });

    expect(res.success).toBe(true);
    expect(labOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        partnerId: "pa1",
        partnerReference: "B-42",
        testDetails: [
          expect.objectContaining({ testName: "NFS", totalPrice: 3500, housePrice: 5000 }),
          expect.objectContaining({ testName: "Glycémie", totalPrice: 5000 }),
        ],
      }),
    });
    expect(pendingInvoiceCreate).not.toHaveBeenCalled();
  });

  it("applique d'abord le tarif propre du partenaire, prioritaire sur le prix partenaire commun", async () => {
    const { labOrderCreate } = mockDb({ id: "pa1", name: "Clinique Espoir", billing: "PARTNER", prices: { "lt-NFS": 3000 } } as any);
    const { createLabOrder } = await import("./lab");

    await createLabOrder({ patientId: "p1", tests: ["NFS", "Glycémie"], partnerId: "pa1" });

    expect(labOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        testDetails: [expect.objectContaining({ testName: "NFS", totalPrice: 3000 }), expect.objectContaining({ testName: "Glycémie", totalPrice: 5000 })],
      }),
    });
  });

  it("fait régler le patient au prix partenaire quand le partenaire est en mode « patient »", async () => {
    const { pendingInvoiceCreate } = mockDb({ id: "pa1", name: "Clinique Espoir", billing: "PATIENT" });
    const { createLabOrder } = await import("./lab");

    await createLabOrder({ patientId: "p1", tests: ["NFS"], partnerId: "pa1" });

    expect(pendingInvoiceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ items: [expect.objectContaining({ description: "Analyse : NFS (Clinique Espoir)", amount: 3500 })] }),
    });
  });

  it("laisse le laborantin enregistrer une demande de partenaire, mais pas une demande interne", async () => {
    state.user = { id: "lab1", role: "LABORANTIN", organizationId: "org1" };
    mockDb({ id: "pa1", name: "Clinique Espoir", billing: "PARTNER" });
    const { createLabOrder } = await import("./lab");

    expect((await createLabOrder({ patientId: "p1", tests: ["NFS"], partnerId: "pa1" })).success).toBe(true);
    expect((await createLabOrder({ patientId: "p1", tests: ["NFS"] })).success).toBe(false);
  });

  it("refuse un partenaire inconnu ou désactivé", async () => {
    const { labOrderCreate } = mockDb(null);
    const { createLabOrder } = await import("./lab");

    const res = await createLabOrder({ patientId: "p1", tests: ["NFS"], partnerId: "pa-x" });

    expect(res.success ? "" : res.error).toMatch(/Partenaire introuvable/);
    expect(labOrderCreate).not.toHaveBeenCalled();
  });
});
