import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Protocole de sortie (closeCarePlan) et facturation des nuitées (src/lib/hospital-stay-db.ts).
// Scénario : patient entré le 10/10 à 11h (Douala) dans un lit à 15 000 FCFA la nuit, sortie
// demandée le 12/10 à 11h → 2 nuitées = 30 000 FCFA.

const authState = vi.hoisted(() => ({ user: { id: "doc1", role: "MEDECIN", firstName: "Jean", lastName: "Mballa", organizationId: "clinicA" } as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => authState.user,
  verifyPatientAccess: async () => true,
}));

type Options = { hospitalized?: boolean; paid?: number; claimFails?: boolean; extraUnpaidInvoice?: number };

function mockDb(options: Options = {}) {
  const { hospitalized = true, paid = 0, claimFails = false, extraUnpaidInvoice = 0 } = options;
  const createdInvoices: Array<{ id: string; items: Array<{ amount: number }>; hospitalStayId?: string }> = [];
  const stay = {
    id: "stay1",
    patientId: "p1",
    organizationId: "clinicA",
    status: "OPEN",
    nightsBilled: 0,
    admittedAt: new Date("2026-10-10T10:00:00.000Z"),
    bedStays: [
      { id: "seg1", bedLabel: "A", roomName: "Chambre 3", wardName: "Médecine", nightlyRate: 15000, startedAt: new Date("2026-10-10T10:00:00.000Z"), endedAt: null },
    ],
  };
  type Args = { data: Record<string, unknown> };
  const models = {
    carePlan: {
      findUnique: vi.fn(async () => ({ patientId: "p1", status: "ACTIVE" })),
      update: vi.fn(async ({ data }: Args) => ({ id: "cp1", ...data })),
    },
    patient: {
      findUnique: vi.fn(async () => ({ bedId: hospitalized ? "bedA" : null, ipp: "IPP-2026-000042", user: { firstName: "Awa", lastName: "Ndiaye" } })),
      update: vi.fn(async () => ({})),
    },
    bed: { update: vi.fn(async () => ({})) },
    medicalRecord: { create: vi.fn(async () => ({})) },
    hospitalStay: {
      findFirst: vi.fn(async () => (hospitalized ? stay : null)),
      findUnique: vi.fn(async () => stay),
      updateMany: vi.fn(async ({ data }: Args) => {
        if (claimFails) return { count: 0 };
        stay.nightsBilled = Number(data.nightsBilled);
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: Args) => ({ ...stay, ...data })),
    },
    bedStay: { updateMany: vi.fn(async () => ({ count: 1 })) },
    pendingInvoice: {
      create: vi.fn(async ({ data }: Args) => {
        const inv = { id: `inv${createdInvoices.length + 1}`, ...data } as (typeof createdInvoices)[number];
        createdInvoices.push(inv);
        return inv;
      }),
      findMany: vi.fn(async () => [
        ...createdInvoices.map((i) => ({ id: i.id, items: i.items, hospitalStayId: i.hospitalStayId })),
        ...(extraUnpaidInvoice ? [{ id: "pharma1", items: [{ amount: extraUnpaidInvoice }], hospitalStayId: null }] : []),
      ]),
    },
    financialTransaction: {
      groupBy: vi.fn(async () => (paid ? [{ pendingInvoiceId: "inv1", _sum: { amount: paid } }] : [])),
    },
  };
  const db = { ...models, $transaction: vi.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db)) };
  vi.doMock("@/lib/db", () => ({ prisma: db }));
  return { db, stay, createdInvoices };
}

