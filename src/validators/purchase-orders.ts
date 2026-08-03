import { z } from "zod";

export const purchaseOrderLineInputSchema = z
  .object({
    pharmacyItemId: z.string().optional(),
    newItemName: z.string().optional(),
    quantityOrdered: z.number().positive("La quantité commandée doit être supérieure à zéro"),
    unitCost: z.number().min(0, "Le coût unitaire doit être positif"),
  })
  .refine((data) => !!data.pharmacyItemId || !!data.newItemName, {
    message: "Sélectionnez un produit existant ou renseignez le nom d'un nouveau produit",
    path: ["pharmacyItemId"],
  });

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Fournisseur requis"),
  organizationId: z.string().optional(),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1, "Au moins une ligne requise"),
});

export const receiptLineInputSchema = z.object({
  lineId: z.string().min(1),
  quantityReceived: z.number().positive("La quantité reçue doit être supérieure à zéro"),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  purchasePrice: z.number().min(0).optional(),
});

export const receivePurchaseOrderLinesSchema = z.object({
  purchaseOrderId: z.string().min(1),
  receipts: z.array(receiptLineInputSchema).min(1, "Aucune ligne à réceptionner"),
});
