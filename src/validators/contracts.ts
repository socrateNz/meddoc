import { z } from "zod";

export const createContractSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  caregiverId: z.string().optional(),
  title: z.string().min(2, "Titre requis"),
  startDate: z.string().min(1, "Date de début requise"),
  endDate: z.string().optional(),
  hourlyRate: z.number().positive("Le taux horaire doit être positif"),
  hoursPerWeek: z.number().positive("Le nombre d'heures par semaine doit être positif"),
  documentUrl: z.string().optional(),
  organizationId: z.string().optional(),
});

export const updateContractStatusSchema = z.object({
  contractId: z.string().min(1),
  status: z.enum(["ACTIVE", "COMPLETED", "TERMINATED", "SUSPENDED"]),
});
