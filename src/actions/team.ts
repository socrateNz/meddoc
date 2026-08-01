"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  toggleAvailabilitySchema,
  createTeamMemberSchema,
  reassignTeamMemberSchema,
} from "@/validators/team";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

export async function getTeamMembers() {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");

  const whereClause: any = {
    role: { in: ["CAREGIVER", "COORDINATOR", "PHARMACIST", "ADMIN"] },
  };

  if (activeUser.organization?.type === "HOLDING") {
    whereClause.OR = [
      { organizationId: activeUser.organizationId },
      { organization: { parentId: activeUser.organizationId } }
    ];
  } else if (activeUser.organization?.type === "CLINIC") {
    whereClause.organizationId = activeUser.organizationId;
  } else {
    // Tableau `in` vide : ne matche jamais, sans faire planter Prisma sur un ObjectId invalide.
    whereClause.organizationId = { in: [] };
  }

  const members = await prisma.user.findMany({
    where: whereClause,
    include: {
      caregiverProfile: {
        include: {
          _count: {
            select: { appointments: true, tasks: true }
          }
        }
      },
      coordinatorProfile: {
        include: {
          _count: {
            select: { managedPlans: true }
          }
        }
      },
      organization: {
        select: {
          id: true,
          name: true,
          type: true
        }
      }
    },
    orderBy: { lastName: "asc" }
  });

  return { success: true, data: members };
}

export async function toggleAvailability(userId: string, isAvailable: boolean) {
  try {
    toggleAvailabilitySchema.parse({ userId, isAvailable });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const caregiver = await prisma.caregiver.findUnique({
      where: { userId }
    });

    if (!caregiver) {
      throw new Error("Cet utilisateur n'a pas de profil soignant.");
    }

    const updated = await prisma.caregiver.update({
      where: { id: caregiver.id },
      data: { isAvailable }
    });

    await logAuditAction(activeUser.id, "UPDATE_AVAILABILITY", "Caregiver", caregiver.id);
    revalidatePath("/dashboard/team");

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour.") };
  }
}

export async function createTeamMember(data: any) {
  try {
    createTeamMemberSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const { firstName, lastName, email, phone, role, specialties, organizationId } = data;

    let targetOrgId: string | null | undefined;

    if (activeUser.role === "COORDINATOR") {
      // Le coordinateur ne recrute que pour sa propre clinique, jamais un autre coordinateur ou un admin.
      if (role !== "CAREGIVER" && role !== "PHARMACIST") {
        throw new Error("Un coordinateur ne peut ajouter que des soignants ou des pharmaciens.");
      }
      targetOrgId = activeUser.organizationId;
    } else if (activeUser.role === "ADMIN" && activeUser.organization?.type === "HOLDING") {
      // L'admin de holding ne fait plus que désigner le coordinateur d'une clinique.
      if (role !== "COORDINATOR") {
        throw new Error("Un administrateur ne peut que désigner un coordinateur de clinique.");
      }
      if (!organizationId) {
        throw new Error("Veuillez sélectionner la clinique à laquelle affecter ce coordinateur.");
      }
      const targetOrg = await prisma.organization.findFirst({
        where: { id: organizationId, parentId: activeUser.organizationId, type: "CLINIC" }
      });
      if (!targetOrg) {
        throw new Error("Établissement cible invalide ou non autorisé.");
      }
      targetOrgId = organizationId;
    } else {
      throw new Error("Non autorisé. Seul un coordinateur (pour son équipe) ou un administrateur (pour désigner un coordinateur) peut ajouter du personnel.");
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error("Un utilisateur avec cet email existe déjà.");
    }

    const defaultPassword = "ChangeMe!123";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const newUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone: phone || null,
        passwordHash,
        role: role as Role,
        isActive: true,
        requiresPasswordChange: true,
        organizationId: targetOrgId,
      }
    });

    if (role === "CAREGIVER") {
      await prisma.caregiver.create({
        data: {
          userId: newUser.id,
          specialties: specialties ? [specialties] : ["Généraliste"],
          certifications: [],
        }
      });
    } else if (role === "COORDINATOR") {
      await prisma.medicalCoordinator.create({
        data: {
          userId: newUser.id,
        }
      });
    }
    // PHARMACIST : pas de profil dédié, un User suffit (ventes/dépenses tracées via FinancialTransaction.recordedBy)

    await logAuditAction(activeUser.id, "CREATE_TEAM_MEMBER", "User", newUser.id);
    revalidatePath("/dashboard/team");

    return { success: true, data: newUser };
  } catch (error: any) {
    console.error("Error creating team member:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du membre.") };
  }
}

