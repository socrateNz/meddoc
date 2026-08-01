"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  updateProfileSchema,
  updateInitialPasswordSchema,
  changePasswordSchema,
  updateNotificationPreferencesSchema,
} from "@/validators/users";
import { revalidatePath } from "next/cache";

export async function updateProfile(data: {
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  try {
    updateProfileSchema.parse(data);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
      },
    });

    revalidatePath("/dashboard/settings");
    return { success: true, data: updatedUser };
  } catch (error: any) {
    console.error("Error updating profile:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du profil") };
  }
}

export async function updateInitialPassword(newPassword: string) {
  try {
    updateInitialPasswordSchema.parse(newPassword);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    const { default: bcrypt } = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        passwordHash,
        requiresPasswordChange: false,
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error updating initial password:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du mot de passe") };
  }
}

export async function changePassword(currentPassword: string, newPassword: string) {
  try {
    changePasswordSchema.parse({ currentPassword, newPassword });
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    // getCurrentUser() exclut volontairement passwordHash : on le relit ici
    // pour vérifier le mot de passe actuel avant tout changement.
    const userWithHash = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { passwordHash: true },
    });
    if (!userWithHash) {
      throw new Error("Utilisateur introuvable.");
    }

    const { default: bcrypt } = await import("bcryptjs");
    const isValid = await bcrypt.compare(currentPassword, userWithHash.passwordHash);
    if (!isValid) {
      throw new Error("Le mot de passe actuel est incorrect.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { passwordHash },
    });

    await logAuditAction(currentUser.id, "PASSWORD_CHANGE", "User", currentUser.id);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du changement de mot de passe") };
  }
}

export async function updateNotificationPreferences(mutedTypes: string[]) {
  try {
    const { mutedTypes: validMutedTypes } = updateNotificationPreferencesSchema.parse({ mutedTypes });
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { mutedNotificationTypes: validMutedTypes },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/notifications");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement des préférences") };
  }
}
