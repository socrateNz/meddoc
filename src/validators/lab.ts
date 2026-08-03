import { z } from "zod";

export const createLabOrderSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  medicalRecordId: z.string().optional(),
  tests: z.array(z.string().min(1)).min(1, "Au moins une analyse requise"),
  notes: z.string().optional(),
  priority: z.enum(["ROUTINE", "URGENT"]).optional(),
});

export const updateLabOrderStatusSchema = z.object({
  labOrderId: z.string().min(1),
  status: z.enum(["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB", "IN_ANALYSIS", "TO_VALIDATE", "VALIDATED", "DELIVERED", "CANCELLED"]),
});

export const collectSampleSchema = z.object({
  labOrderId: z.string().min(1),
  sampleType: z.enum(["BLOOD", "URINE", "STOOL", "SALIVA", "BIOPSY", "CSF", "OTHER"]),
  sampleQuantity: z.string().optional(),
  sampleCondition: z.string().optional(),
});

export const recordLabResultSchema = z.object({
  labOrderId: z.string().min(1),
  testName: z.string().min(1, "Analyse requise"),
  value: z.string().min(1, "Valeur requise"),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
  isAbnormal: z.boolean().optional(),
  notes: z.string().optional(),
});

export const createOrUpdateLabTestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nom de l'examen requis"),
  department: z.string().optional(),
  price: z.number().min(0).optional(),
  durationMinutes: z.number().min(0).optional(),
  criticalLow: z.number().optional(),
  criticalHigh: z.number().optional(),
  isActive: z.boolean().optional(),
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
