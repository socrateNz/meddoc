import { z } from "zod";

export const prescriptionItemSchema = z.object({
  pharmacyItemId: z.string().optional(),
  drugName: z.string().min(1, "Nom du médicament requis"),
  dosage: z.string().min(1, "Dosage requis"),
  frequency: z.string().min(1, "Fréquence requise"),
  duration: z.string().optional(),
  instructions: z.string().optional(),
  quantity: z.number().min(0).optional(),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().min(1, "Patient requis"),
  medicalRecordId: z.string().optional(),
  appointmentId: z.string().optional(),
  templateId: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, "Au moins un médicament requis"),
  notes: z.string().optional(),
});

export const renewPrescriptionSchema = z.object({
  prescriptionId: z.string().min(1),
  items: z.array(prescriptionItemSchema).optional(),
  notes: z.string().optional(),
});

export const createPrescriptionTemplateSchema = z.object({
  name: z.string().min(1, "Nom du modèle requis"),
  pathology: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, "Au moins un médicament requis"),
  isShared: z.boolean().optional(),
});
