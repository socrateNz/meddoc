import { describe, it, expect, vi, beforeEach } from "vitest";

const activeUser = { id: "u1", role: "MEDECIN", organizationId: "org1" };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createPregnancy", () => {
  it("refuse un rôle non clinique (PHARMACIST)", async () => {
    const pregnancyCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { pregnancy: { findFirst: vi.fn(), create: pregnancyCreate } } }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, role: "PHARMACIST" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createPregnancy } = await import("./maternity");

    const result = await createPregnancy({
      patientId: "p1",
      lastMenstrualPeriod: "2026-01-01",
      expectedDueDate: "2026-10-08",
      gravidity: 1,
      parity: 0,
    });

    expect(result.success).toBe(false);
    expect(pregnancyCreate).not.toHaveBeenCalled();
  });

  it("refuse une seconde grossesse active pour le même patient", async () => {
    const pregnancyCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pregnancy: { findFirst: vi.fn(async () => ({ id: "existing", status: "ACTIVE" })), create: pregnancyCreate },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createPregnancy } = await import("./maternity");

    const result = await createPregnancy({
      patientId: "p1",
      lastMenstrualPeriod: "2026-01-01",
      expectedDueDate: "2026-10-08",
      gravidity: 2,
      parity: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/grossesse active existe déjà/);
    expect(pregnancyCreate).not.toHaveBeenCalled();
  });

  it("autorise un médecin avec accès au patient, sans grossesse active existante", async () => {
    const pregnancyCreate = vi.fn(async ({ data }: any) => ({ id: "preg1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: { pregnancy: { findFirst: vi.fn(async () => null), create: pregnancyCreate } },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createPregnancy } = await import("./maternity");

    const result = await createPregnancy({
      patientId: "p1",
      lastMenstrualPeriod: "2026-01-01",
      expectedDueDate: "2026-10-08",
      gravidity: 1,
      parity: 0,
    });

    expect(result.success).toBe(true);
    expect(pregnancyCreate).toHaveBeenCalledTimes(1);
  });
});

describe("addPrenatalVisit", () => {
  it("refuse d'ajouter une visite si la grossesse n'est plus active", async () => {
    const visitCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pregnancy: { findUnique: vi.fn(async () => ({ id: "preg1", patientId: "p1", status: "DELIVERED" })) },
        prenatalVisit: { create: visitCreate },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { addPrenatalVisit } = await import("./maternity");

    const result = await addPrenatalVisit({ pregnancyId: "preg1", gestationalWeeks: 20 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'est plus active/);
    expect(visitCreate).not.toHaveBeenCalled();
  });
});

describe("recordDelivery", () => {
  it("refuse d'enregistrer un accouchement déjà enregistré (grossesse non active)", async () => {
    const transaction = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pregnancy: { findUnique: vi.fn(async () => ({ id: "preg1", patientId: "p1", status: "DELIVERED" })) },
        $transaction: transaction,
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { recordDelivery } = await import("./maternity");

    const result = await recordDelivery({
      pregnancyId: "preg1",
      mode: "VAGINAL",
      newborns: [{ sex: "F", weightGrams: 3200 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà été enregistré/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("crée la naissance, les nouveau-nés et clôt la grossesse dans une seule transaction", async () => {
    const deliveryCreate = vi.fn(async ({ data }: any) => ({ id: "del1", ...data }));
    const newbornCreateMany = vi.fn(async () => ({ count: 2 }));
    const pregnancyUpdate = vi.fn(async ({ data }: any) => ({ id: "preg1", ...data }));
    const tx = { delivery: { create: deliveryCreate }, newborn: { createMany: newbornCreateMany }, pregnancy: { update: pregnancyUpdate } };
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pregnancy: { findUnique: vi.fn(async () => ({ id: "preg1", patientId: "p1", status: "ACTIVE" })) },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { recordDelivery } = await import("./maternity");

    const result = await recordDelivery({
      pregnancyId: "preg1",
      mode: "C_SECTION",
      newborns: [
        { sex: "F", weightGrams: 3200 },
        { sex: "M", weightGrams: 2900 },
      ],
    });

    expect(result.success).toBe(true);
    expect(deliveryCreate).toHaveBeenCalledTimes(1);
    expect(newbornCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ sex: "F" }), expect.objectContaining({ sex: "M" })]) })
    );
    expect(pregnancyUpdate).toHaveBeenCalledWith({ where: { id: "preg1" }, data: { status: "DELIVERED" } });
  });
});

describe("updatePregnancyStatus", () => {
  it("refuse un rôle non clinique (FAMILY)", async () => {
    const pregnancyUpdate = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: { pregnancy: { findUnique: vi.fn(async () => ({ id: "preg1", patientId: "p1", status: "ACTIVE" })), update: pregnancyUpdate } },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, role: "FAMILY" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { updatePregnancyStatus } = await import("./maternity");

    const result = await updatePregnancyStatus("preg1", "MISCARRIED");

    expect(result.success).toBe(false);
    expect(pregnancyUpdate).not.toHaveBeenCalled();
  });
});
