import { describe, it, expect, vi, beforeEach } from "vitest";
import { permissionsOf } from "./permissions-catalog";

const clinic = (extra: Record<string, unknown> = {}) => ({ type: "CLINIC", ...extra });

function mockRoles(roles: { id: string; baseRole?: string | null; permissions: string[] }[]) {
  const findMany = vi.fn(async () => roles.map((r) => ({ baseRole: null, ...r })));
  vi.doMock("./db", () => ({ prisma: { clinicRole: { findMany } } }));
  return findMany;
}

beforeEach(() => {
  vi.resetModules();
});

describe("effectivePermissions", () => {
  it("permissions par défaut quand la clinique n'a rien ajusté", async () => {
    mockRoles([]);
    const { effectivePermissions } = await import("./permissions-server");
    const perms = await effectivePermissions({ role: "MEDECIN", organizationId: "c1", organization: clinic() });
    expect(new Set(perms)).toEqual(permissionsOf("MEDECIN"));
  });

  it("remplace les permissions d'un rôle ajusté par la clinique", async () => {
    mockRoles([{ id: "r1", baseRole: "LABORANTIN", permissions: ["lab.read", "lab.operate", "lab.validate"] }]);
    const { effectivePermissions } = await import("./permissions-server");
    const perms = await effectivePermissions({ role: "LABORANTIN", organizationId: "c1", organization: clinic() });
    expect(perms).toEqual(["lab.read", "lab.operate", "lab.validate"]);
  });

  it("ajoute les permissions des rôles additionnels, sans jamais dépasser ce qu'un rôle de clinique peut recevoir", async () => {
    mockRoles([{ id: "x1", permissions: ["caisse.access", "register.operate", "platform.holdings", "roles.manage", "inconnue"] }]);
    const { effectivePermissions } = await import("./permissions-server");
    const perms = await effectivePermissions({ role: "ACCUEIL", organizationId: "c1", extraRoleIds: ["x1"], organization: clinic() });
    expect(perms).toContain("visits.register");
    expect(perms).toContain("register.operate");
    expect(perms).toContain("caisse.access");
    expect(perms).not.toContain("platform.holdings");
    expect(perms).not.toContain("roles.manage");
    expect(perms).not.toContain("inconnue");
  });

  it("ignore un rôle additionnel qui n'est pas attribué au membre", async () => {
    mockRoles([{ id: "x2", permissions: ["finance.read"] }]);
    const { effectivePermissions } = await import("./permissions-server");
    const perms = await effectivePermissions({ role: "ACCUEIL", organizationId: "c1", extraRoleIds: ["x1"], organization: clinic() });
    expect(perms).not.toContain("finance.read");
  });

  it("reprend l'ancien réglage « le pharmacien ne tient pas la caisse » tant que le rôle n'est pas ajusté", async () => {
    mockRoles([]);
    const { effectivePermissions } = await import("./permissions-server");
    const perms = await effectivePermissions({ role: "PHARMACIST", organizationId: "c1", organization: clinic({ pharmacistCanUseRegister: false }) });
    expect(perms).not.toContain("register.operate");
    expect(perms).not.toContain("caisse.access");
    expect(perms).toContain("register.read");
    expect(perms).toContain("pharmacy.dispense");
  });

  it("le rôle PHARMACIST ajusté l'emporte sur l'ancien réglage", async () => {
    mockRoles([{ id: "r1", baseRole: "PHARMACIST", permissions: ["pharmacy.access", "caisse.access", "register.operate"] }]);
    const { effectivePermissions } = await import("./permissions-server");
    const perms = await effectivePermissions({ role: "PHARMACIST", organizationId: "c1", organization: clinic({ pharmacistCanUseRegister: false }) });
    expect(perms).toEqual(["pharmacy.access", "caisse.access", "register.operate"]);
  });

  it("coordinateur, holding et portail : toujours les permissions par défaut, sans lecture en base", async () => {
    const findMany = mockRoles([{ id: "r1", baseRole: "COORDINATOR", permissions: [] }]);
    const { effectivePermissions } = await import("./permissions-server");
    expect(new Set(await effectivePermissions({ role: "COORDINATOR", organizationId: "c1", organization: clinic() }))).toEqual(permissionsOf("COORDINATOR"));
    expect(new Set(await effectivePermissions({ role: "ADMIN", organizationId: "h1", organization: { type: "HOLDING" } }))).toEqual(permissionsOf("ADMIN"));
    expect(new Set(await effectivePermissions({ role: "PATIENT", organizationId: "c1", organization: clinic() }))).toEqual(permissionsOf("PATIENT"));
    expect(findMany).not.toHaveBeenCalled();
  });
});
