import { describe, it, expect, vi, beforeEach } from "vitest";

// Même principe que src/actions/appointments.test.ts : mocks aux frontières (@/lib/db, @/lib/auth,
// auditLogger, next/cache). Priorité : RBAC (COORDINATOR seul peut écrire) + rejet cross-clinique
// (verifyUserInOrg), cf. plan « Calendrier unifié ».

const coordinator = { id: "coord1", role: "COORDINATOR", organizationId: "org1" };
const caregiver = { id: "care1", role: "CAREGIVER", organizationId: "org1" };

function mockDb(overrides: Record<string, unknown> = {}) {
  const shiftCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "shift1", ...data }));
  const userFindUnique = vi.fn(async ({ where }: { where: { id: string } }) =>
    where.id === "staffOtherOrg" ? { organizationId: "org2" } : { organizationId: "org1" }
  );
  vi.doMock("@/lib/db", () => ({
    prisma: {
      shift: { create: shiftCreate, findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
      user: { findUnique: userFindUnique },
      ...overrides,
    },
  }));
  return { shiftCreate, userFindUnique };
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createShift", () => {
  it("un COORDINATOR peut créer une garde pour un membre du personnel de sa propre clinique", async () => {
    const { shiftCreate } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinator) }));
    const { createShift } = await import("./shifts");

    const res = await createShift({ userId: "staffSameOrg", title: "Garde de nuit", startAt: "2026-01-01T20:00:00Z", endAt: "2026-01-02T06:00:00Z" });

    expect(res.success).toBe(true);
    expect(shiftCreate).toHaveBeenCalled();
  });

  it("un CAREGIVER ne peut pas créer de garde (réservé au COORDINATOR)", async () => {
    const { shiftCreate } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => caregiver) }));
    const { createShift } = await import("./shifts");

    const res = await createShift({ userId: "staffSameOrg", title: "Garde de nuit", startAt: "2026-01-01T20:00:00Z", endAt: "2026-01-02T06:00:00Z" });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/coordinateur/i);
    expect(shiftCreate).not.toHaveBeenCalled();
  });

  it("rejette l'affectation à un membre du personnel d'une autre clinique", async () => {
    const { shiftCreate } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinator) }));
    const { createShift } = await import("./shifts");

    const res = await createShift({ userId: "staffOtherOrg", title: "Garde de nuit", startAt: "2026-01-01T20:00:00Z", endAt: "2026-01-02T06:00:00Z" });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ne fait pas partie/i);
    expect(shiftCreate).not.toHaveBeenCalled();
  });
});

describe("updateShift / deleteShift", () => {
  it("rejette la modification d'une garde appartenant à un membre du personnel d'une autre clinique", async () => {
    mockDb({
      shift: { findUnique: vi.fn(async () => ({ id: "shift1", userId: "staffOtherOrg" })), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    });
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinator) }));
    const { updateShift } = await import("./shifts");

    const res = await updateShift({ id: "shift1", title: "Nouveau titre" });

    expect(res.success).toBe(false);
  });

  it("rejette la suppression par un rôle autre que COORDINATOR", async () => {
    mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => caregiver) }));
    const { deleteShift } = await import("./shifts");

    const res = await deleteShift("shift1");

    expect(res.success).toBe(false);
  });
});
