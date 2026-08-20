"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  createWardSchema,
  updateWardSchema,
  createRoomSchema,
  updateRoomSchema,
  createBedSchema,
  assignPatientToBedSchema,
} from "@/validators/wards";
import { revalidatePath } from "next/cache";

// Consulter l'occupation (chambres/lits) est ouvert à tout le personnel clinique, y compris
// ADMIN (holding) en lecture seule. Créer/renommer/supprimer un service, une chambre ou un lit
// est une opération structurelle réservée au coordinateur (même périmètre que le catalogue
// labo, cf. src/actions/lab.ts). Affecter/libérer un lit reste un geste opérationnel courant,
// ouvert au même trio que LAB_OPERATE_ROLES.
const ROOMS_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const ROOMS_STRUCTURE_ROLES = ["COORDINATOR"];
const ROOMS_OPERATE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

function assertRoomsReadRole(role: string) {
  if (!ROOMS_READ_ROLES.includes(role)) throw new Error("Non autorisé.");
}

function assertRoomsStructureRole(role: string) {
  if (!ROOMS_STRUCTURE_ROLES.includes(role)) throw new Error("Non autorisé. Réservé aux coordinateurs.");
}

function assertRoomsOperateRole(role: string) {
  if (!ROOMS_OPERATE_ROLES.includes(role)) throw new Error("Non autorisé. Réservé au personnel clinique.");
}

// Cette clinique doit être la propre clinique de l'utilisateur, ou une clinique rattachée à la
// holding dont il est administrateur — même logique que organizations.ts:updateClinic. Sans ce
// contrôle, n'importe quel utilisateur authentifié pouvait agir sur les services et lits d'une
// clinique arbitraire simplement en devinant son identifiant.
async function assertClinicScope(clinicId: string, activeUser: any) {
  const isOwnClinic = activeUser.organizationId === clinicId;
  const isChildOfHolding =
    activeUser.organization?.type === "HOLDING" &&
    (await prisma.organization.findFirst({ where: { id: clinicId, parentId: activeUser.organizationId } })) !== null;
  if (!isOwnClinic && !isChildOfHolding) {
    throw new Error("Non autorisé. Cette clinique ne fait pas partie de votre établissement.");
  }
}

export async function getOrCreateClinicWards(clinicId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    if (activeUser.role === "SUPER_ADMIN") throw new Error("Non autorisé.");
    await assertClinicScope(clinicId, activeUser);

    let wards = await prisma.ward.findMany({
      where: { organizationId: clinicId },
      orderBy: { code: "asc" },
    });

    if (wards.length === 0) {
      const defaultWards = [
        { name: "Urgences", code: "EMERGENCY" },
        { name: "Soins Intensifs", code: "ICU" },
        { name: "Chirurgie & Ambulatoire", code: "SURGERY" },
      ];
      wards = await Promise.all(
        defaultWards.map((dw) => prisma.ward.create({ data: { name: dw.name, code: dw.code, organizationId: clinicId } }))
      );
    }

    return { success: true, wards };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Impossible de récupérer ou d'initialiser les services.") };
  }
}

export async function listWardsWithRooms(clinicId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsReadRole(activeUser.role);
    await assertClinicScope(clinicId, activeUser);

    const wards = await prisma.ward.findMany({
      where: { organizationId: clinicId },
      include: {
        rooms: {
          include: {
            beds: {
              include: {
                patients: { include: { user: { select: { firstName: true, lastName: true } } } },
              },
              orderBy: { label: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });

    return { success: true, data: wards };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des chambres.") };
  }
}

// --- Services (COORDINATOR uniquement) ---

export async function createWard(data: { organizationId: string; name: string; code: string }) {
  try {
    createWardSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);
    await assertClinicScope(data.organizationId, activeUser);

    const ward = await prisma.ward.create({
      data: { name: data.name, code: data.code.toUpperCase(), organizationId: data.organizationId },
    });

    await logAuditAction(activeUser.id, "CREATE_WARD", "Ward", ward.id, { name: data.name, code: data.code });
    revalidatePath(`/dashboard/clinics/${data.organizationId}/rooms`);
    revalidatePath(`/dashboard/clinics/${data.organizationId}`);
    return { success: true, data: ward };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du service.") };
  }
}

export async function updateWard(id: string, data: { name: string; code: string }) {
  try {
    updateWardSchema.parse({ id, ...data });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);

    const existing = await prisma.ward.findUnique({ where: { id } });
    if (!existing) throw new Error("Service introuvable.");
    await assertClinicScope(existing.organizationId, activeUser);

    const ward = await prisma.ward.update({ where: { id }, data: { name: data.name, code: data.code.toUpperCase() } });

    await logAuditAction(activeUser.id, "UPDATE_WARD", "Ward", id, { name: data.name, code: data.code });
    revalidatePath(`/dashboard/clinics/${existing.organizationId}/rooms`);
    return { success: true, data: ward };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la modification du service.") };
  }
}

export async function deleteWard(id: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);

    const existing = await prisma.ward.findUnique({ where: { id }, include: { rooms: { select: { id: true } } } });
    if (!existing) throw new Error("Service introuvable.");
    await assertClinicScope(existing.organizationId, activeUser);
    if (existing.rooms.length > 0) {
      throw new Error("Impossible de supprimer un service qui contient encore des chambres.");
    }

    await prisma.ward.delete({ where: { id } });

    await logAuditAction(activeUser.id, "DELETE_WARD", "Ward", id, { name: existing.name });
    revalidatePath(`/dashboard/clinics/${existing.organizationId}/rooms`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la suppression du service.") };
  }
}

// --- Chambres (COORDINATOR uniquement) ---

export async function createRoom(data: { wardId: string; name: string }) {
  try {
    createRoomSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);

    const ward = await prisma.ward.findUnique({ where: { id: data.wardId } });
    if (!ward) throw new Error("Service introuvable.");
    await assertClinicScope(ward.organizationId, activeUser);

    const room = await prisma.room.create({
      data: { name: data.name, wardId: ward.id, organizationId: ward.organizationId },
    });

    await logAuditAction(activeUser.id, "CREATE_ROOM", "Room", room.id, { name: data.name, wardId: ward.id });
    revalidatePath(`/dashboard/clinics/${ward.organizationId}/rooms`);
    return { success: true, data: room };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de la chambre.") };
  }
}

