import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const authState = vi.hoisted(() => ({ user: { id: "coord1", role: "COORDINATOR", organizationId: "clinicA" } as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => authState.user,
  verifyPatientAccess: async () => true,
}));

function mockDb(stay: Record<string, unknown>) {
  const tx = {
    hospitalStay: { updateMany: vi.fn(async () => ({ count: 1 })) },
    bedStay: { update: vi.fn(async () => ({})) },
  };
  vi.doMock("@/lib/db", () => ({
    prisma: {
      hospitalStay: { findUnique: vi.fn(async () => stay) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    },
  }));
  return tx;
}

const openStay = (nightsBilled: number) => ({
  id: "stay1",
  patientId: "p1",
  status: "OPEN",
  nightsBilled,
  admittedAt: new Date("2026-10-12T08:00:00.000Z"),
  bedStays: [{ id: "seg1", startedAt: new Date("2026-10-12T08:00:00.000Z"), endedAt: null }],
});

beforeEach(() => {
  vi.resetModules();
  authState.user = { id: "coord1", role: "COORDINATOR", organizationId: "clinicA" };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T10:00:00.000Z"));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("correctStayAdmission", () => {
  it("corrige la date d'entrée d'un patient déjà hospitalisé avant la mise en service (séjour et première période)", async () => {
    const tx = mockDb(openStay(0));
    const { correctStayAdmission } = await import("./stays");

    const result = await correctStayAdmission({ stayId: "stay1", admittedAt: "2026-10-05T09:00:00.000Z" });

    expect(result.success).toBe(true);
    expect(tx.hospitalStay.updateMany).toHaveBeenCalledWith({
      where: { id: "stay1", status: "OPEN", nightsBilled: 0 },
      data: { admittedAt: new Date("2026-10-05T09:00:00.000Z") },
    });
    expect(tx.bedStay.update).toHaveBeenCalledWith({ where: { id: "seg1" }, data: { startedAt: new Date("2026-10-05T09:00:00.000Z") } });
  });

  it("refuse dès qu'une nuitée a été facturée (jamais de modification rétroactive d'une facture)", async () => {
    const tx = mockDb(openStay(2));
    const { correctStayAdmission } = await import("./stays");

    const result = await correctStayAdmission({ stayId: "stay1", admittedAt: "2026-10-05T09:00:00.000Z" });

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error).toMatch(/déjà été facturées/);
    expect(tx.hospitalStay.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une date dans le futur et un rôle autre que coordinateur", async () => {
    mockDb(openStay(0));
    const { correctStayAdmission } = await import("./stays");
    expect((await correctStayAdmission({ stayId: "stay1", admittedAt: "2026-10-13T09:00:00.000Z" })).success).toBe(false);

    authState.user = { id: "doc1", role: "MEDECIN", organizationId: "clinicA" };
    const result = await correctStayAdmission({ stayId: "stay1", admittedAt: "2026-10-05T09:00:00.000Z" });
    expect(result.success ? "" : result.error).toMatch(/coordinateurs/);
  });
});
