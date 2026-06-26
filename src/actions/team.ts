"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

export async function getTeamMembers() {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");

  const whereClause: any = {
    role: { in: ["CAREGIVER", "COORDINATOR", "ADMIN"] },
  };

  if (activeUser.organization?.type === "HOLDING") {
    whereClause.OR = [
      { organizationId: activeUser.organizationId },
      { organization: { parentId: activeUser.organizationId } }
    ];
  } else if (activeUser.organization?.type === "CLINIC") {
    whereClause.organizationId = activeUser.organizationId;
  } else {
    whereClause.organizationId = "NO_ACCESS";
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
    return { success: false, error: error.message || "Erreur lors de la mise à jour." };
  }
}

export async function createTeamMember(data: any) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser || activeUser.role !== "ADMIN") {
      throw new Error("Non autorisé. Seul un administrateur peut ajouter du personnel.");
    }

    const { firstName, lastName, email, phone, role, specialties, organizationId } = data;

    let targetOrgId = activeUser.organizationId;
    if (organizationId && activeUser.organization?.type === "HOLDING") {
      if (organizationId !== activeUser.organizationId) {
        const targetOrg = await prisma.organization.findFirst({
          where: { id: organizationId, parentId: activeUser.organizationId }
        });
        if (!targetOrg) {
          throw new Error("Établissement cible invalide ou non autorisé.");
        }
      }
      targetOrgId = organizationId;
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

    await logAuditAction(activeUser.id, "CREATE_TEAM_MEMBER", "User", newUser.id);
    revalidatePath("/dashboard/team");

    return { success: true, data: newUser };
  } catch (error: any) {
    console.error("Error creating team member:", error);
    return { success: false, error: error.message || "Erreur lors de la création du membre." };
  }
}

export async function deactivateTeamMember(userId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser || activeUser.role !== "ADMIN") {
      throw new Error("Non autorisé. Seul un administrateur peut désactiver du personnel.");
    }

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
    if (!activeUser || activeUser.role !== "ADMIN") {
      throw new Error("Non autorisé. Seul un administrateur peut réactiver du personnel.");
    }

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
      role: { in: ["CAREGIVER", "COORDINATOR", "ADMIN"] },
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
    return { success: false, error: error.message || "Erreur lors de la réaffectation." };
  }
}

