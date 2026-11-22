import { describe, it, expect, vi, beforeEach } from "vitest";

// Dossier du nouveau-né : rattaché à la mère, service de néonatalogie s'il existe, pas de compte.
const db = vi.hoisted(() => ({ services: [] as { id: string; name: string }[], newbornPatientId: null as string | null }));

function mockDb() {
  const userCreate = vi.fn(async ({ data }: any) => ({ id: "u-baby", ...data }));
  const patientCreate = vi.fn(async ({ data }: any) => ({ id: "p-baby", ...data }));
  const newbornUpdate = vi.fn(async () => ({}));
  const prisma: any = {
    newborn: {
      findUnique: vi.fn(async () => ({ id: "nb1", sex: "F", vitalStatus: "LIVE_BIRTH", patientId: db.newbornPatientId, delivery: { deliveredAt: new Date("2026-11-22T03:10:00Z") } })),
      update: newbornUpdate,
    },
    patient: {
      findUnique: vi.fn(async () => ({ id: "mother", organizationId: "org1", serviceId: "svc-mat", address: "Simbock", user: { lastName: "NGONO", phone: "+237600000000" } })),
      create: patientCreate,
    },
    clinicService: { findMany: vi.fn(async () => db.services) },
    user: { create: userCreate },
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  vi.doMock("@/lib/db", () => ({ prisma }));
  vi.doMock("@/lib/ipp", () => ({ nextIpp: vi.fn(async () => "IPP-2026-000099") }));
  return { userCreate, patientCreate, newbornUpdate };
}

beforeEach(() => {
  vi.resetModules();
  db.services = [];
  db.newbornPatientId = null;
});

describe("createNewbornPatient", () => {
  it("crée le dossier du bébé au nom de la mère, sans compte, confié à la néonatalogie", async () => {
    db.services = [{ id: "svc-ped", name: "Pédiatrie" }, { id: "svc-neo", name: "Néonatalogie" }];
    const m = mockDb();
    const { createNewbornPatient } = await import("./newborn-server");

    const id = await createNewbornPatient({ newbornId: "nb1", motherPatientId: "mother", rank: 2, twins: true });

    expect(id).toBe("p-baby");
    expect(m.userCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ firstName: "Bébé 2", lastName: "NGONO", isActive: false }) });
    expect(m.patientCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipp: "IPP-2026-000099", sex: "F", serviceId: "svc-neo", motherPatientId: "mother", address: "Simbock" }),
    });
    expect(m.newbornUpdate).toHaveBeenCalledWith({ where: { id: "nb1" }, data: { patientId: "p-baby" } });
  });

  it("reprend le service de la mère sans néonatalogie ni pédiatrie, et ne recrée pas un dossier existant", async () => {
    let m = mockDb();
    let { createNewbornPatient } = await import("./newborn-server");
    await createNewbornPatient({ newbornId: "nb1", motherPatientId: "mother", rank: 1, twins: false });
    expect(m.patientCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ serviceId: "svc-mat" }) });
    expect(m.userCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ firstName: "Bébé" }) });

    vi.resetModules();
    db.newbornPatientId = "already";
    m = mockDb();
    ({ createNewbornPatient } = await import("./newborn-server"));
    expect(await createNewbornPatient({ newbornId: "nb1", motherPatientId: "mother", rank: 1, twins: false })).toBe("already");
    expect(m.patientCreate).not.toHaveBeenCalled();
  });
});
