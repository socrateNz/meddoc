import { z } from "zod";

export const createClinicSchema = z.object({
  name: z.string().trim().min(2, "Le nom de la clinique est requis"),
});

// ~700 000 caractères ≈ 500 Ko décodés : large marge pour un logo déjà redimensionné à 320px
// côté client (cf. settings-form.tsx), empêche un envoi direct d'image non compressée.
const logoUrlSchema = z
  .string()
  .max(700000, "Le logo est trop volumineux.")
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Format d'image invalide.")
  .optional()
  .or(z.literal(""));

export const updateClinicSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Le nom de la clinique est requis"),
  logoUrl: logoUrlSchema,
});
