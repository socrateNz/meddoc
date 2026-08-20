import { describe, it, expect, vi, beforeEach } from "vitest";

// Régression : getOrCreateClinicWards n'avait aucune vérification d'authentification ni de
// portée organisationnelle avant l'audit RBAC de cette session (n'importe quel utilisateur,
// authentifié ou non, pouvait initialiser les services et réaffecter des patients d'une
// clinique arbitraire en devinant son identifiant).

beforeEach(() => {
  vi.resetModules();
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("getOrCreateClinicWards", () => {
  it("refuse un appel non authentifié", async () => {
    vi.doMock("@/lib/db", () => ({ prisma: { ward: { findMany: vi.fn() } } }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
    const { getOrCreateClinicWards } = await import("./wards");

    const result = await getOrCreateClinicWards("clinicA");

    expect(result.success).toBe(false);
  });

  it("refuse une clinique qui n'appartient ni à l'utilisateur ni à sa holding", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        organization: { findFirst: vi.fn(async () => null) },
        ward: { findMany: vi.fn() },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "u1", role: "COORDINATOR", organizationId: "clinicB", organization: { type: "CLINIC" } })),
    }));
    const { getOrCreateClinicWards } = await import("./wards");

    const result = await getOrCreateClinicWards("clinicA");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ne fait pas partie/);
  });

  it("autorise l'utilisateur sur sa propre clinique", async () => {
    const wardFindMany = vi.fn(async () => [{ id: "w1", code: "EMERGENCY" }]);
    vi.doMock("@/lib/db", () => ({
      prisma: { ward: { findMany: wardFindMany } },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "u1", role: "COORDINATOR", organizationId: "clinicA", organization: { type: "CLINIC" } })),
    }));
    const { getOrCreateClinicWards } = await import("./wards");

    const result = await getOrCreateClinicWards("clinicA");

    expect(result.success).toBe(true);
    expect(wardFindMany).toHaveBeenCalled();
  });

  it("autorise l'administrateur d'une holding sur une clinique fille", async () => {
    const wardFindMany = vi.fn(async () => [{ id: "w1", code: "EMERGENCY" }]);
    vi.doMock("@/lib/db", () => ({
      prisma: {
        organization: { findFirst: vi.fn(async () => ({ id: "clinicA", parentId: "holding1" })) },
        ward: { findMany: wardFindMany },
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "u1", role: "ADMIN", organizationId: "holding1", organization: { type: "HOLDING" } })),
    }));
    const { getOrCreateClinicWards } = await import("./wards");

    const result = await getOrCreateClinicWards("clinicA");

    expect(result.success).toBe(true);
    expect(wardFindMany).toHaveBeenCalled();
  });
});

const clinicUser = { id: "u1", role: "COORDINATOR", organizationId: "clinicA", organization: { type: "CLINIC" } };

describe("createWard / createRoom / createBed — RBAC structurelle", () => {
  it("refuse un rôle non structurel (MEDECIN) pour créer un service", async () => {
    const wardCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { ward: { create: wardCreate } } }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ ...clinicUser, role: "MEDECIN" })) }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { createWard } = await import("./wards");

    const result = await createWard({ organizationId: "clinicA", name: "Maternité", code: "MATERNITY" });

    expect(result.success).toBe(false);
    expect(wardCreate).not.toHaveBeenCalled();
  });

  it("refuse un rôle non structurel (CAREGIVER) pour créer une chambre", async () => {
    const roomCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { ward: { findUnique: vi.fn() }, room: { create: roomCreate } } }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ ...clinicUser, role: "CAREGIVER" })) }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { createRoom } = await import("./wards");

    const result = await createRoom({ wardId: "w1", name: "Chambre 1" });

    expect(result.success).toBe(false);
    expect(roomCreate).not.toHaveBeenCalled();
  });

  it("autorise le coordinateur à créer un service pour sa propre clinique", async () => {
    const wardCreate = vi.fn(async ({ data }: any) => ({ id: "w1", ...data }));
    vi.doMock("@/lib/db", () => ({ prisma: { ward: { create: wardCreate } } }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { createWard } = await import("./wards");

    const result = await createWard({ organizationId: "clinicA", name: "Maternité", code: "maternity" });

    expect(result.success).toBe(true);
    expect(wardCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "MATERNITY" }) }));
  });
});

