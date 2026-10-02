import { z } from "zod";

export const createShiftSchema = z.object({
  userId: z.string().min(1, "Membre du personnel requis"),
  title: z.string().min(2, "Titre requis"),
  startAt: z.string().min(1, "Date de début requise"),
  endAt: z.string().min(1, "Date de fin requise"),
  notes: z.string().optional(),
});

export const updateShiftSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).optional(),
  title: z.string().min(2).optional(),
  startAt: z.string().min(1).optional(),
  endAt: z.string().min(1).optional(),
  notes: z.string().optional(),
});
