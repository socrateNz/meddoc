import { z } from "zod";

export const createWardSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1, "Nom du service requis"),
  code: z.string().min(1, "Code du service requis"),
});

export const updateWardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nom du service requis"),
  code: z.string().min(1, "Code du service requis"),
});

export const createRoomSchema = z.object({
  wardId: z.string().min(1),
  name: z.string().min(1, "Nom de la chambre requis"),
});

export const updateRoomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nom de la chambre requis"),
});

export const createBedSchema = z.object({
  roomId: z.string().min(1),
  label: z.string().min(1, "Identifiant du lit requis"),
});

export const assignPatientToBedSchema = z.object({
  patientId: z.string().min(1),
  bedId: z.string().min(1),
});
