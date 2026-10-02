import { z } from "zod";

export const createCalendarEventSchema = z.object({
  title: z.string().min(2, "Titre requis"),
  description: z.string().optional(),
  startAt: z.string().min(1, "Date de début requise"),
  endAt: z.string().optional(),
  allDay: z.boolean().optional(),
});

export const updateCalendarEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  startAt: z.string().min(1).optional(),
  endAt: z.string().optional().nullable(),
  allDay: z.boolean().optional(),
});
