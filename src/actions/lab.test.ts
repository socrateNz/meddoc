import { describe, it, expect, vi, beforeEach } from "vitest";

const activeUser = { id: "user1", role: "MEDECIN", organizationId: "org1" };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createLabOrder", () => {
  function mockDb(catalog: Record<string, { requiresPaymentFirst: boolean; pharmacyItem: any } | null>) {
    const labOrderCreate = vi.fn(async ({ data }: any) => ({ id: "order1", ...data }));
    const labOrderUpdate = vi.fn(async ({ data }: any) => ({ id: "order1", ...data }));
    const pendingInvoiceCreate = vi.fn(async ({ data }: any) => ({ id: "inv1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        patient: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
        labTest: {
          findFirst: vi.fn(async ({ where }: any) => {
            const entry = catalog[where.name.equals];
            if (!entry) return null;
            return { name: where.name.equals, requiresPaymentFirst: entry.requiresPaymentFirst, pharmacyItem: entry.pharmacyItem };
          }),
        },
        labOrder: { create: labOrderCreate, update: labOrderUpdate },
        pendingInvoice: { create: pendingInvoiceCreate },
      },
    }));
    return { labOrderCreate, labOrderUpdate, pendingInvoiceCreate };
  }

  it("bloque toute la demande dès qu'un seul examen exige la caisse d'abord (panier mixte)", async () => {
    const { labOrderCreate } = mockDb({
      "NFS": { requiresPaymentFirst: false, pharmacyItem: { id: "p1", unitPrice: 1000 } },
      "TDR": { requiresPaymentFirst: true, pharmacyItem: { id: "p2", unitPrice: 2000 } },
    });
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["NFS", "TDR"] });

    expect(result.success).toBe(true);
    expect(labOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "PENDING" }) })
    );
  });

  it("ne bloque pas quand tous les examens partent directement au labo", async () => {
    const { labOrderCreate, pendingInvoiceCreate } = mockDb({
      "TDR urgent": { requiresPaymentFirst: false, pharmacyItem: { id: "p1", unitPrice: 1500 } },
    });
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createLabOrder } = await import("./lab");

    const result = await createLabOrder({ patientId: "p1", tests: ["TDR urgent"] });

    expect(result.success).toBe(true);
    expect(result.invoiceCreated).toBe(true);
    expect(labOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "NOT_REQUIRED" }) })
    );
    expect(pendingInvoiceCreate).toHaveBeenCalledTimes(1);
  });

  it("ne crée pas de facture pour un examen non catalogué (sans produit pharmacie lié)", async () => {
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
  it("refuse le prélèvement tant que la demande est en attente de règlement en caisse", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labOrder: {
          findUnique: vi.fn(async () => ({ id: "order1", status: "PRESCRIBED", paymentStatus: "PENDING", patientId: "p1" })),
        },
        $transaction: vi.fn(),
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { collectSample } = await import("./lab");

    const result = await collectSample({ labOrderId: "order1", sampleType: "BLOOD" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/attente de règlement en caisse/);
  });

  it("refuse un second prélèvement sur une demande déjà prélevée", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        labOrder: {
          findUnique: vi.fn(async () => ({ id: "order1", status: "SAMPLE_COLLECTED", paymentStatus: "NOT_REQUIRED", patientId: "p1" })),
        },
        $transaction: vi.fn(),
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