export async function updateRoom(id: string, data: { name: string }) {
  try {
    updateRoomSchema.parse({ id, ...data });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);

    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) throw new Error("Chambre introuvable.");
    await assertClinicScope(existing.organizationId, activeUser);

    const room = await prisma.room.update({ where: { id }, data: { name: data.name } });

    await logAuditAction(activeUser.id, "UPDATE_ROOM", "Room", id, { name: data.name });
    revalidatePath(`/dashboard/clinics/${existing.organizationId}/rooms`);
    return { success: true, data: room };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la modification de la chambre.") };
  }
}

export async function deleteRoom(id: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);

    const existing = await prisma.room.findUnique({ where: { id }, include: { beds: { select: { id: true } } } });
    if (!existing) throw new Error("Chambre introuvable.");
    await assertClinicScope(existing.organizationId, activeUser);
    if (existing.beds.length > 0) {
      throw new Error("Impossible de supprimer une chambre qui contient encore des lits.");
    }

    await prisma.room.delete({ where: { id } });

    await logAuditAction(activeUser.id, "DELETE_ROOM", "Room", id, { name: existing.name });
    revalidatePath(`/dashboard/clinics/${existing.organizationId}/rooms`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la suppression de la chambre.") };
  }
}

// --- Lits ---

export async function createBed(data: { roomId: string; label: string }) {
  try {
    createBedSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);

    const room = await prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room) throw new Error("Chambre introuvable.");
    await assertClinicScope(room.organizationId, activeUser);

    const bed = await prisma.bed.create({
      data: {
        label: data.label,
        roomId: room.id,
        wardId: room.wardId,
        organizationId: room.organizationId,
        status: "AVAILABLE",
      },
    });

    await logAuditAction(activeUser.id, "CREATE_BED", "Bed", bed.id, { label: data.label, roomId: room.id });
    revalidatePath(`/dashboard/clinics/${room.organizationId}/rooms`);
    return { success: true, data: bed };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du lit.") };
  }
}

export async function deleteBed(id: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsStructureRole(activeUser.role);

    const existing = await prisma.bed.findUnique({ where: { id } });
    if (!existing) throw new Error("Lit introuvable.");
    await assertClinicScope(existing.organizationId, activeUser);
    if (existing.status === "OCCUPIED") {
      throw new Error("Impossible de supprimer un lit occupé. Libérez-le d'abord.");
    }

    await prisma.bed.delete({ where: { id } });

    await logAuditAction(activeUser.id, "DELETE_BED", "Bed", id, { label: existing.label });
    revalidatePath(`/dashboard/clinics/${existing.organizationId}/rooms`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la suppression du lit.") };
  }
}

// Affectation d'un patient à un lit précis — transfert atomique : le lit ciblé n'est occupé que
// s'il était encore AVAILABLE au moment de l'écriture (protège contre une course concurrente si
// deux utilisateurs affectent le même lit en même temps), et l'ancien lit du patient (s'il en
// avait un) est libéré dans la même transaction.
export async function assignPatientToBed(data: { patientId: string; bedId: string }) {
  try {
    assignPatientToBedSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsOperateRole(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const bed = await prisma.bed.findUnique({ where: { id: data.bedId } });
    if (!bed) throw new Error("Lit introuvable.");
    await assertClinicScope(bed.organizationId, activeUser);

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      select: { organizationId: true, bedId: true },
    });
    if (!patient) throw new Error("Patient introuvable.");
    if (patient.organizationId !== bed.organizationId) {
      throw new Error("Ce lit appartient à une autre clinique que celle du patient.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.bed.updateMany({
        where: { id: data.bedId, status: "AVAILABLE" },
        data: { status: "OCCUPIED" },
      });
      if (claim.count === 0) {
        throw new Error("Ce lit vient d'être occupé par un autre patient. Veuillez en choisir un autre.");
      }

      if (patient.bedId && patient.bedId !== data.bedId) {
        await tx.bed.update({ where: { id: patient.bedId }, data: { status: "AVAILABLE" } });
      }

      return tx.patient.update({ where: { id: data.patientId }, data: { bedId: data.bedId } });
    });

    await logAuditAction(activeUser.id, "ASSIGN_PATIENT_TO_BED", "Patient", data.patientId, { bedId: data.bedId });
    revalidatePath(`/dashboard/clinics/${bed.organizationId}/rooms`);
    revalidatePath(`/dashboard/patients/${data.patientId}`);

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'affectation du lit.") };
  }
}

export async function releaseBed(patientId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRoomsOperateRole(activeUser.role);

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { bedId: true } });
    if (!patient?.bedId) return { success: true, data: null };

    const bedId = patient.bedId;
    const [bed] = await prisma.$transaction([
      prisma.bed.update({ where: { id: bedId }, data: { status: "AVAILABLE" } }),
      prisma.patient.update({ where: { id: patientId }, data: { bedId: null } }),
    ]);

    await logAuditAction(activeUser.id, "RELEASE_BED", "Patient", patientId, { bedId });
    revalidatePath(`/dashboard/clinics/${bed.organizationId}/rooms`);
    revalidatePath(`/dashboard/patients/${patientId}`);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la libération du lit.") };
  }
}
