import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ user: { id: "c1", role: "COMPTABLE", organizationId: "org1", organization: { type: "CLINIC" } } as Record<string, unknown> }));

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "c1", role: "COMPTABLE", organizationId: "org1", organization: { type: "CLINIC" } };
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => state.user) }));
  vi.doMock("@/lib/modules-server", () => ({ assertUserModule: vi.fn() }));
});

function mockDb() {
  const settlementCreate = vi.fn(async ({ data }: any) => ({ id: "s1", ...data }));
  const partnerUpdate = vi.fn(async () => ({}));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      partner: {
        findUnique: vi.fn(async () => ({ id: "pa1", organizationId: "org1", name: "La Plénitude", billing: "PARTNER" })),
        update: partnerUpdate,
      },
      partnerSettlement: { create: settlementCreate, findMany: vi.fn(async () => [{ id: "s1", amount: 30000, paymentMethod: "CASH", reference: null, paidAt: new Date(), notes: null }]) },
      labTest: { count: vi.fn(async ({ where }: any) => where.id.in.length) },
      labOrder: {
        findMany: vi.fn(async () => [
          { id: "o1", createdAt: new Date(), status: "VALIDATED", tests: ["NFS"], testDetails: [{ testName: "NFS", totalPrice: 50000 }], partnerReference: "B1", pendingInvoiceId: null, patient: null },
        ]),
      },
    },
  }));
  return { settlementCreate, partnerUpdate };
}

describe("règlements des partenaires", () => {
  it("enregistre un versement et calcule le reste dû du relevé", async () => {
    const m = mockDb();
    const { recordPartnerSettlement, getPartnerStatement } = await import("./partners");

    expect((await recordPartnerSettlement({ partnerId: "pa1", month: "2026-11", amount: 30000, paymentMethod: "CASH" })).success).toBe(true);
    expect(m.settlementCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ partnerId: "pa1", month: "2026-11", amount: 30000, recordedById: "c1" }) });

    const st = await getPartnerStatement({ partnerId: "pa1", month: "2026-11" });
    expect(st).toMatchObject({ success: true, data: { total: 50000, paid: 30000, balance: 20000 } });
  });

  it("refuse un versement à un rôle hors finance, et un tarif d'un autre rôle que le coordinateur", async () => {
    state.user = { id: "l1", role: "LABORANTIN", organizationId: "org1", organization: { type: "CLINIC" } };
    const m = mockDb();
    const { recordPartnerSettlement, savePartnerPrices } = await import("./partners");
    expect((await recordPartnerSettlement({ partnerId: "pa1", month: "2026-11", amount: 1000, paymentMethod: "CASH" })).success).toBe(false);
    expect((await savePartnerPrices({ partnerId: "pa1", prices: { lt1: 1000 } })).success).toBe(false);
    expect(m.partnerUpdate).not.toHaveBeenCalled();
  });

  it("laisse le coordinateur fixer les tarifs propres du partenaire", async () => {
    state.user = { id: "co", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
    const m = mockDb();
    const { savePartnerPrices } = await import("./partners");
    const res = await savePartnerPrices({ partnerId: "pa1", prices: { lt1: 1000, lt2: 2500 } });
    expect(res).toMatchObject({ success: true, data: { count: 2 } });
    expect(m.partnerUpdate).toHaveBeenCalledWith({ where: { id: "pa1" }, data: { prices: { lt1: 1000, lt2: 2500 } } });
  });
});
