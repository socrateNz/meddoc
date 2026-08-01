"use server";

import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { requestPasswordResetSchema, resetPasswordSchema } from "@/validators/auth";
import crypto from "crypto";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

// Réponse générique volontairement identique que le compte existe ou non,
// pour ne pas permettre l'énumération des emails enregistrés.
const GENERIC_SUCCESS = {
  success: true,
  message: "Si un compte existe avec cet email, notre équipe vous contactera pour finaliser la réinitialisation.",
};

export async function requestPasswordReset(email: string) {
  try {
    const { email: validEmail } = requestPasswordResetSchema.parse({ email });

    const user = await prisma.user.findUnique({ where: { email: validEmail.toLowerCase() } });

    if (user && user.isActive) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      // Pas de fournisseur d'e-mail configuré : le lien est transmis en interne
      // (notification au personnel habilité) plutôt qu'envoyé directement au demandeur,
      // afin de ne pas exposer un lien de connexion à quiconque connaît un email valide.
      const staff = await prisma.user.findMany({
        where: { role: { in: [Role.ADMIN, Role.COORDINATOR] }, isActive: true },
      });

      await prisma.notification.createMany({
        data: staff.map((s) => ({
          userId: s.id,
          title: "Demande de réinitialisation de mot de passe",
          message: `${user.firstName} ${user.lastName} (${user.email}) a demandé la réinitialisation de son mot de passe. Lien à transmettre en interne (valable 1h) : /reset-password/${rawToken}`,
          type: "INFO",
        })),
      });
    }

    return GENERIC_SUCCESS;
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return { success: false, error: "Adresse email invalide." };
    }
    console.error("Error requesting password reset:", error);
    // Toujours renvoyer un message générique, même en cas d'erreur interne.
    return GENERIC_SUCCESS;
  }
}

export async function resetPassword(token: string, password: string) {
  try {
    const validData = resetPasswordSchema.parse({ token, password });
    const tokenHash = crypto.createHash("sha256").update(validData.token).digest("hex");

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new Error("Lien de réinitialisation invalide ou expiré.");
    }

    const { default: bcrypt } = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(validData.password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, requiresPasswordChange: false },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    const { logAuditAction } = await import("@/middlewares/auditLogger");
    await logAuditAction(resetToken.userId, "PASSWORD_RESET", "User", resetToken.userId);

    return { success: true };
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return { success: false, error: error.issues?.[0]?.message || "Données invalides." };
    }
    return { success: false, error: error.message || "Erreur lors de la réinitialisation." };
  }
}
