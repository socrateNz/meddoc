import { describe, it, expect, vi, beforeEach } from "vitest";

const cashierUser = { id: "u1", role: "CASHIER", organizationId: "clinicA", organization: { type: "CLINIC" } };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => cashierUser) }));
});

describe("openRegisterSession", () => {
  it("ouvre normalement une caisse dont hasOpenSession est false", async () => {
    const registerUpdateMany = vi.fn(async () => ({ count: 1 }));
    const sessionCreate = vi.fn(async ({ data }: any) => ({ id: "sess1", ...data }));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashRegister: {
          findUnique: vi.fn(async () => ({ id: "reg1", isActive: true, organizationId: "clinicA" })),
          updateMany: registerUpdateMany,
        },
        cashSession: { create: sessionCreate },
      },
    }));
    const { openRegisterSession } = await import("./registers");

    const result = await openRegisterSession({ registerId: "reg1", openingFloat: 5000 });

    expect(result.success).toBe(true);
    expect(registerUpdateMany).toHaveBeenCalledWith({
      where: { id: "reg1", hasOpenSession: false },
      data: { hasOpenSession: true },
    });
    expect(sessionCreate).toHaveBeenCalled();
  });

  it("refuse l'ouverture si la caisse vient d'être ouverte par une autre requête (course concurrente)", async () => {
    const registerUpdateMany = vi.fn(async () => ({ count: 0 }));
    const sessionCreate = vi.fn();

    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashRegister: {
          findUnique: vi.fn(async () => ({ id: "reg1", isActive: true, organizationId: "clinicA" })),
          updateMany: registerUpdateMany,
        },
        cashSession: { create: sessionCreate },
      },
    }));
    const { openRegisterSession } = await import("./registers");

    const result = await openRegisterSession({ registerId: "reg1", openingFloat: 5000 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/vient d'être ouverte/);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("libère le verrou si la création de la session échoue après une réclamation réussie", async () => {
    const registerUpdateMany = vi.fn(async () => ({ count: 1 }));
    const registerUpdate = vi.fn(async () => ({}));
    const sessionCreate = vi.fn(async () => { throw new Error("Erreur DB inattendue"); });

    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashRegister: {
          findUnique: vi.fn(async () => ({ id: "reg1", isActive: true, organizationId: "clinicA" })),
          updateMany: registerUpdateMany,
          update: registerUpdate,
        },
        cashSession: { create: sessionCreate },
      },
    }));
    const { openRegisterSession } = await import("./registers");

    const result = await openRegisterSession({ registerId: "reg1", openingFloat: 5000 });

    expect(result.success).toBe(false);
    expect(registerUpdate).toHaveBeenCalledWith({ where: { id: "reg1" }, data: { hasOpenSession: false } });
  });
});

describe("closeRegisterSession", () => {
  it("libère le verrou hasOpenSession de la caisse à la fermeture", async () => {
    const cashRegisterUpdate = vi.fn(async () => ({}));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        cashSession: {
          findUnique: vi.fn(async () => ({ id: "sess1", registerId: "reg1", status: "OPEN", organizationId: "clinicA", openingFloat: 5000 })),
          update: vi.fn(async ({ data }: any) => ({ id: "sess1", ...data })),
        },
        financialTransaction: { findMany: vi.fn(async () => []) },
        cashRegister: { update: cashRegisterUpdate },
      },
    }));
    const { closeRegisterSession } = await import("./registers");

    const result = await closeRegisterSession({ sessionId: "sess1", countedAmount: 5000 });

    expect(result.success).toBe(true);
    expect(cashRegisterUpdate).toHaveBeenCalledWith({ where: { id: "reg1" }, data: { hasOpenSession: false } });
  });
});
