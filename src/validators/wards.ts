import { z } from "zod";

// Tarif d'une nuitée en FCFA : absent/null = non renseigné (cf. src/lib/hospital-stay.ts).
const nightlyRate = z.number().finite().min(0, "Le tarif ne peut pas être négatif").nullable().optional();

export const createWardSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1, "Nom du service requis"),
  code: z.string().min(1, "Code du service requis"),
  nightlyRate,
});

export const updateWardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nom du service requis"),
  code: z.string().min(1, "Code du service requis"),
  nightlyRate,
});

export const createRoomSchema = z.object({
  wardId: z.string().min(1),
  name: z.string().min(1, "Nom de la chambre requis"),
  nightlyRate,
});

export const updateRoomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nom de la chambre requis"),
  nightlyRate,
});

export const createBedSchema = z.object({
  roomId: z.string().min(1),
  label: z.string().min(1, "Identifiant du lit requis"),
});

export const assignPatientToBedSchema = z.object({
  patientId: z.string().min(1),
  bedId: z.string().min(1),
});
