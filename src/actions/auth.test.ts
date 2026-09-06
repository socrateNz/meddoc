import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("requestPasswordReset — isolation multi-tenant", () => {
  it("ne notifie que le COORDINATOR de la clinique du demandeur et l'ADMIN de sa holding, jamais les autres établissements", async () => {
    let notifiedIds: string[] = [];
    const notificationCreateMany = vi.fn(async ({ data }: any) => { notifiedIds = data.map((n: any) => n.userId); return { count: data.length }; });
    const userFindMany = vi.fn(async ({ where }: any) => {
      // Simule : coordinateur clinicA (doit être notifié), admin holdingA (doit être notifié),
      // coordinateur clinicB sans rapport (ne doit JAMAIS apparaître dans le résultat).
      const pool = [
        { id: "coordA", role: "COORDINATOR", organizationId: "clinicA", isActive: true },
        { id: "adminHoldingA", role: "ADMIN", organizationId: "holdingA", isActive: true },
        { id: "coordB", role: "COORDINATOR", organizationId: "clinicB", isActive: true },
      ];
      const orgIds: string[] = where.organizationId?.in || [];
      const roles: string[] = where.role?.in || [];
      return pool.filter((u) => orgIds.includes(u.organizationId) && roles.includes(u.role));
    });

    vi.doMock("@/lib/db", () => ({
      prisma: {
        user: {
          findUnique: vi.fn(async () => ({
            id: "requester1",
            firstName: "Jean",
            lastName: "Dupont",
            email: "jean@clinica.com",
            isActive: true,
            organizationId: "clinicA",
          })),
          findMany: userFindMany,
        },
        organization: {
          findUnique: vi.fn(async () => ({ parentId: "holdingA" })),
        },
        passwordResetToken: { create: vi.fn(async () => ({})) },
        notification: { createMany: notificationCreateMany },
      },
    }));
    const { requestPasswordReset } = await import("./auth");

    const result = await requestPasswordReset("jean@clinica.com");

    expect(result.success).toBe(true);
    expect(notifiedIds).toContain("coordA");
    expect(notifiedIds).toContain("adminHoldingA");
    expect(notifiedIds).not.toContain("coordB");
  });

  it("notifie uniquement les comptes SUPER_ADMIN quand le demandeur n'a aucune organisation", async () => {
    let notifiedIds: string[] = [];
    const notificationCreateMany = vi.fn(async ({ data }: any) => { notifiedIds = data.map((n: any) => n.userId); return { count: data.length }; });
    const userFindMany = vi.fn(async ({ where }: any) => {
      if (where.role === "SUPER_ADMIN") return [{ id: "super1", role: "SUPER_ADMIN", organizationId: null, isActive: true }];
      return [];
    });

    vi.doMock("@/lib/db", () => ({
      prisma: {
        user: {
          findUnique: vi.fn(async () => ({
            id: "requester2",
            firstName: "Alex",
            lastName: "Root",
            email: "alex@platform.com",
            isActive: true,
            organizationId: null,
          })),
          findMany: userFindMany,
        },
        organization: { findUnique: vi.fn() },
        passwordResetToken: { create: vi.fn(async () => ({})) },
        notification: { createMany: notificationCreateMany },
      },
    }));
    const { requestPasswordReset } = await import("./auth");

    const result = await requestPasswordReset("alex@platform.com");

    expect(result.success).toBe(true);
    expect(notifiedIds).toEqual(["super1"]);
  });

  it("répond toujours le même message générique quand le compte n'existe pas (anti-énumération)", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        user: { findUnique: vi.fn(async () => null), findMany: vi.fn() },
        organization: { findUnique: vi.fn() },
        passwordResetToken: { create: vi.fn() },
        notification: { createMany: vi.fn() },
      },
    }));
    const { requestPasswordReset } = await import("./auth");

    const result = await requestPasswordReset("inconnu@nulle-part.com");

    expect(result.success).toBe(true);
    expect((result as any).message).toMatch(/Si un compte existe/);
  });
});
