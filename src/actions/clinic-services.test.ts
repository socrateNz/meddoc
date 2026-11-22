import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "n1", role: "CAREGIVER", organizationId: "c1", organization: { type: "CLINIC" }, serviceIds: [] } as Record<string, unknown>,
  access: true,
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => state.user,
  verifyPatientAccess: async () => state.access,
}));

function mockDb(opts: { patientServiceId?: string | null; target?: Record<string, unknown> | null } = {}) {
  const patientUpdate = vi.fn((args: unknown) => ({ op: "update", args }));
  const transferCreate = vi.fn((args: unknown) => ({ op: "transfer", args }));
  const transaction = vi.fn(async (ops: unknown[]) => ops);
  vi.doMock("@/lib/db", () => ({
    prisma: {
      patient: { findUnique: vi.fn(async () => ({ id: "p1", organizationId: "c1", serviceId: opts.patientServiceId ?? null })), update: patientUpdate },
      clinicService: { findFirst: vi.fn(async () => (opts.target === undefined ? { id: "ophtalmo", name: "Ophtalmologie" } : opts.target)) },
      patientTransfer: { create: transferCreate },
      $transaction: transaction,
    },
  }));
  return { patientUpdate, transferCreate, transaction };
}

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "n1", role: "CAREGIVER", organizationId: "c1", organization: { type: "CLINIC" }, serviceIds: [] };
  state.access = true;
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("transferPatient", () => {
  it("confie le dossier au nouveau service et trace le transfert", async () => {
    const m = mockDb({ patientServiceId: "medecine" });
    const { transferPatient } = await import("./clinic-services");

    const res = await transferPatient({ patientId: "p1", toServiceId: "ophtalmo", reason: "Avis spécialisé" });

    expect(res).toEqual({ success: true, data: { serviceName: "Ophtalmologie" } });
    expect(m.patientUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { serviceId: "ophtalmo" } });
    expect(m.transferCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromServiceId: "medecine", toServiceId: "ophtalmo", kind: "TRANSFER", reason: "Avis spécialisé", transferredById: "n1" }),
    });
  });

  it("refuse si le soignant n'a pas accès au dossier (autre service)", async () => {
    state.access = false;
    const m = mockDb();
    const { transferPatient } = await import("./clinic-services");

    const res = await transferPatient({ patientId: "p1", toServiceId: "ophtalmo" });

    expect(res.success).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("refuse l'accueil, un service désactivé ou d'une autre clinique, et le service actuel", async () => {
    state.user = { id: "a1", role: "ACCUEIL", organizationId: "c1", organization: { type: "CLINIC" } };
    mockDb();
    let { transferPatient } = await import("./clinic-services");
    expect((await transferPatient({ patientId: "p1", toServiceId: "ophtalmo" })).success).toBe(false);

    vi.resetModules();
    state.user = { id: "n1", role: "MEDECIN", organizationId: "c1", organization: { type: "CLINIC" } };
    mockDb({ target: null });
    ({ transferPatient } = await import("./clinic-services"));
    const disabled = await transferPatient({ patientId: "p1", toServiceId: "ophtalmo" });
    expect(disabled.success ? "" : disabled.error).toMatch(/introuvable ou désactivé/);

    vi.resetModules();
    mockDb({ patientServiceId: "ophtalmo" });
    ({ transferPatient } = await import("./clinic-services"));
    const same = await transferPatient({ patientId: "p1", toServiceId: "ophtalmo" });
    expect(same.success ? "" : same.error).toMatch(/déjà dans ce service/);
  });
});
