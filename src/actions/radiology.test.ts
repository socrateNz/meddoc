import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "d1", role: "MEDECIN", organizationId: "org1" } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user, verifyPatientAccess: async () => true }));

type Options = { exams?: Record<string, unknown>[]; order?: Record<string, unknown>; paidCount?: number; claimFails?: boolean };

function mockDb(options: Options = {}) {
  const invoiceCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "inv1", ...data }));
  const orderCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "o1", ...data }));
  const orderUpdateMany = vi.fn(async () => ({ count: options.claimFails ? 0 : 1 }));
  const invoiceUpdateMany = vi.fn(async () => ({ count: 1 }));
  const tx = { pendingInvoice: { create: invoiceCreate }, radiologyOrder: { create: orderCreate } };
  vi.doMock("@/lib/db", () => ({
    prisma: {
      patient: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
      radiologyExam: { findMany: vi.fn(async () => options.exams ?? []) },
      radiologyOrder: { findUnique: vi.fn(async () => options.order ?? null), updateMany: orderUpdateMany },
      financialTransaction: { count: vi.fn(async () => options.paidCount ?? 0) },
      pendingInvoice: { updateMany: invoiceUpdateMany },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }));
  return { invoiceCreate, orderCreate, orderUpdateMany, invoiceUpdateMany };
}

const order = (status: string, extra: Record<string, unknown> = {}) => ({ id: "o1", patientId: "p1", organizationId: "org1", status, pendingInvoiceId: "inv1", ...extra });

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "d1", role: "MEDECIN", organizationId: "org1" };
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createRadiologyOrder", () => {
  it("facture à la prescription avec le tarif figé du catalogue", async () => {
    const { invoiceCreate, orderCreate } = mockDb({ exams: [{ id: "e1", name: "Radio thorax", modality: "XRAY", basePrice: 15000 }] });
    const { createRadiologyOrder } = await import("./radiology");

    const result = await createRadiologyOrder({ patientId: "p1", examIds: ["e1"] });

    expect(result).toEqual({ success: true, data: { id: "o1", invoiceCreated: true } });
    expect(invoiceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "PENDING", organizationId: "org1", items: [expect.objectContaining({ type: "SERVICE", amount: 15000 })] }),
    });
    expect(orderCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ pendingInvoiceId: "inv1", orderedById: "d1", exams: [expect.objectContaining({ examId: "e1", price: 15000 })] }) });
  });

  it("refuse un examen absent du catalogue actif de la clinique", async () => {
    const { orderCreate } = mockDb({ exams: [] });
    const { createRadiologyOrder } = await import("./radiology");

    const result = await createRadiologyOrder({ patientId: "p1", examIds: ["e1"] });

    expect(result.success ? "" : result.error).toMatch(/plus disponible/);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("réserve la prescription au médecin et au coordinateur", async () => {
    mockDb({ exams: [{ id: "e1", name: "X", modality: "XRAY", basePrice: 1 }] });
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1" };
    const { createRadiologyOrder } = await import("./radiology");
    expect((await createRadiologyOrder({ patientId: "p1", examIds: ["e1"] })).success).toBe(false);
  });
});

describe("updateRadiologyOrder", () => {
  it("laisse l'infirmier(e) réaliser l'examen mais pas rédiger le compte-rendu", async () => {
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1" };
    const { orderUpdateMany } = mockDb({ order: order("PRESCRIBED") });
    let { updateRadiologyOrder } = await import("./radiology");
    expect(await updateRadiologyOrder({ orderId: "o1", action: "PERFORM" })).toEqual({ success: true, data: { status: "PERFORMED" } });
    expect(orderUpdateMany).toHaveBeenCalledWith({ where: { id: "o1", status: "PRESCRIBED" }, data: expect.objectContaining({ status: "PERFORMED", performedById: "n1" }) });

    vi.resetModules();
    mockDb({ order: order("PERFORMED") });
    ({ updateRadiologyOrder } = await import("./radiology"));
    expect((await updateRadiologyOrder({ orderId: "o1", action: "REPORT", report: "Compte-rendu détaillé", conclusion: "Normal" })).success).toBe(false);
  });

  it("refuse une validation sans compte-rendu et un conflit de modification", async () => {
    mockDb({ order: order("PERFORMED") });
    let { updateRadiologyOrder } = await import("./radiology");
    expect((await updateRadiologyOrder({ orderId: "o1", action: "VALIDATE" })).success).toBe(false);

    vi.resetModules();
    mockDb({ order: order("REPORTED"), claimFails: true });
    ({ updateRadiologyOrder } = await import("./radiology"));
    const result = await updateRadiologyOrder({ orderId: "o1", action: "VALIDATE" });
    expect(result.success ? "" : result.error).toMatch(/modifié par un autre utilisateur/);
  });

  it("annule un examen impayé et clôture sa facture", async () => {
    const { invoiceUpdateMany } = mockDb({ order: order("PRESCRIBED") });
    const { updateRadiologyOrder } = await import("./radiology");

    const result = await updateRadiologyOrder({ orderId: "o1", action: "CANCEL", reason: "Erreur de prescription" });

    expect(result).toEqual({ success: true, data: { status: "CANCELLED" } });
    expect(invoiceUpdateMany).toHaveBeenCalledWith({ where: { id: "inv1", status: "PENDING" }, data: expect.objectContaining({ status: "CANCELLED", closedById: "d1" }) });
  });

  it("refuse d'annuler un examen déjà réglé", async () => {
    const { orderUpdateMany, invoiceUpdateMany } = mockDb({ order: order("PRESCRIBED"), paidCount: 1 });
    const { updateRadiologyOrder } = await import("./radiology");

    const result = await updateRadiologyOrder({ orderId: "o1", action: "CANCEL", reason: "Erreur" });

    expect(result.success ? "" : result.error).toMatch(/déjà été \(en partie\) réglé/);
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(invoiceUpdateMany).not.toHaveBeenCalled();
  });
});
