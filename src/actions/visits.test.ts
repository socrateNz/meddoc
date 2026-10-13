import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const authState = vi.hoisted(() => ({
  user: { id: "u1", role: "CASHIER", organizationId: "clinicA", organization: { type: "CLINIC" } } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => authState.user }));

type Options = { patientClinic?: string; activeVisit?: boolean; doctor?: Record<string, unknown> | null; visit?: Record<string, unknown>; claimFails?: boolean };

function mockDb(options: Options = {}) {
  const { patientClinic = "clinicA", activeVisit = false, doctor = null, visit, claimFails = false } = options;
  const runCommandRaw = vi.fn(async () => ({ value: { value: 7 } }));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "v1", ...data }));
  const updateMany = vi.fn(async () => ({ count: claimFails ? 0 : 1 }));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      patient: { findUnique: vi.fn(async () => ({ organizationId: patientClinic })) },
      user: { findUnique: vi.fn(async () => doctor) },
      visit: {
        findFirst: vi.fn(async () => (activeVisit ? { ticketNumber: 3 } : null)),
        findUnique: vi.fn(async () => visit ?? null),
        create,
        updateMany,
      },
      organization: { findFirst: vi.fn(async () => null) },
      $runCommandRaw: runCommandRaw,
    },
  }));
  return { runCommandRaw, create, updateMany };
}

beforeEach(() => {
  vi.resetModules();
  authState.user = { id: "u1", role: "CASHIER", organizationId: "clinicA", organization: { type: "CLINIC" } };
  vi.useFakeTimers({ toFake: ["Date"] });
  // 23h30 UTC = 00h30 le 13 octobre à Douala.
  vi.setSystemTime(new Date("2026-10-12T23:30:00.000Z"));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("registerVisit", () => {
  it("attribue le ticket du jour de la clinique (compteur par clinique et par jour de Douala)", async () => {
    const { runCommandRaw, create } = mockDb();
    const { registerVisit } = await import("./visits");

    const result = await registerVisit({ clinicId: "clinicA", patientId: "p1", destination: "CONSULTATION", reason: "Fièvre" });

    expect(result).toEqual({ success: true, data: { id: "v1", ticket: "007" } });
    expect(runCommandRaw).toHaveBeenCalledWith(expect.objectContaining({ query: { key: "visit-clinicA-2026-10-13" } }));
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: "clinicA", patientId: "p1", visitDate: "2026-10-13", ticketNumber: 7, priority: "NORMAL", createdById: "u1" }),
    });
  });

  it("refuse un patient déjà dans la file du jour, sans consommer de ticket", async () => {
    const { runCommandRaw, create } = mockDb({ activeVisit: true });
    const { registerVisit } = await import("./visits");

    const result = await registerVisit({ clinicId: "clinicA", patientId: "p1", destination: "LAB" });

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error).toMatch(/déjà dans la file d'aujourd'hui \(ticket 003\)/);
    expect(runCommandRaw).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse un patient d'une autre clinique et un médecin qui n'en fait pas partie", async () => {
    mockDb({ patientClinic: "clinicB" });
    let { registerVisit } = await import("./visits");
    expect((await registerVisit({ clinicId: "clinicA", patientId: "p1", destination: "CONSULTATION" })).success).toBe(false);

    vi.resetModules();
    mockDb({ doctor: { role: "MEDECIN", organizationId: "clinicB", isActive: true } });
    ({ registerVisit } = await import("./visits"));
    const result = await registerVisit({ clinicId: "clinicA", patientId: "p1", destination: "CONSULTATION", assignedToId: "doc9" });
    expect(result.success ? "" : result.error).toMatch(/Médecin invalide/);
  });

  it("laisse l'admin de holding en lecture seule", async () => {
    authState.user = { id: "a1", role: "ADMIN", organizationId: "holding1", organization: { type: "HOLDING" } };
    const { create } = mockDb();
    const { registerVisit } = await import("./visits");

    const result = await registerVisit({ clinicId: "clinicA", patientId: "p1", destination: "CONSULTATION" });

    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("updateVisitStatus", () => {
  const consultation = { id: "v1", organizationId: "clinicA", destination: "CONSULTATION", status: "CALLED" };

  it("fait avancer le passage de façon conditionnée au statut lu", async () => {
    authState.user = { id: "doc1", role: "MEDECIN", organizationId: "clinicA", organization: { type: "CLINIC" } };
    const { updateMany } = mockDb({ visit: consultation });
    const { updateVisitStatus } = await import("./visits");

    const result = await updateVisitStatus({ visitId: "v1", action: "START" });

    expect(result).toEqual({ success: true, data: { status: "IN_PROGRESS" } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: "CALLED" },
      data: { status: "IN_PROGRESS", startedAt: expect.any(Date), handledById: "doc1" },
    });
  });

  it("n'autorise pas le caissier à prendre en charge une consultation, mais bien le guichet administratif", async () => {
    mockDb({ visit: consultation });
    let { updateVisitStatus } = await import("./visits");
    expect((await updateVisitStatus({ visitId: "v1", action: "START" })).success).toBe(false);

    vi.resetModules();
    mockDb({ visit: { ...consultation, destination: "ADMINISTRATIVE" } });
    ({ updateVisitStatus } = await import("./visits"));
    expect((await updateVisitStatus({ visitId: "v1", action: "START" })).success).toBe(true);
  });

  it("signale qu'un autre poste vient de modifier le passage (deux appels simultanés)", async () => {
    mockDb({ visit: { ...consultation, status: "WAITING" }, claimFails: true });
    const { updateVisitStatus } = await import("./visits");

    const result = await updateVisitStatus({ visitId: "v1", action: "CALL" });

    expect(result.success ? "" : result.error).toMatch(/autre poste/);
  });

  it("refuse une transition impossible", async () => {
    mockDb({ visit: { ...consultation, status: "DONE" } });
    const { updateVisitStatus } = await import("./visits");

    expect((await updateVisitStatus({ visitId: "v1", action: "CALL" })).success).toBe(false);
  });
});
