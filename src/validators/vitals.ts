import { z } from "zod";

export const recordVitalSignSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  appointmentId: z.string().optional(),
  temperature: z.number().min(25).max(45).optional(),
  bloodPressure: z.string().optional(),
  heartRate: z.number().min(20).max(300).optional(),
  oxygenSaturation: z.number().min(0).max(100).optional(),
  bloodSugar: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  painScore: z.number().min(0).max(10).optional(),
  notes: z.string().optional(),
});
