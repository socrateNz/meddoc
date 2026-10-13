import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CHECKLIST } from "@/lib/surgery";

const state = vi.hoisted(() => ({
  user: { id: "d1", role: "MEDECIN", organizationId: "org1", organization: { type: "CLINIC" } } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user, verifyPatientAccess: async () => true }));

type Options = { conflicts?: Record<string, unknown>[][]; surgery?: Record<string, unknown>; paidCount?: number; claimFails?: boolean };

function mockDb(options: Options = {}) {
  const conflictCalls = [...(options.conflicts ?? [])];
  const invoiceCreate = vi.fn(async () => ({ id: "inv1" }));
  const caseCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data }));
  const caseDelete = vi.fn(async () => ({}));
  const invoiceDelete = vi.fn(async () => ({}));
  const updateMany = vi.fn(async () => ({ count: options.claimFails ? 0 : 1 }));
  const invoiceUpdateMany = vi.fn(async () => ({ count: 1 }));
  const tx = { pendingInvoice: { create: invoiceCreate }, surgeryCase: { create: caseCreate } };
  vi.doMock("@/lib/db", () => ({
    prisma: {
      patient: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
      operatingRoom: { findUnique: vi.fn(async () => ({ id: "room1", organizationId: "org1", isActive: true })) },
      user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ role: where.id.startsWith("n") ? "CAREGIVER" : "MEDECIN", organizationId: "org1", isActive: true })) },
      surgeryCase: {
        findMany: vi.fn(async () => conflictCalls.shift() ?? []),
        findUnique: vi.fn(async () => options.surgery ?? null),
        delete: caseDelete,
        updateMany,
      },
      financialTransaction: { count: vi.fn(async () => options.paidCount ?? 0) },
      pendingInvoice: { delete: invoiceDelete, updateMany: invoiceUpdateMany },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }));
  return { invoiceCreate, caseCreate, caseDelete, invoiceDelete, updateMany, invoiceUpdateMany };
}

const schedule = {
  patientId: "p1",
  operatingRoomId: "room1",
  date: "2026-10-14",
  time: "08:00",
  durationMinutes: 90,
  procedure: "Appendicectomie",
  anesthesiaType: "GENERAL" as const,
  surgeonId: "d1",
  anesthetistId: "d2",
  scrubNurseId: "n1",
  fee: 250000,
};

const signed = { answers: {}, notes: null, checkedById: "n1", checkedAt: "2026-10-14T07:00:00Z" };
const surgery = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  organizationId: "org1",
  patientId: "p1",
  operatingRoomId: "room1",
  surgeonId: "d1",
  status: "SCHEDULED",
  checklist: null,
  pendingInvoiceId: "inv1",
  updatedAt: new Date("2026-10-13T10:00:00Z"),
  ...extra,
});

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "d1", role: "MEDECIN", organizationId: "org1", organization: { type: "CLINIC" } };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleSurgery", () => {
  it("programme à l'heure de la clinique et facture le forfait", async () => {
    const { caseCreate, invoiceCreate } = mockDb();
    const { scheduleSurgery } = await import("./surgery");

    const result = await scheduleSurgery(schedule);

    expect(result).toEqual({ success: true, data: { id: "c1", date: "2026-10-14" } });
    expect(caseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ scheduledStart: new Date("2026-10-14T07:00:00Z"), scheduledEnd: new Date("2026-10-14T08:30:00Z"), pendingInvoiceId: "inv1", fee: 250000 }),
    });
    expect(invoiceCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ items: [expect.objectContaining({ type: "SERVICE", amount: 250000 })] }) });
  });

  it("refuse un créneau déjà occupé dans la salle", async () => {
    const { caseCreate } = mockDb({ conflicts: [[{ id: "x", procedure: "Césarienne", operatingRoomId: "room1" }]] });
    const { scheduleSurgery } = await import("./surgery");

    const result = await scheduleSurgery(schedule);

    expect(result.success ? "" : result.error).toMatch(/occupé dans cette salle.*Césarienne/);
    expect(caseCreate).not.toHaveBeenCalled();
  });

  it("retire sa programmation si une autre a pris le créneau entre-temps", async () => {
    const { caseDelete, invoiceDelete } = mockDb({ conflicts: [[], [{ id: "x", procedure: "Hernie", operatingRoomId: "room2" }]] });
    const { scheduleSurgery } = await import("./surgery");

    const result = await scheduleSurgery(schedule);

    expect(result.success ? "" : result.error).toMatch(/membre de l'équipe/);
    expect(caseDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(invoiceDelete).toHaveBeenCalledWith({ where: { id: "inv1" } });
  });

  it("refuse un même chirurgien et anesthésiste, et un créneau passé", async () => {
    mockDb();
    let { scheduleSurgery } = await import("./surgery");
    expect((await scheduleSurgery({ ...schedule, anesthetistId: "d1" })).success).toBe(false);

    vi.resetModules();
    mockDb();
    ({ scheduleSurgery } = await import("./surgery"));
    const result = await scheduleSurgery({ ...schedule, date: "2026-10-10" });
    expect(result.success ? "" : result.error).toMatch(/passé/);
  });

  it("réserve la programmation au médecin et au coordinateur", async () => {
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1" };
    mockDb();
    const { scheduleSurgery } = await import("./surgery");
    expect((await scheduleSurgery(schedule)).success).toBe(false);
  });
});

