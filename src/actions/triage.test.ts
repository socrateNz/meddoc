import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "n1", role: "CAREGIVER", organizationId: "clinicA", organization: { type: "CLINIC" } } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));

function mockDb(visit: Record<string, unknown> | null) {
  const vitalCreate = vi.fn(async () => ({ id: "vs1" }));
  const triageCreate = vi.fn(async () => ({ id: "t1" }));
  const visitUpdate = vi.fn(async () => ({}));
  const tx = { vitalSign: { create: vitalCreate }, emergencyTriage: { create: triageCreate }, visit: { update: visitUpdate } };
  vi.doMock("@/lib/db", () => ({
    prisma: {
      visit: { findUnique: vi.fn(async () => visit) },
      organization: { findFirst: vi.fn(async () => null) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }));
  return { vitalCreate, triageCreate, visitUpdate };
}

const visit = (extra: Record<string, unknown> = {}) => ({ id: "v1", patientId: "p1", organizationId: "clinicA", destination: "EMERGENCY", status: "WAITING", triageLevel: null, ...extra });

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "n1", role: "CAREGIVER", organizationId: "clinicA", organization: { type: "CLINIC" } };
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("triageVisit", () => {
  it("enregistre le tri, verse les constantes au dossier et passe les niveaux 1-2 en urgent", async () => {
    const { vitalCreate, triageCreate, visitUpdate } = mockDb(visit());
    const { triageVisit } = await import("./triage");

    const result = await triageVisit({ visitId: "v1", level: 2, chiefComplaint: "Douleur thoracique", bloodPressure: "160 / 95", heartRate: 110, glasgow: 15 });

    expect(result).toEqual({ success: true, data: { id: "t1" } });
    expect(vitalCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId: "p1", bloodPressure: "160/95", heartRate: 110, recordedById: "n1" }) });
    expect(triageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ level: 2, glasgow: 15, vitalSignId: "vs1", triagedById: "n1" }) });
    expect(visitUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: expect.objectContaining({ triageLevel: 2, priority: "URGENT" }) });
  });

  it("ne crée pas de relevé sans constantes et ne touche pas la priorité au niveau 4", async () => {
    const { vitalCreate, triageCreate, visitUpdate } = mockDb(visit());
    const { triageVisit } = await import("./triage");

    await triageVisit({ visitId: "v1", level: 4, chiefComplaint: "Plaie de la main" });

    expect(vitalCreate).not.toHaveBeenCalled();
    expect(triageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ vitalSignId: null }) });
    expect(visitUpdate.mock.calls[0]).toEqual([{ where: { id: "v1" }, data: { triageLevel: 4, triagedAt: expect.any(Date) } }]);
  });

  it("refuse les constantes invraisemblables", async () => {
    const { triageCreate } = mockDb(visit());
    const { triageVisit } = await import("./triage");

    expect((await triageVisit({ visitId: "v1", level: 3, chiefComplaint: "Fièvre", temperature: 375 })).success).toBe(false);
    expect((await triageVisit({ visitId: "v1", level: 3, chiefComplaint: "Fièvre", bloodPressure: "80/120" })).success).toBe(false);
    expect(triageCreate).not.toHaveBeenCalled();
  });

  it("refuse un passage hors urgences, terminé ou d'une autre clinique", async () => {
    for (const v of [visit({ destination: "CONSULTATION" }), visit({ status: "DONE" }), visit({ organizationId: "clinicB" })]) {
      vi.resetModules();
      const { triageCreate } = mockDb(v);
      const { triageVisit } = await import("./triage");
      expect((await triageVisit({ visitId: "v1", level: 3, chiefComplaint: "Fièvre" })).success).toBe(false);
      expect(triageCreate).not.toHaveBeenCalled();
    }
  });

  it("réserve le tri au personnel soignant", async () => {
    state.user = { id: "r1", role: "RECEPTIONIST", organizationId: "clinicA", organization: { type: "CLINIC" } };
    const { triageCreate } = mockDb(visit());
    const { triageVisit } = await import("./triage");
    expect((await triageVisit({ visitId: "v1", level: 3, chiefComplaint: "Fièvre" })).success).toBe(false);
    expect(triageCreate).not.toHaveBeenCalled();
  });
});
