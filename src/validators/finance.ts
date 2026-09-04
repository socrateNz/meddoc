import { z } from "zod";

export const pharmacyItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nom du produit requis"),
  dosage: z.string().optional(),
  category: z.enum(["MEDICATION", "CONSUMABLE", "EQUIPMENT"]).optional(),
  reorderLevel: z.number().min(0),
  unitPrice: z.number().min(0, "Le prix de vente doit être positif"),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  supplier: z.string().optional(),
  location: z.string().optional(),
  organizationId: z.string().optional(),
});

// Un item importé n'a jamais d'id (toujours une création, jamais une mise à jour — cf.
// importPharmacyItems dans src/actions/finance.ts) ni d'organizationId par ligne (imposé une
// seule fois pour tout le lot par l'appelant).
export const pharmacyItemImportRowSchema = z.object({
  name: z.string().min(2, "Nom du produit requis"),
  dosage: z.string().optional(),
  category: z.enum(["MEDICATION", "CONSUMABLE", "EQUIPMENT"]).optional(),
  reorderLevel: z.number().min(0),
  unitPrice: z.number().min(0, "Le prix de vente doit être positif"),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  supplier: z.string().optional(),
  location: z.string().optional(),
});

export const importPharmacyItemsSchema = z.object({
  items: z.array(pharmacyItemImportRowSchema).min(1, "Aucune ligne à importer"),
  organizationId: z.string().optional(),
});

const invoiceItemSchema = z.object({
  type: z.enum(["PHARMACY", "SERVICE"]),
  pharmacyItemId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  amount: z.number().min(0),
});

export const recordExpenseSchema = z.object({
  cashSessionId: z.string().min(1, "Aucune session de caisse ouverte."),
  description: z.string().min(1, "Le motif est requis"),
  amount: z.number().positive("Le montant doit être supérieur à zéro"),
  organizationId: z.string().optional(),
});

export const payPendingInvoiceSchema = z.object({
  pendingInvoiceId: z.string().min(1),
  cashSessionId: z.string().min(1, "Aucune session de caisse ouverte."),
  items: z.array(invoiceItemSchema).min(1, "Le panier de facturation est vide"),
});

export const createCaisseSaleSchema = z.object({
  cashSessionId: z.string().min(1, "Aucune session de caisse ouverte."),
  items: z.array(invoiceItemSchema).min(1, "Le panier de facturation est vide"),
  patientId: z.string().optional(),
  organizationId: z.string().optional(),
});

export const dispensePendingInvoiceSchema = z.object({
  pendingInvoiceId: z.string().min(1),
});