describe("check-list et déroulement", () => {
  it("laisse l'infirmier(e) signer une étape complète, en contrôlant la version lue", async () => {
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1" };
    const { updateMany } = mockDb({ surgery: surgery() });
    const { signChecklistPhase } = await import("./surgery");
    const answers = Object.fromEntries(CHECKLIST.SIGN_IN.items.map((i) => [i.key, "YES" as const]));

    expect(await signChecklistPhase({ caseId: "c1", phase: "SIGN_IN", answers })).toEqual({ success: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "SCHEDULED", updatedAt: new Date("2026-10-13T10:00:00Z") },
      data: { checklist: { SIGN_IN: expect.objectContaining({ answers, checkedById: "n1" }) } },
    });
  });

  it("refuse de commencer sans la check-list et de terminer sans compte-rendu", async () => {
    mockDb({ surgery: surgery({ checklist: { SIGN_IN: signed } }) });
    let { updateSurgeryStatus } = await import("./surgery");
    expect((await updateSurgeryStatus({ caseId: "c1", action: "START" })).success).toBe(false);

    vi.resetModules();
    mockDb({ surgery: surgery({ status: "IN_PROGRESS", checklist: { SIGN_IN: signed, TIME_OUT: signed, SIGN_OUT: signed } }) });
    ({ updateSurgeryStatus } = await import("./surgery"));
    const res = await updateSurgeryStatus({ caseId: "c1", action: "COMPLETE", operativeReport: "court", postOpInstructions: "Surveillance" });
    expect(res.success ? "" : res.error).toMatch(/compte-rendu opératoire est requis/);
  });

  it("réserve le compte-rendu au chirurgien de l'intervention", async () => {
    state.user = { id: "d2", role: "MEDECIN", organizationId: "org1" };
    const { updateMany } = mockDb({ surgery: surgery({ status: "IN_PROGRESS", checklist: { SIGN_IN: signed, TIME_OUT: signed, SIGN_OUT: signed } }) });
    const { updateSurgeryStatus } = await import("./surgery");

    const res = await updateSurgeryStatus({ caseId: "c1", action: "COMPLETE", operativeReport: "Compte-rendu opératoire détaillé.", postOpInstructions: "Surveillance" });

    expect(res.success ? "" : res.error).toMatch(/Seul le chirurgien/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("annule une intervention impayée en clôturant sa facture, refuse si déjà réglée", async () => {
    const first = mockDb({ surgery: surgery() });
    let { updateSurgeryStatus } = await import("./surgery");
    expect(await updateSurgeryStatus({ caseId: "c1", action: "CANCEL", reason: "Patient fébrile" })).toEqual({ success: true, data: { status: "CANCELLED" } });
    expect(first.invoiceUpdateMany).toHaveBeenCalledWith({ where: { id: "inv1", status: "PENDING" }, data: expect.objectContaining({ status: "CANCELLED" }) });

    vi.resetModules();
    const second = mockDb({ surgery: surgery(), paidCount: 1 });
    ({ updateSurgeryStatus } = await import("./surgery"));
    const res = await updateSurgeryStatus({ caseId: "c1", action: "CANCEL", reason: "Patient fébrile" });
    expect(res.success ? "" : res.error).toMatch(/réglée/);
    expect(second.updateMany).not.toHaveBeenCalled();
  });
});
