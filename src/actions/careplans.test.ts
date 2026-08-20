import { describe, it, expect, vi, beforeEach } from "vitest";

// Régression : createCarePlan/createCareTask/toggleTaskStatus/closeCarePlan/reopenCarePlan
// ne vérifiaient que l'accès au dossier patient (verifyPatientAccess), sans contrôle de rôle
// clinique — un rôle non clinique partageant l'organisation du patient (PHARMACIST, FAMILY,
// PATIENT...) pouvait déclencher ces écritures avant le correctif de cette session.

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createCarePlan", () => {
  it("refuse un rôle non clinique (PHARMACIST)", async () => {
    const carePlanCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: { medicalCoordinator: { findFirst: vi.fn() }, carePlan: { create: carePlanCreate } },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "u1", role: "PHARMACIST" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createCarePlan } = await import("./careplans");

    const result = await createCarePlan({ patientId: "p1", title: "Suivi post-op", startDate: "2026-01-01" });

    expect(result.success).toBe(false);
    expect(carePlanCreate).not.toHaveBeenCalled();
  });

  it("autorise un coordinateur avec accès au patient", async () => {
    const carePlanCreate = vi.fn(async ({ data }: any) => ({ id: "cp1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        medicalCoordinator: { findFirst: vi.fn(async () => ({ id: "coord1" })) },
        carePlan: { create: carePlanCreate },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "u1", role: "COORDINATOR" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { createCarePlan } = await import("./careplans");

    const result = await createCarePlan({ patientId: "p1", title: "Suivi post-op", startDate: "2026-01-01" });

    expect(result.success).toBe(true);
    expect(carePlanCreate).toHaveBeenCalledTimes(1);
  });
});

describe("closeCarePlan", () => {
  it("refuse un rôle non clinique (FAMILY)", async () => {
    const carePlanUpdate = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { carePlan: { update: carePlanUpdate } } }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "u1", role: "FAMILY" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { closeCarePlan } = await import("./careplans");

    const result = await closeCarePlan("cp1", "p1", "Sortie sans complication");

    expect(result.success).toBe(false);
    expect(carePlanUpdate).not.toHaveBeenCalled();
  });
});
