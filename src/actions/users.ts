"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { updateProfileSchema, updateInitialPasswordSchema } from "@/validators/users";
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
