import { z } from "zod";
import { resultDataSchema, resultTemplateSchema } from "@/lib/lab-templates";

export const createLabOrderSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  medicalRecordId: z.string().optional(),
  appointmentId: z.string().optional(),
  tests: z.array(z.string().min(1)).min(1, "Au moins une analyse requise"),
  notes: z.string().optional(),
  priority: z.enum(["ROUTINE", "URGENT"]).optional(),
  prenatalVisitId: z.string().optional(),
  // Examen externe d'une clinique partenaire, et numéro de son bon de demande.
  partnerId: z.string().optional(),
  partnerReference: z.string().max(60).optional(),
});

export const updateLabOrderStatusSchema = z.object({
  labOrderId: z.string().min(1),
  status: z.enum(["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB", "IN_ANALYSIS", "TO_VALIDATE", "VALIDATED", "DELIVERED", "CANCELLED"]),
});

export const collectSampleSchema = z.object({
  labOrderId: z.string().min(1),
  sampleType: z.enum(["BLOOD", "URINE", "STOOL", "SALIVA", "BIOPSY", "CSF", "OTHER"]),
  tests: z.array(z.string().min(1)).optional(),
  sampleQuantity: z.string().optional(),
  sampleCondition: z.string().optional(),
});

export const recordLabResultSchema = z.object({
  labOrderId: z.string().min(1),
  testName: z.string().min(1, "Analyse requise"),
  // Saisie simple : la valeur. Compte rendu structuré (modèle du catalogue) : `data`, la valeur
  // étant alors calculée côté serveur.
  value: z.string().optional(),
  data: resultDataSchema.optional(),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
  isAbnormal: z.boolean().optional(),
  notes: z.string().optional(),
}).refine((d) => !!d.data || !!d.value?.trim(), { message: "Valeur requise", path: ["value"] });

export const createOrUpdateLabTestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nom de l'examen requis"),
  department: z.string().optional(),
  // Tarif propre de l'examen, indépendant des produits consommés (cf. consumables).
  basePrice: z.number().min(0).optional(),
  // Coût propre de l'examen (réactifs non suivis en stock, temps technique...) — sert au calcul
  // de la marge, jamais facturé au patient.
  baseCost: z.number().min(0).optional(),
  // Prix partenaire (cf. Partner) ; null = prix maison.
  partnerPrice: z.number().min(0).nullable().optional(),
  // Modèle de compte rendu (null = saisie simple).
  resultTemplate: resultTemplateSchema.nullable().optional(),
  durationMinutes: z.number().min(0).optional(),
  criticalLow: z.number().optional(),
  criticalHigh: z.number().optional(),
  isActive: z.boolean().optional(),
  // Produits pharmacie consommés à chaque réalisation (0 ou plusieurs) — remplace l'ancien
  // pharmacyItemId obligatoire, désormais fusionné dans cette même liste.
  consumables: z
    .array(
      z.object({
        pharmacyItemId: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().min(0),
      })
    )
    .optional(),
});