describe("deleteWard / deleteRoom — garde de suppression", () => {
  it("refuse de supprimer un service qui contient encore des chambres", async () => {
    const wardDelete = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        ward: { findUnique: vi.fn(async () => ({ id: "w1", organizationId: "clinicA", rooms: [{ id: "r1" }] })), delete: wardDelete },
      },
    }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { deleteWard } = await import("./wards");

    const result = await deleteWard("w1");

    expect(result.success).toBe(false);
    expect(wardDelete).not.toHaveBeenCalled();
  });

  it("refuse de supprimer une chambre qui contient encore des lits", async () => {
    const roomDelete = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        room: { findUnique: vi.fn(async () => ({ id: "r1", organizationId: "clinicA", beds: [{ id: "b1" }] })), delete: roomDelete },
      },
    }));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { deleteRoom } = await import("./wards");

    const result = await deleteRoom("r1");

    expect(result.success).toBe(false);
    expect(roomDelete).not.toHaveBeenCalled();
  });
});

describe("assignPatientToBed", () => {
  it("refuse un rôle non opérationnel (PHARMACIST)", async () => {
    const patientUpdate = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { patient: { update: patientUpdate } } }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ ...clinicUser, role: "PHARMACIST" })),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { assignPatientToBed } = await import("./wards");

    const result = await assignPatientToBed({ patientId: "p1", bedId: "b1" });

    expect(result.success).toBe(false);
    expect(patientUpdate).not.toHaveBeenCalled();
  });

  it("libère l'ancien lit du patient et occupe le nouveau (transfert atomique)", async () => {
    const bedUpdateMany = vi.fn(async () => ({ count: 1 }));
    const bedUpdate = vi.fn(async ({ data }: any) => ({ id: "oldBed", ...data }));
    const patientUpdate = vi.fn(async ({ data }: any) => ({ id: "p1", ...data }));
    const tx = { bed: { updateMany: bedUpdateMany, update: bedUpdate }, patient: { update: patientUpdate } };
    vi.doMock("@/lib/db", () => ({
      prisma: {
        bed: { findUnique: vi.fn(async () => ({ id: "b1", organizationId: "clinicA" })) },
        patient: { findUnique: vi.fn(async () => ({ organizationId: "clinicA", bedId: "oldBed" })) },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => clinicUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { assignPatientToBed } = await import("./wards");

    const result = await assignPatientToBed({ patientId: "p1", bedId: "b1" });

    expect(result.success).toBe(true);
    expect(bedUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "b1", status: "AVAILABLE" } }));
    expect(bedUpdate).toHaveBeenCalledWith({ where: { id: "oldBed" }, data: { status: "AVAILABLE" } });
    expect(patientUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { bedId: "b1" } });
  });

  it("refuse l'affectation si le lit vient d'être occupé par une autre requête (course concurrente)", async () => {
    const bedUpdateMany = vi.fn(async () => ({ count: 0 }));
    const patientUpdate = vi.fn();
    const tx = { bed: { updateMany: bedUpdateMany, update: vi.fn() }, patient: { update: patientUpdate } };
    vi.doMock("@/lib/db", () => ({
      prisma: {
        bed: { findUnique: vi.fn(async () => ({ id: "b1", organizationId: "clinicA" })) },
        patient: { findUnique: vi.fn(async () => ({ organizationId: "clinicA", bedId: null })) },
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => clinicUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { assignPatientToBed } = await import("./wards");

    const result = await assignPatientToBed({ patientId: "p1", bedId: "b1" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/vient d'être occupé/);
    expect(patientUpdate).not.toHaveBeenCalled();
  });
});

describe("releaseBed", () => {
  it("ne fait rien si le patient n'occupe aucun lit (idempotent)", async () => {
    const transaction = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: { patient: { findUnique: vi.fn(async () => ({ bedId: null })) }, $transaction: transaction },
    }));
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => clinicUser),
      verifyPatientAccess: vi.fn(async () => true),
    }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const { releaseBed } = await import("./wards");

    const result = await releaseBed("p1");

    expect(result.success).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });
});
