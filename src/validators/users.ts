import { z } from "zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  phone: z.string().optional(),
});

export const updateInitialPasswordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères"),
});

const NOTIFICATION_TYPES = ["INCIDENT", "APPOINTMENT"] as const;

export const updateNotificationPreferencesSchema = z.object({
  mutedTypes: z.array(z.enum(NOTIFICATION_TYPES)),
});
