import { describe, it, expect, vi, beforeEach } from "vitest";

// Régression : ces routes lisaient le rôle dans les en-têtes `x-user-role`, donc falsifiables
// par n'importe quel client. Elles doivent désormais refuser tout appel sans session valide.

type QueryArgs = { where?: Record<string, unknown>; select?: Record<string, unknown>; skip?: number; take?: number };

const forgedHeaders = { "x-user-role": "ADMIN", "x-user-id": "attacker" };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/rateLimiter", () => ({ rateLimitOrResponse: vi.fn(async () => null) }));
  vi.doMock("@/services/UserService", () => ({ UserService: { createUser: vi.fn() } }));
});

describe("routes de liste — identité issue de la session uniquement", () => {
  it("GET /api/users refuse un en-tête forgé sans session (401)", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
    const findMany = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { user: { findMany, count: vi.fn() } } }));

    const { GET } = await import("@/app/api/users/route");
    const res = await GET(new Request("http://localhost/api/users", { headers: forgedHeaders }));

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("GET /api/patients refuse un en-tête forgé sans session (401)", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
    const findMany = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { patient: { findMany, count: vi.fn() } } }));

    const { GET } = await import("@/app/api/patients/route");
    const res = await GET(new Request("http://localhost/api/patients", { headers: forgedHeaders }));

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("GET /api/users n'expose jamais passwordHash et limite à 20 par page", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "adm1", role: "ADMIN", organizationId: "org1", organization: { type: "CLINIC" } })),
    }));
    const findMany = vi.fn(async (_args: QueryArgs) => [] as unknown[]);
    vi.doMock("@/lib/db", () => ({ prisma: { user: { findMany, count: vi.fn(async (_args: QueryArgs) => 0) } } }));

    const { GET } = await import("@/app/api/users/route");
    const res = await GET(new Request("http://localhost/api/users?pageSize=500"));

    expect(res.status).toBe(200);
    const args = findMany.mock.calls[0][0] as { select: Record<string, unknown>; take: number };
    expect(args.select).not.toHaveProperty("passwordHash");
    expect(args.take).toBe(20);
  });

  it("GET /api/patients borne la page à 20 et applique le périmètre d'organisation", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "c1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } })),
    }));
    const findMany = vi.fn(async (_args: QueryArgs) => [] as unknown[]);
    vi.doMock("@/lib/db", () => ({ prisma: { patient: { findMany, count: vi.fn(async (_args: QueryArgs) => 0) } } }));

    const { GET } = await import("@/app/api/patients/route");
    await GET(new Request("http://localhost/api/patients?pageSize=100"));

    const args = findMany.mock.calls[0][0] as { where: unknown; take: number };
    expect(args.take).toBe(20);
    expect(args.where).toEqual({ organizationId: "org1" });
  });
});
