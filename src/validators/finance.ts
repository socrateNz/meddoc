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
  // Amorce le stock au tout premier import — cf. commentaire sur importPharmacyItems.
  stockQuantity: z.number().min(0).optional(),
  // Vide = non renseigné : le stock initial reste "hérité" (sans lot valorisé), comme si ce
  // champ n'existait pas. Fourni, il crée un lot StockPurchase pour ce stock initial.
  purchasePrice: z.number().min(0).optional(),
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

// items n'est fourni que pour le tout premier règlement d'une facture encore PENDING (le
// caissier peut alors corriger le panier auto-généré avant d'encaisser) — verrouillé dès
// qu'un premier paiement existe (PARTIAL), cf. payPendingInvoice.
export const payPendingInvoiceSchema = z.object({
  pendingInvoiceId: z.string().min(1),
  cashSessionId: z.string().min(1, "Aucune session de caisse ouverte."),
  amount: z.number().positive("Le montant réglé doit être supérieur à zéro"),
  items: z.array(invoiceItemSchema).min(1, "Le panier de facturation est vide").optional(),
});

export const createCaisseSaleSchema = z.object({
  cashSessionId: z.string().min(1, "Aucune session de caisse ouverte."),
  items: z.array(invoiceItemSchema).min(1, "Le panier de facturation est vide"),
  patientId: z.string().optional(),
  customPatientName: z.string().optional(),
  customPatientPhone: z.string().optional(),
  organizationId: z.string().optional(),
  // Montant réellement remis par le client maintenant — omis ou égal au total du panier =
  // comportement actuel inchangé (paiement intégral immédiat). Inférieur au total = vente à
  // crédit / paiement partiel : le solde restera dû sur la PendingInvoice créée.
  amountReceived: z.number().min(0).optional(),
});

export const updateInvoicePatientInfoSchema = z.object({
  pendingInvoiceId: z.string().min(1),
  customPatientName: z.string().optional(),
  customPatientPhone: z.string().optional(),
});

export const dispensePendingInvoiceSchema = z.object({
  pendingInvoiceId: z.string().min(1),
  referenceCode: z.string().min(1, "Le code de référence est requis."),
});
