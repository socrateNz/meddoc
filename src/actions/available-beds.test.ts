import { describe, it, expect, vi, beforeEach } from "vitest";

const coordinator = { id: "c1", role: "COORDINATOR", organizationId: "clin1", organization: { type: "CLINIC" } };

function setup(user: any, findMany: ReturnType<typeof vi.fn>) {
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn(async () => {}) }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/db", () => ({
    prisma: { bed: { findMany }, organization: { findFirst: vi.fn(async () => null) } },
  }));
}

beforeEach(() => {
  vi.resetModules();
});

describe("listAvailableBeds", () => {
  it("ne propose que les lits libres, triés par service, chambre puis lit", async () => {
    const findMany = vi.fn(async () => [
      { id: "b3", label: "2", room: { name: "Chambre 10" }, ward: { name: "Médecine" } },
      { id: "b1", label: "1", room: { name: "Chambre 2" }, ward: { name: "Médecine" } },
      { id: "b2", label: "A", room: { name: "Box 1" }, ward: { name: "Urgences" } },
    ]);
    setup(coordinator, findMany);
    const { listAvailableBeds } = await import("./wards");

    const res = await listAvailableBeds("clin1");

    expect((findMany.mock.calls[0] as any)[0].where).toEqual({ organizationId: "clin1", status: "AVAILABLE" });
    expect(res.success).toBe(true);
    expect((res.data as any[]).map((b) => b.id)).toEqual(["b1", "b3", "b2"]);
  });

  it("refuse une clinique hors du périmètre de l'utilisateur", async () => {
    const findMany = vi.fn(async () => []);
    setup(coordinator, findMany);
    const { listAvailableBeds } = await import("./wards");

    const res = await listAvailableBeds("autre-clinique");

    expect(res.success).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("refuse un rôle qui ne gère pas les lits (ex. CASHIER)", async () => {
    const findMany = vi.fn(async () => []);
    setup({ ...coordinator, role: "CASHIER" }, findMany);
    const { listAvailableBeds } = await import("./wards");

    const res = await listAvailableBeds("clin1");

    expect(res.success).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });
});
