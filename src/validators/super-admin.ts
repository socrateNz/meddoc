import { z } from "zod";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

export const createHoldingSchema = z.object({
  name: z.string().trim().min(2, "Le nom est requis"),
  plan: z.nativeEnum(SubscriptionPlan),
  adminFirstName: z.string().min(2, "Prénom requis"),
  adminLastName: z.string().min(2, "Nom requis"),
  adminEmail: z.string().email("Adresse email invalide"),
  licenseExpiresAt: z.date().nullable().optional(),
});

export const updateHoldingSubscriptionSchema = z.object({
  holdingId: z.string().min(1),
  plan: z.nativeEnum(SubscriptionPlan),
  status: z.nativeEnum(SubscriptionStatus),
  licenseExpiresAt: z.date().nullable().optional(),
});
