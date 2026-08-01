import { z } from "zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  phone: z.string().optional(),
});

export const updateInitialPasswordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères");
