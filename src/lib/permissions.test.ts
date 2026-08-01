import { describe, it, expect, vi, beforeEach } from "vitest";

describe("hasPermission / requirePermission", () => {
  beforeEach(() => {
    // Chaque test mocke src/lib/db différemment et recharge le module pour
    // repartir sans le cache mémoire interne de src/lib/permissions.ts.
    vi.resetModules();
  });

  it("allows any role when the permission has not been seeded yet", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: { permission: { findMany: vi.fn().mockResolvedValue([]) } },
    }));
    const { hasPermission } = await import("./permissions");

    const allowed = await hasPermission("PATIENT" as any, "SOME_UNSEEDED_PERMISSION");
    expect(allowed).toBe(true);
  });

  it("denies a role that is not listed for a seeded permission", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        permission: {
          findMany: vi.fn().mockResolvedValue([{ name: "MANAGE_STOCK", roles: ["ADMIN", "COORDINATOR"] }]),
        },
      },
    }));
    const { hasPermission } = await import("./permissions");

    const allowed = await hasPermission("CAREGIVER" as any, "MANAGE_STOCK");
    expect(allowed).toBe(false);
  });

  it("allows a role that is listed for a seeded permission", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        permission: {
          findMany: vi.fn().mockResolvedValue([{ name: "MANAGE_STOCK", roles: ["ADMIN", "COORDINATOR"] }]),
        },
      },
    }));
    const { hasPermission } = await import("./permissions");

    const allowed = await hasPermission("ADMIN" as any, "MANAGE_STOCK");
    expect(allowed).toBe(true);
  });

  it("requirePermission throws for a role without the permission", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        permission: {
          findMany: vi.fn().mockResolvedValue([{ name: "MANAGE_CONTRACTS", roles: ["ADMIN"] }]),
        },
      },
    }));
    const { requirePermission } = await import("./permissions");

    await expect(requirePermission("CAREGIVER" as any, "MANAGE_CONTRACTS")).rejects.toThrow();
  });

  it("requirePermission resolves for a role with the permission", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        permission: {
          findMany: vi.fn().mockResolvedValue([{ name: "MANAGE_CONTRACTS", roles: ["ADMIN"] }]),
        },
      },
    }));
    const { requirePermission } = await import("./permissions");

    await expect(requirePermission("ADMIN" as any, "MANAGE_CONTRACTS")).resolves.toBeUndefined();
  });
});
