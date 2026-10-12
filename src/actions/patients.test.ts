import { describe, it, expect, vi, beforeEach } from "vitest";

const authState = vi.hoisted(() => ({
  user: { id: "coord1", role: "COORDINATOR", organizationId: "clinic1", organization: { type: "CLINIC" } } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => authState.user,
  verifyPatientAccess: async () => true,
}));

const basePatient = {
  firstName: "Awa",
  lastName: "Ndiaye",
  dateOfBirth: "2026-01-05",
  address: "Quartier Akwa, Douala",
  dependencyLevel: 1,
  pathologies: [],
  allergies: [],
};

function mockDb(options: { existingEmailUser?: boolean } = {}) {
  type CreateArgs = { data: Record<string, unknown> };
  const userCreate = vi.fn(async ({ data }: CreateArgs) => ({ id: "user1", ...data }));
  const patientCreate = vi.fn(async ({ data }: CreateArgs) => ({ id: "patient1", ...data }));
  const runCommandRaw = vi.fn(async () => ({ value: { value: 42 } }));
  const findUser = vi.fn(async () => (options.existingEmailUser ? { id: "u-existing" } : null));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      user: { findUnique: findUser },
      $runCommandRaw: runCommandRaw,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ user: { findUnique: findUser, create: userCreate }, patient: { create: patientCreate } })),
    },
  }));
  return { userCreate, patientCreate, runCommandRaw };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T10:00:00.000Z"));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createPatient — admission sans e-mail et IPP", () => {
  it("enregistre un patient sans e-mail : IPP attribué, aucun compte de connexion utilisable", async () => {
    const { userCreate, patientCreate } = mockDb();
    const { createPatient } = await import("./patients");

    const result = await createPatient({ ...basePatient, email: "" });

    expect(result.success).toBe(true);
    expect(patientCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ ipp: "IPP-2026-000042", organizationId: "clinic1" }) });
    const userData = userCreate.mock.calls[0][0].data;
    // Adresse technique dérivée de l'IPP (le modèle User exige un e-mail unique)…
    expect(userData.email).toBe("ipp-2026-000042@patients.meddoc.local");
    // …et compte inactif : refusé à la connexion par AuthService.
    expect(userData.isActive).toBe(false);
  });

  it("garde le comportement existant avec un e-mail (compte de connexion actif) et attribue aussi un IPP", async () => {
    const { userCreate, patientCreate } = mockDb();
    const { createPatient } = await import("./patients");

    const result = await createPatient({ ...basePatient, email: "awa@gmail.com" });

    expect(result.success).toBe(true);
    expect(patientCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ ipp: "IPP-2026-000042" }) });
    const userData = userCreate.mock.calls[0][0].data;
    expect(userData.email).toBe("awa@gmail.com");
    expect(userData).not.toHaveProperty("isActive");
  });

  it("refuse un e-mail déjà utilisé sans consommer de numéro d'IPP", async () => {
    const { userCreate, runCommandRaw } = mockDb({ existingEmailUser: true });
    const { createPatient } = await import("./patients");

    const result = await createPatient({ ...basePatient, email: "awa@gmail.com" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/existe déjà/);
    expect(runCommandRaw).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejette un e-mail mal formé (l'e-mail reste validé quand il est fourni)", async () => {
    mockDb();
    const { createPatient } = await import("./patients");

    const result = await createPatient({ ...basePatient, email: "pas-un-email" });

    expect(result.success).toBe(false);
  });
});
