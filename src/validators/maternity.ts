import { z } from "zod";

export const createPregnancySchema = z.object({
  patientId: z.string().min(1),
  lastMenstrualPeriod: z.string().min(1, "Date des dernières règles requise"),
  expectedDueDate: z.string().min(1, "Date prévue d'accouchement requise"),
  gravidity: z.number().min(1, "Gravidité requise"),
  parity: z.number().min(0, "Parité requise"),
  riskFactors: z.array(z.string()).optional(),
});

export const addPrenatalVisitSchema = z.object({
  pregnancyId: z.string().min(1),
  visitDate: z.string().optional(),
  gestationalWeeks: z.number().min(0).optional(),
  weightKg: z.number().min(0).optional(),
  bloodPressureSystolic: z.number().min(0).optional(),
  bloodPressureDiastolic: z.number().min(0).optional(),
  fundalHeightCm: z.number().min(0).optional(),
  fetalHeartRateBpm: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const recordDeliverySchema = z.object({
  pregnancyId: z.string().min(1),
  deliveredAt: z.string().optional(),
  mode: z.enum(["VAGINAL", "C_SECTION", "ASSISTED"]),
  complications: z.array(z.string()).optional(),
  notes: z.string().optional(),
  newborns: z
    .array(
      z.object({
        sex: z.enum(["M", "F", "Indéterminé"]),
        weightGrams: z.number().min(1, "Poids requis"),
        apgarScore1: z.number().min(0).max(10).optional(),
        apgarScore5: z.number().min(0).max(10).optional(),
        vitalStatus: z.enum(["LIVE_BIRTH", "STILLBIRTH"]).optional(),
        notes: z.string().optional(),
      })
    )
    .min(1, "Au moins un nouveau-né requis"),
});

export const updatePregnancyStatusSchema = z.object({
  pregnancyId: z.string().min(1),
  status: z.enum(["MISCARRIED", "TERMINATED"]),
});
