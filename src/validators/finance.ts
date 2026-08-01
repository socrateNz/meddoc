import { z } from "zod";

export const pharmacyItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nom du produit requis"),
  dosage: z.string().optional(),
  category: z.string().optional(),
  reorderLevel: z.number().min(0),
  unitPrice: z.number().min(0, "Le prix de vente doit être positif"),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  supplier: z.string().optional(),
  location: z.string().optional(),
  organizationId: z.string().optional(),
});

export const recordPharmacySaleSchema = z.object({
  pharmacyItemId: z.string().min(1),
  quantity: z.number().positive("La quantité doit être supérieure à zéro"),
  patientId: z.string().optional(),
  organizationId: z.string().optional(),
});

export const recordSpecifiedIncomeSchema = z.object({
  description: z.string().min(1, "Le motif est requis"),
  amount: z.number().positive("Le montant doit être supérieur à zéro"),
  patientId: z.string().optional(),
  organizationId: z.string().optional(),
});

export const recordExpenseSchema = z.object({
  description: z.string().min(1, "Le motif est requis"),
  amount: z.number().positive("Le montant doit être supérieur à zéro"),
  organizationId: z.string().optional(),
});

export const recordMultiItemInvoiceSchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(["PHARMACY", "SERVICE"]),
        pharmacyItemId: z.string().optional(),
        description: z.string().min(1),
        quantity: z.number().min(0),
        unitPrice: z.number().min(0),
        amount: z.number().min(0),
      })
    )
    .min(1, "Le panier de facturation est vide"),
  patientId: z.string().optional(),
  organizationId: z.string().optional(),
});
