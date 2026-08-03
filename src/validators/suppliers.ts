import { z } from "zod";

export const createOrUpdateSupplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nom du fournisseur requis"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Adresse email invalide").optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
  organizationId: z.string().optional(),
});
