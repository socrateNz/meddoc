import { describe, it, expect, vi, beforeEach } from "vitest";

// Clinique fille de la holding h1, clinique d'une autre holding, et holding h1 elle-même.
const orgs: Record<string, { parentId: string | null }> = {
  "clinic-h1": { parentId: "h1" },
  "clinic-other": { parentId: "h2" },
  h1: { parentId: null },
};

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({
    prisma: {
      organization: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orgs[where.id] ?? null),
      },
    },
  }));
});

const holdingAdmin = { organizationId: "h1", organization: { type: "HOLDING" } };
const clinicStaff = { organizationId: "clinic-h1", organization: { type: "CLINIC" } };

describe("canAccessOrganization", () => {
  it("autorise sa propre organisation et, pour une holding, ses cliniques filles uniquement", async () => {
    const { canAccessOrganization } = await import("./org-scope");
    expect(await canAccessOrganization(clinicStaff, "clinic-h1")).toBe(true);
    expect(await canAccessOrganization(holdingAdmin, "clinic-h1")).toBe(true);
    expect(await canAccessOrganization(holdingAdmin, "clinic-other")).toBe(false);
    // Une clinique ne peut ni remonter à sa holding ni voir une clinique sœur.
    expect(await canAccessOrganization(clinicStaff, "h1")).toBe(false);
    expect(await canAccessOrganization(clinicStaff, "clinic-other")).toBe(false);
  });

  it("refuse une organisation absente ou inconnue, et tout utilisateur sans organisation", async () => {
    const { canAccessOrganization } = await import("./org-scope");
    expect(await canAccessOrganization(clinicStaff, null)).toBe(false);
    expect(await canAccessOrganization(holdingAdmin, "inconnue")).toBe(false);
    expect(await canAccessOrganization({ organizationId: null }, "clinic-h1")).toBe(false);
  });
});

describe("resolveTargetOrgId", () => {
  it("retombe sur l'organisation de l'utilisateur sans paramètre", async () => {
    const { resolveTargetOrgId } = await import("./org-scope");
    expect(await resolveTargetOrgId(clinicStaff)).toBe("clinic-h1");
    expect(await resolveTargetOrgId(holdingAdmin, "")).toBe("h1");
  });

  it("accepte une clinique de sa holding et rejette tout autre identifiant", async () => {
    const { resolveTargetOrgId } = await import("./org-scope");
    expect(await resolveTargetOrgId(holdingAdmin, "clinic-h1")).toBe("clinic-h1");
    await expect(resolveTargetOrgId(clinicStaff, "clinic-other")).rejects.toThrow(
      "Non autorisé. Cette clinique ne fait pas partie de votre établissement."
    );
  });
});
