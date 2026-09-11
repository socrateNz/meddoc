import { z } from "zod";

export const recordStockPurchaseSchema = z
  .object({
    pharmacyItemId: z.string().optional(),
    newItem: z
      .object({
        name: z.string().min(2, "Nom du produit requis"),
        dosage: z.string().optional(),
        category: z.enum(["MEDICATION", "CONSUMABLE", "EQUIPMENT"]).optional(),
        unitPrice: z.number().min(0, "Le prix de vente doit être positif"),
        reorderLevel: z.number().min(0).optional(),
        location: z.string().optional(),
      })
      .optional(),
    quantity: z.number().positive("La quantité doit être supérieure à zéro"),
    // Optionnel : pour un produit déjà au catalogue, non renseigné reprend le dernier prix
    // d'achat connu (cf. recordStockPurchase) — requis en revanche pour un nouveau produit,
    // faute d'historique à réutiliser (cf. refine ci-dessous).
    purchasePrice: z.number().positive("Le prix d'achat doit être supérieur à zéro").optional(),
    supplier: z.string().optional(),
    batchNumber: z.string().optional(),
    expiryDate: z.string().optional(),
    invoiceRef: z.string().optional(),
    organizationId: z.string().optional(),
    cashSessionId: z.string().optional(),
    // Retrait "Nouvelle dépense" déjà enregistré que cet achat vient régler — mutuellement
    // exclusif avec cashSessionId (cf. refine ci-dessous) : soit l'achat décaisse directement une
    // caisse ouverte, soit il règle un retrait déjà effectué, jamais les deux à la fois.
    linkedExpenseTransactionId: z.string().optional(),
  })
  .refine((data) => !!data.pharmacyItemId || !!data.newItem, {
    message: "Sélectionnez un produit existant ou renseignez un nouveau produit",
    path: ["pharmacyItemId"],
  })
  .refine((data) => !data.newItem || data.purchasePrice !== undefined, {
    message: "Le prix d'achat est requis pour un nouveau produit (aucun historique à réutiliser).",
    path: ["purchasePrice"],
  })
  .refine((data) => !(data.cashSessionId && data.linkedExpenseTransactionId), {
    message: "Un achat ne peut pas à la fois décaisser une caisse ouverte et régler un retrait déjà effectué.",
    path: ["linkedExpenseTransactionId"],
  });

export const inventoryCountLineInputSchema = z.object({
  lineId: z.string().min(1),
  countedQuantity: z.number().min(0, "La quantité comptée ne peut pas être négative"),
});

export const saveInventoryCountsSchema = z.object({
  inventoryCountId: z.string().min(1),
  lines: z.array(inventoryCountLineInputSchema).min(1, "Aucune ligne à enregistrer"),
});
