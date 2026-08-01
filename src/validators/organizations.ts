import { z } from "zod";

export const createClinicSchema = z.object({
  name: z.string().trim().min(2, "Le nom de la clinique est requis"),
});

export const updateClinicSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Le nom de la clinique est requis"),
});
