import { describe, it, expect, vi, beforeEach } from "vitest";

// Mêmes principes que src/actions/stock.test.ts et src/lib/permissions.test.ts :
// on mocke aux frontières du module (db, auth, audit, notifications, next/cache)
// pour tester la logique métier de completeConsultation sans base réelle ni
// contexte de requête Next.js.

const activeUser = { id: "user1", role: "MEDECIN", organizationId: "org1" };

function createFakeTx(overrides: Partial<Record<string, any>> = {}) {
  return {
    appointment: { update: vi.fn(async ({ data }: any) => ({ id: "apt1", ...data })) },
    medicalRecord: { create: vi.fn(async ({ data }: any) => ({ id: "record1", ...data })) },
    patient: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
    pharmacyItem: { findFirst: vi.fn(async () => null) },
    prescription: {
      create: vi.fn(async ({ data }: any) => ({ id: "presc1", ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: "presc1", ...data })),
    },
    pendingInvoice: { create: vi.fn(async ({ data }: any) => ({ id: "invoice1", ...data })) },
    consultationDraft: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    ...overrides,
  };
}

function mockDb({ labOrderCount = 0, tx }: { labOrderCount?: number; tx: ReturnType<typeof createFakeTx> }) {
  vi.doMock("@/lib/db", () => ({
    prisma: {
      labOrder: { count: vi.fn(async () => labOrderCount) },
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("@/actions/prescriptions", () => ({ runInteractionCheck: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("completeConsultation", () => {
  it("refuses de clôturer si des demandes d'analyse du rendez-vous n'ont pas de résultats validés", async () => {
    const tx = createFakeTx();
    mockDb({ labOrderCount: 2, tx });
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { completeConsultation } = await import("./appointments");

    const result = await completeConsultation({
      appointmentId: "apt1",
      patientId: "patient1",
      symptoms: "s",
      diagnosis: "d",
      plan: "p",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/en attente de résultats validés/);
    // Le blocage doit intervenir avant toute écriture.
    expect(tx.medicalRecord.create).not.toHaveBeenCalled();
  });

  it("refuse un rôle non autorisé (CAREGIVER ne peut pas clôturer)", async () => {
    const tx = createFakeTx();
    mockDb({ tx });
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...activeUser, role: "CAREGIVER" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { completeConsultation } = await import("./appointments");

    const result = await completeConsultation({
      patientId: "patient1",
      symptoms: "s",
      diagnosis: "d",
      plan: "p",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/coordinateur ou un médecin/);
    expect(tx.medicalRecord.create).not.toHaveBeenCalled();
  });

  it("crée le dossier médical et une facture en attente quand rien ne bloque", async () => {
    const tx = createFakeTx();
    mockDb({ labOrderCount: 0, tx });
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => activeUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    const { completeConsultation } = await import("./appointments");

    const result = await completeConsultation({
      patientId: "patient1",
      symptoms: "Fièvre",
      diagnosis: "Paludisme suspecté",
      plan: "Traitement antipaludéen",
    });

    expect(result.success).toBe(true);
    expect(result.pendingInvoiceCreated).toBe(true);
    expect(tx.medicalRecord.create).toHaveBeenCalledTimes(1);
    expect(tx.pendingInvoice.create).toHaveBeenCalledTimes(1);
    expect(tx.consultationDraft.deleteMany).toHaveBeenCalledTimes(1);
  });
});
