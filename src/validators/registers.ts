import { z } from "zod";

export const createRegisterSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1, "Nom de la caisse requis"),
});

export const openRegisterSessionSchema = z.object({
  registerId: z.string().min(1),
  openingFloat: z.number().min(0, "Le fond de caisse doit être positif ou nul"),
});

export const closeRegisterSessionSchema = z.object({
  sessionId: z.string().min(1),
  countedAmount: z.number().min(0, "Le montant compté doit être positif ou nul"),
  notes: z.string().optional(),
});
