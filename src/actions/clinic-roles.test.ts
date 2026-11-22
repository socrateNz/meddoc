import { describe, it, expect, vi, beforeEach } from "vitest";

const coordinator = { id: "coord1", role: "COORDINATOR", organizationId: "c1", organization: { type: "CLINIC" } };

function mockUser(user: Record<string, unknown>) {
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("saveBuiltInRole", () => {
  it("enregistre l'ajustement d'un rôle intégré, limité aux permissions attribuables", async () => {
    mockUser(coordinator);
    const upsert = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({ prisma: { clinicRole: { upsert } } }));
    const { saveBuiltInRole } = await import("./clinic-roles");

    const res = await saveBuiltInRole("c1", "PHARMACIST", ["register.operate", "pharmacy.access", "roles.manage", "platform.holdings", "pharmacy.access"]);

    expect(res.success).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_name: { organizationId: "c1", name: "@PHARMACIST" } },
        create: expect.objectContaining({ baseRole: "PHARMACIST", permissions: ["pharmacy.access", "register.operate"] }),
      })
    );
  });

  it("refuse le rôle coordinateur (il ne peut pas se retirer l'accès)", async () => {
    mockUser(coordinator);
    vi.doMock("@/lib/db", () => ({ prisma: { clinicRole: { upsert: vi.fn() } } }));
    const { saveBuiltInRole } = await import("./clinic-roles");
    const res = await saveBuiltInRole("c1", "COORDINATOR", []);
    expect(res).toEqual({ success: false, error: "Ce rôle n'est pas modifiable." });
  });

  it("refuse un membre qui n'est pas coordinateur de CETTE clinique", async () => {
    vi.doMock("@/lib/db", () => ({ prisma: { clinicRole: { upsert: vi.fn() } } }));
    mockUser({ ...coordinator, organizationId: "autre" });
    let { saveBuiltInRole } = await import("./clinic-roles");
    expect((await saveBuiltInRole("c1", "MEDECIN", [])).success).toBe(false);

    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ prisma: { clinicRole: { upsert: vi.fn() } } }));
    mockUser({ id: "m1", role: "MEDECIN", organizationId: "c1", organization: { type: "CLINIC" } });
    ({ saveBuiltInRole } = await import("./clinic-roles"));
    expect((await saveBuiltInRole("c1", "MEDECIN", [])).success).toBe(false);
  });
});

describe("createCustomRole", () => {
  it("refuse un nom déjà pris et un nom réservé", async () => {
    mockUser(coordinator);
    vi.doMock("@/lib/db", () => ({ prisma: { clinicRole: { findFirst: vi.fn(async () => ({ id: "r1" })), create: vi.fn() } } }));
    const { createCustomRole } = await import("./clinic-roles");
    expect(await createCustomRole("c1", { name: "Major", permissions: [] })).toEqual({ success: false, error: "Un rôle porte déjà ce nom." });
    expect((await createCustomRole("c1", { name: "@MEDECIN", permissions: [] })).success).toBe(false);
  });
});

describe("deleteCustomRole", () => {
  it("retire le rôle aux membres qui l'avaient avant de le supprimer", async () => {
    mockUser(coordinator);
    const userUpdate = vi.fn((args: unknown) => args);
    const roleDelete = vi.fn((args: unknown) => args);
    const transaction = vi.fn(async (ops: unknown[]) => ops);
    vi.doMock("@/lib/db", () => ({
      prisma: {
        clinicRole: { findFirst: vi.fn(async () => ({ id: "r1", name: "Major", baseRole: null })), delete: roleDelete },
        user: { findMany: vi.fn(async () => [{ id: "u1", extraRoleIds: ["r1", "r2"] }]), update: userUpdate },
        $transaction: transaction,
      },
    }));
    const { deleteCustomRole } = await import("./clinic-roles");

    const res = await deleteCustomRole("c1", "r1");

    expect(res.success).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { extraRoleIds: ["r2"] } });
    expect(roleDelete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});

describe("setMemberExtraRoles", () => {
  it("n'attribue que des rôles créés par la clinique", async () => {
    mockUser(coordinator);
    const update = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        user: { findFirst: vi.fn(async () => ({ id: "u1", role: "ACCUEIL" })), update },
        clinicRole: { findMany: vi.fn(async () => [{ id: "r1", baseRole: "MEDECIN" }]) },
      },
    }));
    const { setMemberExtraRoles } = await import("./clinic-roles");
    expect(await setMemberExtraRoles("c1", "u1", ["r1"])).toEqual({ success: false, error: "Rôle introuvable." });
    expect(update).not.toHaveBeenCalled();
  });

  it("enregistre la liste sans doublon", async () => {
    mockUser(coordinator);
    const update = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        user: { findFirst: vi.fn(async () => ({ id: "u1", role: "ACCUEIL" })), update },
        clinicRole: { findMany: vi.fn(async () => [{ id: "r1", baseRole: null }]) },
      },
    }));
    const { setMemberExtraRoles } = await import("./clinic-roles");
    expect((await setMemberExtraRoles("c1", "u1", ["r1", "r1"])).success).toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { extraRoleIds: ["r1"] } });
  });
});
