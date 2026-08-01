import { z } from "zod";

export const createCarePlanSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  title: z.string().min(2, "Titre requis"),
  startDate: z.string().min(1, "Date de début requise"),
  endDate: z.string().optional(),
});

export const createCareTaskSchema = z.object({
  carePlanId: z.string().min(1, "Plan de soins requis"),
  patientId: z.string().min(1, "Patient requis"),
  title: z.string().min(2, "Titre requis"),
  description: z.string().optional(),
  scheduledFor: z.string().min(1, "Date de planification requise"),
});

export const toggleTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  patientId: z.string().min(1),
  isCompleted: z.boolean(),
});

export const closeCarePlanSchema = z.object({
  carePlanId: z.string().min(1),
  patientId: z.string().min(1),
  dischargeSummary: z.string().min(1, "Le bilan de sortie est requis"),
});

export const reopenCarePlanSchema = z.object({
  patientId: z.string().min(1),
  title: z.string().optional(),
});
