import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "d1", role: "MEDECIN", organizationId: "org1", organization: { type: "CLINIC" } } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user, verifyPatientAccess: async () => true }));

const FUTURE = new Date(Date.now() + 10 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 3600 * 1000);

type Options = { patientBloodType?: string | null; unit?: Record<string, unknown>; transfusion?: Record<string, unknown>; claim?: number };

function mockDb(options: Options = {}) {
  const unitUpdateMany = vi.fn(async () => ({ count: options.claim ?? 1 }));
  const transfusionUpdateMany = vi.fn(async () => ({ count: options.claim ?? 1 }));
  const transfusionCreate = vi.fn(async () => ({ id: "t1" }));
  const transfusionUpdate = vi.fn(async () => ({}));
  const patientUpdate = vi.fn(async () => ({}));
  const invoiceCreate = vi.fn(async () => ({ id: "inv1" }));
  const incidentCreate = vi.fn(async () => ({ id: "inc1" }));
  const db = {
    patient: { findUnique: vi.fn(async () => ({ organizationId: "org1", bloodType: options.patientBloodType ?? null })), update: patientUpdate },
    bloodUnit: { findUnique: vi.fn(async () => options.unit ?? null), updateMany: unitUpdateMany },
    transfusion: { findUnique: vi.fn(async () => options.transfusion ?? null), create: transfusionCreate, updateMany: transfusionUpdateMany, update: transfusionUpdate },
    pendingInvoice: { create: invoiceCreate },
    incident: { create: incidentCreate },
  };
  vi.doMock("@/lib/db", () => ({ prisma: { ...db, $transaction: async (fn: (t: typeof db) => unknown) => fn(db) } }));
  return { unitUpdateMany, transfusionUpdateMany, transfusionCreate, transfusionUpdate, patientUpdate, invoiceCreate, incidentCreate };
}

const unit = (extra: Record<string, unknown> = {}) => ({ id: "u1", organizationId: "org1", unitNumber: "CNTS-001", product: "RBC", aboGroup: "O", rhesus: "NEG", status: "AVAILABLE", expiresAt: FUTURE, price: 15000, ...extra });
const reserve = { patientId: "p1", unitId: "u1", indication: "Anémie aiguë", patientAboGroup: "A" as const, patientRhesus: "POS" as const, antibodyScreen: "NEGATIVE" as const, crossmatch: "COMPATIBLE" as const };

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "d1", role: "MEDECIN", organizationId: "org1", organization: { type: "CLINIC" } };
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("reserveBloodUnit", () => {
  it("réserve une poche compatible et reporte le groupe confirmé au dossier", async () => {
    const { unitUpdateMany, transfusionCreate, patientUpdate } = mockDb({ unit: unit() });
    const { reserveBloodUnit } = await import("./blood-bank");

    expect(await reserveBloodUnit(reserve)).toEqual({ success: true, data: { id: "t1" } });
    expect(unitUpdateMany).toHaveBeenCalledWith({ where: { id: "u1", status: "AVAILABLE" }, data: { status: "RESERVED" } });
    expect(patientUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { bloodType: "A+" } });
    expect(transfusionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ bloodUnitId: "u1", crossmatch: "COMPATIBLE", requestedById: "d1" }) });
  });

  it("refuse une discordance avec le groupe du dossier", async () => {
    const { transfusionCreate } = mockDb({ unit: unit(), patientBloodType: "B+" });
    const { reserveBloodUnit } = await import("./blood-bank");

    const res = await reserveBloodUnit(reserve);

    expect(res.success ? "" : res.error).toMatch(/Discordance de groupe.*B\+/);
    expect(transfusionCreate).not.toHaveBeenCalled();
  });

  it("refuse une poche incompatible, périmée, ou sans cross-match compatible", async () => {
    for (const [u, input, pattern] of [
      [unit({ aboGroup: "B" }), reserve, /Incompatibilité ABO/],
      [unit({ expiresAt: PAST }), reserve, /périmée/],
      [unit(), { ...reserve, crossmatch: "INCOMPATIBLE" as const }, /Cross-match compatible exigé/],
    ] as const) {
      vi.resetModules();
      const { transfusionCreate } = mockDb({ unit: u });
      const { reserveBloodUnit } = await import("./blood-bank");
      const res = await reserveBloodUnit(input);
      expect(res.success ? "" : res.error).toMatch(pattern);
      expect(transfusionCreate).not.toHaveBeenCalled();
    }
  });

  it("refuse la réservation à l'infirmier(e)", async () => {
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1" };
    mockDb({ unit: unit() });
    const { reserveBloodUnit } = await import("./blood-bank");
    expect((await reserveBloodUnit(reserve)).success).toBe(false);
  });
});