beforeEach(() => {
  vi.resetModules();
  authState.user = { id: "doc1", role: "MEDECIN", firstName: "Jean", lastName: "Mballa", organizationId: "clinicA" };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T10:00:00.000Z"));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("closeCarePlan — sortie d'un patient hospitalisé", () => {
  it("facture les nuitées et bloque la sortie d'un médecin tant qu'il reste à payer (facture conservée pour la caisse)", async () => {
    const { db, createdInvoices } = mockDb();
    const { closeCarePlan } = await import("./careplans");

    const result = await closeCarePlan("cp1", "p1", "Évolution favorable");

    expect(result).toMatchObject({ success: false, blocked: true, outstanding: 30000, canForce: false });
    expect(createdInvoices).toEqual([
      expect.objectContaining({
        status: "PENDING",
        patientId: "p1",
        organizationId: "clinicA",
        hospitalStayId: "stay1",
        items: [expect.objectContaining({ type: "SERVICE", quantity: 2, unitPrice: 15000, amount: 30000 })],
      }),
    ]);
    // Rien n'est clôturé : patient toujours hospitalisé, lit toujours occupé.
    expect(db.carePlan.update).not.toHaveBeenCalled();
    expect(db.bed.update).not.toHaveBeenCalled();
  });

  it("propose au coordinateur de forcer la sortie avec un motif, sans rien clôturer tant qu'il n'est pas donné", async () => {
    authState.user = { ...authState.user, id: "coord1", role: "COORDINATOR" };
    const { db } = mockDb();
    const { closeCarePlan } = await import("./careplans");

    const result = await closeCarePlan("cp1", "p1", "Évolution favorable");

    expect(result).toMatchObject({ success: false, blocked: true, canForce: true });
    expect(db.carePlan.update).not.toHaveBeenCalled();
  });

  it("sort le patient sur décision motivée du coordinateur et trace le montant dû", async () => {
    authState.user = { ...authState.user, id: "coord1", role: "COORDINATOR" };
    const { db } = mockDb();
    const { closeCarePlan } = await import("./careplans");

    const result = await closeCarePlan("cp1", "p1", "Évolution favorable", { forceReason: "Prise en charge assurance" });

    expect(result.success).toBe(true);
    expect(db.bed.update).toHaveBeenCalledWith({ where: { id: "bedA" }, data: { status: "AVAILABLE" } });
    expect(db.patient.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "DISCHARGED", bedId: null } });
    expect(db.bedStay.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ endedReason: "DISCHARGE" }) }));
    expect(db.hospitalStay.update).toHaveBeenCalledWith({
      where: { id: "stay1" },
      data: expect.objectContaining({ status: "CLOSED", dischargedById: "coord1", dischargeOverrideReason: "Prise en charge assurance", outstandingAtDischarge: 30000 }),
    });
    expect(result.success && result.bulletin).toMatchObject({ outstanding: 30000, overrideReason: "Prise en charge assurance", dischargedBy: "Jean Mballa" });
  });

  it("sort le patient sans blocage une fois tout réglé", async () => {
    const { db } = mockDb({ paid: 30000 });
    const { closeCarePlan } = await import("./careplans");

    const result = await closeCarePlan("cp1", "p1", "Évolution favorable");

    expect(result.success).toBe(true);
    expect(db.hospitalStay.update).toHaveBeenCalledWith({
      where: { id: "stay1" },
      data: expect.not.objectContaining({ dischargeOverrideReason: expect.anything() }),
    });
    expect(result.success && result.bulletin).toMatchObject({ outstanding: 0, overrideReason: null, stay: { nightsBilled: 2 } });
  });

  it("refuse si une autre facturation du même séjour est en cours (jamais deux fois les mêmes nuits)", async () => {
    const { createdInvoices } = mockDb({ claimFails: true });
    const { closeCarePlan } = await import("./careplans");

    const result = await closeCarePlan("cp1", "p1", "Évolution favorable");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/en cours de facturation/);
    expect(createdInvoices).toHaveLength(0);
  });
});

describe("closeCarePlan — suivi ambulatoire", () => {
  it("clôture les soins sans facturation de séjour ni contrôle de solde (une vente à crédit ne bloque pas)", async () => {
    const { db, createdInvoices } = mockDb({ hospitalized: false, extraUnpaidInvoice: 5000 });
    const { closeCarePlan } = await import("./careplans");

    const result = await closeCarePlan("cp1", "p1", "Fin du traitement");

    expect(result.success).toBe(true);
    expect(createdInvoices).toHaveLength(0);
    expect(db.pendingInvoice.findMany).not.toHaveBeenCalled();
    expect(result.success && result.bulletin).toMatchObject({ stay: null, outstanding: 0 });
  });
});