// COORDINATOR gère le personnel de sa propre clinique (CAREGIVER/PHARMACIST) ; ADMIN (holding)
// ne gère plus que les coordinateurs de ses cliniques enfants (désignation/remplacement).
async function assertCanManageStaffMember(activeUser: any, target: { role: string; organizationId: string | null }) {
  if (activeUser.role === "COORDINATOR") {
    if (target.organizationId !== activeUser.organizationId || !["CAREGIVER", "PHARMACIST"].includes(target.role)) {
      throw new Error("Vous ne pouvez gérer que le personnel (soignant ou pharmacien) de votre clinique.");
    }
    return;
  }
  if (activeUser.role === "ADMIN" && activeUser.organization?.type === "HOLDING") {
    if (target.role !== "COORDINATOR") {
      throw new Error("Un administrateur ne peut gérer que les coordinateurs de clinique.");
    }
    const targetOrg = await prisma.organization.findFirst({
      where: { id: target.organizationId ?? undefined, parentId: activeUser.organizationId }
    });
    if (!targetOrg) {
      throw new Error("Ce coordinateur n'appartient pas à votre holding.");
    }
    return;
  }
  throw new Error("Non autorisé.");
}

export async function deactivateTeamMember(userId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Utilisateur introuvable.");
    await assertCanManageStaffMember(activeUser, target);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false }
    });

    if (updatedUser.role === "CAREGIVER") {
      const caregiver = await prisma.caregiver.findUnique({ where: { userId } });
      if (caregiver) {
        await prisma.caregiver.update({
          where: { id: caregiver.id },
          data: { isAvailable: false }
        });
      }
    }

    await logAuditAction(activeUser.id, "DEACTIVATE_TEAM_MEMBER", "User", userId);
    revalidatePath("/dashboard/team");

    return { success: true, data: updatedUser };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la désactivation." };
  }
}

export async function reactivateTeamMember(userId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new Error("Utilisateur introuvable.");
    await assertCanManageStaffMember(activeUser, target);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: true }
    });

    await logAuditAction(activeUser.id, "REACTIVATE_TEAM_MEMBER", "User", userId);
    revalidatePath("/dashboard/team");

    return { success: true, data: updatedUser };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la réactivation." };
  }
}

export async function getClinicTeam(clinicId: string) {
  const activeUser = await getCurrentUser();
  if (!activeUser || activeUser.role !== "ADMIN" || activeUser.organization?.type !== "HOLDING") {
    throw new Error("Non authentifié ou non autorisé.");
  }

  // Verify that this clinic belongs to the active user's holding
  const clinic = await prisma.organization.findFirst({
    where: { id: clinicId, parentId: activeUser.organizationId, type: "CLINIC" }
  });

  if (!clinic) {
    throw new Error("Clinique introuvable ou non autorisée.");
  }

  const members = await prisma.user.findMany({
    where: {
      organizationId: clinicId,
      role: { in: ["CAREGIVER", "COORDINATOR", "PHARMACIST", "ADMIN"] },
    },
    include: {
      caregiverProfile: {
        include: {
          _count: {
            select: { appointments: true, tasks: true }
          }
        }
      },
      coordinatorProfile: {
        include: {
          _count: {
            select: { managedPlans: true }
          }
        }
      }
    },
    orderBy: { lastName: "asc" }
  });

  return { success: true, data: members, clinicName: clinic.name };
}

export async function reassignTeamMember(userId: string, newOrganizationId: string) {
  try {
    reassignTeamMemberSchema.parse({ userId, newOrganizationId });
    const activeUser = await getCurrentUser();
    if (!activeUser || activeUser.role !== "ADMIN" || activeUser.organization?.type !== "HOLDING") {
      throw new Error("Non autorisé. Seul un administrateur de Holding peut réaffecter le personnel.");
    }

    // Verify the target organization belongs to the holding (or IS the holding)
    let isTargetValid = false;
    if (newOrganizationId === activeUser.organizationId) {
      isTargetValid = true;
    } else {
      const targetOrg = await prisma.organization.findUnique({
        where: { id: newOrganizationId }
      });
      if (targetOrg && targetOrg.parentId === activeUser.organizationId) {
        isTargetValid = true;
      }
    }

    if (!isTargetValid) {
      throw new Error("L'organisation cible n'appartient pas à votre holding.");
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { organizationId: newOrganizationId }
    });

    await logAuditAction(activeUser.id, "REASSIGN_TEAM_MEMBER", "User", userId, { newOrganizationId });
    revalidatePath("/dashboard/team");

    return { success: true, data: updatedUser };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la réaffectation.") };
  }
}

