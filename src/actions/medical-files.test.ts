import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "MEDECIN", organizationId: "org1" } as Record<string, unknown>,
  patientAccess: true,
  uploaded: { format: "pdf", bytes: 1000, resourceType: "image" } as { format: string; bytes: number; resourceType: string } | null,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user, verifyPatientAccess: async () => state.patientAccess }));

const storage = vi.hoisted(() => ({ destroy: vi.fn(), sign: vi.fn(() => ({ signature: "sig" })) }));
vi.mock("@/lib/medical-files-server", () => ({
  signPatientUpload: storage.sign,
  fetchUploadedResource: async () => state.uploaded,
  destroyUploadedResource: storage.destroy,
}));

function mockDb(options: { order?: Record<string, unknown> | null; file?: Record<string, unknown> | null } = {}) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "f1", ...data }));
  const update = vi.fn(async () => ({}));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      patient: { findUnique: vi.fn(async () => ({ organizationId: "org1" })) },
      radiologyOrder: { findUnique: vi.fn(async () => options.order ?? null) },
      medicalRecord: { findUnique: vi.fn(async () => null) },
      medicalFile: { create, update, findUnique: vi.fn(async () => options.file ?? null) },
    },
  }));
  return { create, update };
}

const base = { patientId: "p1", publicId: "meddoc/org1/p1/abc", resourceType: "image" as const, category: "SCANNED_DOCUMENT" as const, originalName: "scan.pdf" };

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "u1", role: "MEDECIN", organizationId: "org1" };
  state.patientAccess = true;
  state.uploaded = { format: "pdf", bytes: 1000, resourceType: "image" };
  storage.destroy.mockClear();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("attachMedicalFile", () => {
  it("rattache le fichier réellement reçu, avec sa taille et son format vérifiés", async () => {
    const { create } = mockDb();
    const { attachMedicalFile } = await import("./medical-files");

    const result = await attachMedicalFile(base);

    expect(result).toEqual({ success: true, data: { id: "f1" } });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: "org1", publicId: "meddoc/org1/p1/abc", format: "pdf", bytes: 1000, uploadedById: "u1" }) });
  });

  it("refuse un fichier hors du dossier du patient", async () => {
    const { create } = mockDb();
    const { attachMedicalFile } = await import("./medical-files");

    const result = await attachMedicalFile({ ...base, publicId: "meddoc/org1/p2/abc" });

    expect(result.success ? "" : result.error).toMatch(/Fichier invalide/);
    expect(create).not.toHaveBeenCalled();
  });

  it("supprime du stockage un fichier trop lourd ou d'un format refusé", async () => {
    const { create } = mockDb();
    state.uploaded = { format: "pdf", bytes: 30 * 1024 * 1024, resourceType: "image" };
    let { attachMedicalFile } = await import("./medical-files");
    expect((await attachMedicalFile(base)).success).toBe(false);

    vi.resetModules();
    mockDb();
    state.uploaded = { format: "exe", bytes: 1000, resourceType: "raw" };
    ({ attachMedicalFile } = await import("./medical-files"));
    expect((await attachMedicalFile(base)).success).toBe(false);

    expect(storage.destroy).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse d'ajouter un cliché à un examen validé", async () => {
    const { create } = mockDb({ order: { patientId: "p1", status: "VALIDATED" } });
    const { attachMedicalFile } = await import("./medical-files");

    const result = await attachMedicalFile({ ...base, category: "RADIOLOGY_IMAGE", radiologyOrderId: "o1" });

    expect(result.success ? "" : result.error).toMatch(/validé ou annulé/);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse les rôles non soignants et les patients d'un autre établissement", async () => {
    mockDb();
    state.user = { id: "c1", role: "CASHIER", organizationId: "org1" };
    let { attachMedicalFile } = await import("./medical-files");
    expect((await attachMedicalFile(base)).success).toBe(false);

    vi.resetModules();
    mockDb();
    state.user = { id: "u1", role: "MEDECIN", organizationId: "org1" };
    state.patientAccess = false;
    ({ attachMedicalFile } = await import("./medical-files"));
    expect((await attachMedicalFile(base)).success).toBe(false);
  });
});

describe("removeMedicalFile", () => {
  it("masque le document sans le détruire, et seulement pour son auteur ou un coordinateur", async () => {
    const { update } = mockDb({ file: { id: "f1", patientId: "p1", uploadedById: "other", deletedAt: null } });
    let { removeMedicalFile } = await import("./medical-files");
    expect((await removeMedicalFile("f1")).success).toBe(false);
    expect(update).not.toHaveBeenCalled();

    vi.resetModules();
    const second = mockDb({ file: { id: "f1", patientId: "p1", uploadedById: "other", deletedAt: null } });
    state.user = { id: "co1", role: "COORDINATOR", organizationId: "org1" };
    ({ removeMedicalFile } = await import("./medical-files"));
    expect((await removeMedicalFile("f1")).success).toBe(true);
    expect(second.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: expect.objectContaining({ deletedById: "co1", deletedAt: expect.any(Date) }) });
    expect(storage.destroy).not.toHaveBeenCalled();
  });
});
