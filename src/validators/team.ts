import { z } from "zod";

export const toggleAvailabilitySchema = z.object({
  userId: z.string().min(1),
  isAvailable: z.boolean(),
});

export const createTeamMemberSchema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  email: z.string().email("Adresse email invalide"),
  phone: z.string().optional(),
  role: z.enum(["MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER", "COORDINATOR", "ADMIN"], {
    message: "Rôle invalide pour un membre d'équipe",
  }),
  specialties: z.string().optional(),
  licenseNumber: z.string().optional(),
  organizationId: z.string().optional(),
});

export const reassignTeamMemberSchema = z.object({
  userId: z.string().min(1),
  newOrganizationId: z.string().min(1),
});
