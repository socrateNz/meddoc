import { z } from "zod";
import { Priority, IncidentStatus } from "@prisma/client";

export const createPatientSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  firstName: z.string().min(2, "Le prénom doit contenir au moins 2 caractères"),
  lastName: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  phone: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date de naissance requise"),
  sex: z.enum(["M", "F", "Autre"]).optional(),
  address: z.string().min(3, "Adresse requise"),
  emergencyContact: z.string().optional(),
  dependencyLevel: z.number().min(1).max(5),
  pathologies: z.array(z.string()),
  allergies: z.array(z.string()),
  organizationId: z.string().optional(),
});

export const createMedicalRecordSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  title: z.string().min(2, "Titre requis"),
  description: z.string().min(2, "Description requise"),
  documentUrl: z.string().optional(),
});

export const createIncidentSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  reportedById: z.string().min(1, "Déclarant requis"),
  title: z.string().min(3, "Titre requis (3 caractères min.)"),
  description: z.string().min(5, "Description requise (5 caractères min.)"),
  priority: z.nativeEnum(Priority),
});

export const updateIncidentStatusSchema = z.object({
  incidentId: z.string().min(1),
  status: z.nativeEnum(IncidentStatus),
});

export const reassignPatientSchema = z.object({
  patientId: z.string().min(1),
  newOrganizationId: z.string().min(1),
});
