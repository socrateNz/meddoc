import { z } from "zod";
import { SubscriptionPlan, SubscriptionStatus, PaymentFrequency, PaymentPlan } from "@prisma/client";

export const createHoldingSchema = z.object({
  name: z.string().trim().min(2, "Le nom est requis"),
  plan: z.nativeEnum(SubscriptionPlan),
  adminFirstName: z.string().min(2, "Prénom requis"),
  adminLastName: z.string().min(2, "Nom requis"),
  adminEmail: z.string().email("Adresse email invalide"),
  licenseExpiresAt: z.date().nullable().optional(),
  paymentAmount: z.number().min(0, "Le montant doit être positif").nullable().optional(),
  paymentFrequency: z.nativeEnum(PaymentFrequency).nullable().optional(),
  paymentPlan: z.nativeEnum(PaymentPlan).optional(),
  installmentsCount: z.number().int().min(1, "Doit être au moins 1").nullable().optional(),
  nextPaymentDate: z.date().nullable().optional(),
});

export const updateHoldingSubscriptionSchema = z.object({
  holdingId: z.string().min(1),
  name: z.string().trim().min(2, "Le nom est requis"),
  plan: z.nativeEnum(SubscriptionPlan),
  status: z.nativeEnum(SubscriptionStatus),
  licenseExpiresAt: z.date().nullable().optional(),
  paymentAmount: z.number().min(0, "Le montant doit être positif").nullable().optional(),
  paymentFrequency: z.nativeEnum(PaymentFrequency).nullable().optional(),
  maxClinics: z.number().int().min(1, "Doit être au moins 1"),
  maxUsers: z.number().int().min(1, "Doit être au moins 1"),
  paymentPlan: z.nativeEnum(PaymentPlan),
  installmentsCount: z.number().int().min(1, "Doit être au moins 1").nullable().optional(),
  nextPaymentDate: z.date().nullable().optional(),
});
