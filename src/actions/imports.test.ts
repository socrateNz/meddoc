import { describe, it, expect, vi, beforeEach } from "vitest";

// Imports CSV : rapprochement par nom (pas de doublon au réimport), doublons dans le fichier,
// patients déjà enregistrés.
const state = vi.hoisted(() => ({ user: { id: "c1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } } as Record<string, unknown> }));

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "c1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => state.user), verifyPatientAccess: vi.fn(async () => true) }));
});

describe("importLabTests", () => {
  function mockDb() {
    const update = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({
      prisma: { labTest: { findMany: vi.fn(async () => [{ id: "lt-nfs", name: "NFS" }]), update, create } },
    }));
    return { update, create };
  }

  it("met à jour l'examen existant, crée le nouveau, applique le modèle et sa paillasse, refuse le doublon du fichier", async () => {
    const m = mockDb();
    const { importLabTests } = await import("./lab");

    const res = await importLabTests({
      items: [
        { name: "nfs", basePrice: 6000, partnerPrice: 4500 },
        { name: "Acide urique", basePrice: 3000, templateId: "uric-acid" },
        { name: "Acide urique", basePrice: 3500 },
      ],
    });

    expect(res).toMatchObject({ success: true, data: { created: 1, updated: 1 } });
    expect(res.success && res.data.failures[0].error).toMatch(/En double/);
    expect(m.update).toHaveBeenCalledWith({ where: { id: "lt-nfs" }, data: expect.objectContaining({ basePrice: 6000, partnerPrice: 4500 }) });
    expect(m.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Acide urique", department: "Biochimie", organizationId: "org1", resultTemplate: expect.objectContaining({ version: 1 }) }),
    });
  });

  it("est réservé au coordinateur", async () => {
    state.user = { id: "l1", role: "LABORANTIN", organizationId: "org1", organization: { type: "CLINIC" } };
    mockDb();
    const { importLabTests } = await import("./lab");
    expect((await importLabTests({ items: [{ name: "NFS", basePrice: 1 }] })).success).toBe(false);
  });
});

describe("importPatients", () => {
  function mockDb() {
    const userCreate = vi.fn(async ({ data }: any) => ({ id: "u-new", ...data }));
    const patientCreate = vi.fn(async ({ data }: any) => ({ id: "p-new", ...data }));
    const patientUpdate = vi.fn(async () => ({}));
    const prisma: any = {
      clinicService: { findMany: vi.fn(async () => [{ id: "svc-mat", name: "Maternité" }]) },
      patient: {
        findMany: vi.fn(async () => [{ dateOfBirth: new Date("1985-03-14"), user: { firstName: "Jean", lastName: "MBARGA" } }]),
        create: patientCreate,
        update: patientUpdate,
      },
      user: { findUnique: vi.fn(async () => null), create: userCreate },
      organization: { findFirst: vi.fn(async () => null) },
    };
    prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
    vi.doMock("@/lib/db", () => ({ prisma }));
    vi.doMock("@/lib/ipp", () => ({ nextIpp: vi.fn(async () => "IPP-2026-000001") }));
    return { patientCreate, patientUpdate };
  }

  const row = (extra: Record<string, unknown> = {}) => ({
    lastName: "NGONO",
    firstName: "Marie",
    dateOfBirth: "1998-11-02",
    address: "Mendong",
    dependencyLevel: 1,
    pathologies: [],
    allergies: [],
    ...extra,
  });

  it("crée le patient, le confie au service nommé et ignore celui déjà enregistré", async () => {
    const m = mockDb();
    const { importPatients } = await import("./patients");

    const res = await importPatients({
      clinicId: "org1",
      items: [row({ serviceName: "maternité" }), row({ lastName: "mbarga", firstName: "jean", dateOfBirth: "1985-03-14" })],
    });

    expect(res).toMatchObject({ success: true, data: { created: 1 } });
    expect(res.success && res.data.failures[0].error).toMatch(/Déjà enregistré/);
    expect(m.patientCreate).toHaveBeenCalledTimes(1);
    expect(m.patientUpdate).toHaveBeenCalledWith({ where: { id: "p-new" }, data: { serviceId: "svc-mat" } });
  });

  it("signale un service inconnu sans créer le patient, et refuse un soignant", async () => {
    const m = mockDb();
    let { importPatients } = await import("./patients");
    const res = await importPatients({ clinicId: "org1", items: [row({ serviceName: "Cardiologie" })] });
    expect(res.success && res.data.failures[0].error).toMatch(/Service inconnu/);
    expect(m.patientCreate).not.toHaveBeenCalled();

    vi.resetModules();
    state.user = { id: "n1", role: "CAREGIVER", organizationId: "org1", organization: { type: "CLINIC" } };
    mockDb();
    ({ importPatients } = await import("./patients"));
    expect((await importPatients({ clinicId: "org1", items: [row()] })).success).toBe(false);
  });
});