describe("pose et fin de transfusion", () => {
  const transfusion = (status: string) => ({ id: "t1", organizationId: "org1", patientId: "p1", bloodUnitId: "u1", status });
  const allChecks = { identity: true, unit: true, expiry: true, abo_card: true, vitals: true };

  it("exige tout le contrôle ultime au lit", async () => {
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1" };
    const { transfusionUpdateMany } = mockDb({ transfusion: transfusion("RESERVED"), unit: unit({ status: "RESERVED" }) });
    const { startTransfusion } = await import("./blood-bank");

    const res = await startTransfusion({ transfusionId: "t1", checks: { ...allChecks, abo_card: false }, preVitals: "TA 12/7" });

    expect(res.success ? "" : res.error).toMatch(/Contrôle ultime non validé.*ABO/);
    expect(transfusionUpdateMany).not.toHaveBeenCalled();
  });

  it("pose la transfusion, consomme la poche et la facture", async () => {
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1" };
    const { transfusionUpdateMany, unitUpdateMany, invoiceCreate, transfusionUpdate } = mockDb({ transfusion: transfusion("RESERVED"), unit: unit({ status: "RESERVED" }) });
    const { startTransfusion } = await import("./blood-bank");

    expect(await startTransfusion({ transfusionId: "t1", checks: allChecks, preVitals: "TA 120/75, FC 88" })).toEqual({ success: true });
    expect(transfusionUpdateMany).toHaveBeenCalledWith({ where: { id: "t1", status: "RESERVED" }, data: expect.objectContaining({ status: "IN_PROGRESS", bedsideCheckById: "n1" }) });
    expect(unitUpdateMany).toHaveBeenCalledWith({ where: { id: "u1", status: "RESERVED" }, data: { status: "TRANSFUSED" } });
    expect(invoiceCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ items: [expect.objectContaining({ amount: 15000 })] }) });
    expect(transfusionUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { pendingInvoiceId: "inv1" } });
  });

  it("refuse de poser une poche périmée entre-temps", async () => {
    mockDb({ transfusion: transfusion("RESERVED"), unit: unit({ status: "RESERVED", expiresAt: PAST }) });
    const { startTransfusion } = await import("./blood-bank");
    const res = await startTransfusion({ transfusionId: "t1", checks: allChecks, preVitals: "TA 120/75" });
    expect(res.success ? "" : res.error).toMatch(/périmée/);
  });

  it("déclare un incident critique d'hémovigilance en cas de réaction grave", async () => {
    const { incidentCreate, transfusionUpdate } = mockDb({ transfusion: transfusion("IN_PROGRESS"), unit: unit() });
    const { completeTransfusion } = await import("./blood-bank");

    const res = await completeTransfusion({ transfusionId: "t1", reaction: "HEMOLYTIC", reactionDetails: "Frissons, douleurs lombaires", postVitals: "TA 90/50" });

    expect(res).toEqual({ success: true, data: { incidentId: "inc1" } });
    expect(incidentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId: "p1", priority: "CRITICAL", description: expect.stringContaining("CNTS-001") }) });
    expect(transfusionUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { incidentId: "inc1" } });
  });

  it("annule une réservation et remet la poche en stock", async () => {
    const { unitUpdateMany } = mockDb({ transfusion: transfusion("RESERVED") });
    const { cancelTransfusion } = await import("./blood-bank");

    expect(await cancelTransfusion({ transfusionId: "t1", reason: "Transfusion différée" })).toEqual({ success: true });
    expect(unitUpdateMany).toHaveBeenCalledWith({ where: { id: "u1", status: "RESERVED" }, data: { status: "AVAILABLE" } });
  });
});
