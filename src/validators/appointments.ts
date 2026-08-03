import { z } from "zod";

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  caregiverId: z.string().optional(),
  title: z.string().min(3, "Titre requis (3 caractères min.)"),
  scheduledAt: z.string().min(1, "Date/heure requise"),
  durationMinutes: z.number().min(5, "Durée minimale de 5 minutes"),
  type: z.string().min(1, "Type de rendez-vous requis"),
  status: z.string().optional(),
});

export const completeConsultationSchema = z.object({
  appointmentId: z.string().optional(),
  patientId: z.string().min(1, "Patient requis"),
  symptoms: z.string().min(1, "Symptômes / observations requis"),
  diagnosis: z.string().min(1, "Diagnostic requis"),
  plan: z.string().min(1, "Plan de traitement requis"),
  medications: z
    .array(
      z.object({
        name: z.string().min(1, "Nom du médicament requis"),
        dosage: z.string().min(1, "Dosage requis"),
        frequency: z.string().min(1, "Fréquence requise"),
        instructions: z.string().optional().default(""),
      })
    )
    .optional(),
  diagnosisCode: z.string().optional(),
  diagnosisLabel: z.string().optional(),
});
