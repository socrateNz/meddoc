"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  pharmacyItemSchema,
  recordExpenseSchema,
  payPendingInvoiceSchema,
  createCaisseSaleSchema,
  updateInvoicePatientInfoSchema,
  dispensePendingInvoiceSchema,
  importPharmacyItemsSchema,
} from "@/validators/finance";
import { consumeStockLots, assertStockWrite } from "@/actions/stock";
import { assertRegisterOperateRole, assertRegisterReadRole } from "@/actions/register-permissions";
import { revalidatePath } from "next/cache";

// ADMIN (holding) garde une vue lecture seule de la finance (KPI, journal, valorisation) ;
// COORDINATOR seul y a un accès d'écriture directe (dépenses hors-session exceptées — voir
// recordExpense, désormais rattaché à une session de caisse). Le catalogue pharmacie a son
// propre rôle de lecture élargi (CASHIER en a besoin pour construire un panier de vente).
const FINANCE_READ_ROLES = ["ADMIN", "COORDINATOR"];
const PHARMACY_CATALOG_READ_ROLES = ["ADMIN", "COORDINATOR", "PHARMACIST", "CASHIER"];
// Remise des médicaments au comptoir : PHARMACIST uniquement, volontairement plus strict que
// STOCK_WRITE_ROLES (COORDINATOR+PHARMACIST) qui régit le reste du stock — séparation caisse/
// pharmacie voulue par cette fonctionnalité, seule dérogation à la convention habituelle de ce
// module (partout ailleurs, COORDINATOR reste un rôle de secours).
const PHARMACY_DISPENSE_ROLES = ["PHARMACIST"];

function assertFinanceReadRole(role: string) {
  if (!FINANCE_READ_ROLES.includes(role)) {
    throw new Error("Non autorisé.");
  }
}

function assertPharmacyCatalogReadRole(role: string) {
  if (!PHARMACY_CATALOG_READ_ROLES.includes(role)) {
    throw new Error("Non autorisé.");
  }
}

function assertPharmacyDispenseRole(role: string) {
  if (!PHARMACY_DISPENSE_ROLES.includes(role)) {
    throw new Error("Non autorisé. Réservé aux pharmacien(ne)s.");
  }
}

// Helper function to format raw MongoDB documents into standard JS objects
function formatMongoDoc(doc: any) {
  if (!doc) return null;
  const id = doc._id?.$oid || (typeof doc._id === "string" ? doc._id : doc._id?.toString() || "");
  const formatted: any = { ...doc, id };
  delete formatted._id;

  if (formatted.createdAt && formatted.createdAt.$date) {
    formatted.createdAt = new Date(formatted.createdAt.$date);
  }
  if (formatted.updatedAt && formatted.updatedAt.$date) {
    formatted.updatedAt = new Date(formatted.updatedAt.$date);
  }
  if (formatted.expiryDate && formatted.expiryDate.$date) {
    formatted.expiryDate = new Date(formatted.expiryDate.$date);
  }
  if (formatted.organizationId && formatted.organizationId.$oid) {
    formatted.organizationId = formatted.organizationId.$oid;
  }
  if (formatted.patientId && formatted.patientId.$oid) {
    formatted.patientId = formatted.patientId.$oid;
  }
  if (formatted.recordedById && formatted.recordedById.$oid) {
    formatted.recordedById = formatted.recordedById.$oid;
  }
  if (formatted.pharmacyItemId && formatted.pharmacyItemId.$oid) {
    formatted.pharmacyItemId = formatted.pharmacyItemId.$oid;
  }

  return formatted;
}

export async function getPharmacyItems(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyCatalogReadRole(activeUser.role);

    const targetOrgId = organizationId || activeUser.organizationId;

    const filter: any = {};
    if (targetOrgId) {
      filter.organizationId = { "$oid": targetOrgId };
    }

    // batchSize explicite : sans lui, la commande find brute de MongoDB plafonne son premier lot
    // ("firstBatch") à 101 documents par défaut — au-delà, le reste était silencieusement absent
    // du catalogue affiché sans la moindre erreur (repéré après un import CSV faisant passer le
    // stock au-delà de ce seuil). 10000 couvre largement la taille réaliste d'un catalogue.
    const rawRes: any = await prisma.$runCommandRaw({
      find: "PharmacyItem",
      filter: filter,
      sort: { name: 1 },
      batchSize: 10000,
    });

    const docs = (rawRes.cursor?.firstBatch || []).map(formatMongoDoc);
    return { success: true, data: docs };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement des médicaments." };
  }
}

export async function createOrUpdatePharmacyItem(data: {
  id?: string;
  name: string;
  dosage?: string;
  category?: string;
  reorderLevel: number;
  unitPrice: number;
  batchNumber?: string;
  expiryDate?: string;
  supplier?: string;
  location?: string;
  organizationId?: string;
}) {
  try {
    pharmacyItemSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const targetOrgId = data.organizationId || activeUser!.organizationId;
    const nowISO = new Date().toISOString();
    const expiryISO = data.expiryDate ? new Date(data.expiryDate).toISOString() : null;

    // Ce formulaire ne porte que les métadonnées du produit : la quantité en
    // stock n'est plus modifiable ici, elle évolue uniquement via un achat
    // (recordStockPurchase), une remise en pharmacie, ou une clôture d'inventaire.
    let item: any;
    if (data.id) {
      await prisma.$runCommandRaw({
        update: "PharmacyItem",
        updates: [{
          q: { _id: { "$oid": data.id } },
          u: {
            "$set": {
              name: data.name,
              dosage: data.dosage || null,
              category: data.category || "MEDICATION",
              reorderLevel: Number(data.reorderLevel),
              unitPrice: Number(data.unitPrice),
              batchNumber: data.batchNumber || null,
              expiryDate: expiryISO ? { "$date": expiryISO } : null,
              supplier: data.supplier || null,
              location: data.location || null,
              updatedAt: { "$date": nowISO }
            }
          }
        }]
      });
      item = { id: data.id, name: data.name };
    } else {
      await prisma.$runCommandRaw({
        insert: "PharmacyItem",
        documents: [{
          name: data.name,
          dosage: data.dosage || null,
          category: data.category || "MEDICATION",
          stockQuantity: 0,
          reorderLevel: Number(data.reorderLevel),
          unitPrice: Number(data.unitPrice),
          batchNumber: data.batchNumber || null,
          expiryDate: expiryISO ? { "$date": expiryISO } : null,
          supplier: data.supplier || null,
          location: data.location || null,
          organizationId: targetOrgId ? { "$oid": targetOrgId } : null,
          createdAt: { "$date": nowISO },
          updatedAt: { "$date": nowISO }
        }]
      });
      item = { id: "created", name: data.name };
    }

    await logAuditAction(activeUser!.id, data.id ? "UPDATE_PHARMACY_ITEM" : "CREATE_PHARMACY_ITEM", "PharmacyItem", item.id || "new");
    revalidatePath("/dashboard/pharmacie");
    if (targetOrgId) revalidatePath(`/dashboard/clinics/${targetOrgId}/pharmacie`);
    revalidatePath("/dashboard", "layout");

    return { success: true, data: item };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'article.") };
  }
}

// Import CSV en masse — toujours une CRÉATION (jamais de mise à jour par ce chemin, contrairement
// à createOrUpdatePharmacyItem) : pas de rapprochement par nom pour éviter d'écraser silencieusement
// un produit existant à cause d'un nom mal orthographié dans le fichier.
// stockQuantity (optionnel, 0 par défaut) est une dérogation volontaire à la règle habituelle
// (stock à 0 à la création, n'évoluant ensuite que via achat/vente/inventaire) : elle permet
// d'amorcer le catalogue en une fois lors du tout premier import.
// purchasePrice (optionnel, vide = non renseigné) : si fourni avec un stockQuantity > 0, un lot
// StockPurchase est créé pour ce stock initial (traçabilité/valorisation FEFO comme un achat
// normal), mais SANS FinancialTransaction associée — il ne s'agit pas d'un achat réalisé
// aujourd'hui, seulement de la constatation d'un stock déjà physiquement présent. Si non
// renseigné, ce stock initial reste "hérité" sans lot valorisé — cas déjà prévu par
// consumeStockLots (src/actions/stock.ts) pour ce genre de stock. Les ajouts après cet import
// initial repassent par le circuit normal (Nouveau produit, stock à 0, puis Nouvel achat).
export async function importPharmacyItems(data: {
  items: Array<{
    name: string;
    dosage?: string;
    category?: string;
    reorderLevel: number;
    unitPrice: number;
    stockQuantity?: number;
    purchasePrice?: number;
    batchNumber?: string;
    expiryDate?: string;
    supplier?: string;
    location?: string;
  }>;
  organizationId?: string;
}) {
  try {
    importPharmacyItemsSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const targetOrgId = data.organizationId || activeUser!.organizationId;

    const toItemData = (item: (typeof data.items)[number], stockQuantity: number, expiryDate: Date | null) => ({
      name: item.name,
      dosage: item.dosage || null,
      category: (item.category as any) || "MEDICATION",
      stockQuantity,
      reorderLevel: Number(item.reorderLevel),
      unitPrice: Number(item.unitPrice),
      batchNumber: item.batchNumber || null,
      expiryDate,
      supplier: item.supplier || null,
      location: item.location || null,
      organizationId: targetOrgId || null,
    });

    // Chaque ligne est créée indépendamment plutôt que via un createMany() unique pour tout le
    // lot : sur MongoDB, un insertMany en lot est ORDONNÉ par défaut — si une seule ligne est
    // rejetée (ex: date invalide échappée à la validation), Mongo arrête le lot à cet endroit et
    // n'insère jamais la suite, SANS lever d'erreur exploitable. C'est ce qui causait un import
    // de 159 lignes n'en créant que 101, sans aucun message. Ici, une ligne en échec n'affecte
    // aucune autre — et l'utilisateur voit exactement laquelle et pourquoi. Envoyées par petits
    // groupes concurrents (plutôt qu'un $transaction unique, dont le délai de 5s était dépassé
    // dès une centaine de lignes en série) pour rester rapide sans surcharger la connexion.
    const CHUNK_SIZE = 20;
    const failures: { name: string; error: string }[] = [];
    let count = 0;

    for (let i = 0; i < data.items.length; i += CHUNK_SIZE) {
      const chunk = data.items.slice(i, i + CHUNK_SIZE);
      const settled = await Promise.allSettled(
        chunk.map(async (item) => {
          const stockQuantity = Math.max(0, Number(item.stockQuantity) || 0);
          const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
          if (expiryDate && Number.isNaN(expiryDate.getTime())) {
            throw new Error(`Date de péremption invalide ("${item.expiryDate}")`);
          }

          if (stockQuantity > 0 && item.purchasePrice != null) {
            await prisma.$transaction(async (tx) => {
              const pharmacyItem = await tx.pharmacyItem.create({ data: toItemData(item, stockQuantity, expiryDate) });
              await tx.stockPurchase.create({
                data: {
                  pharmacyItemId: pharmacyItem.id,
                  quantity: stockQuantity,
                  remainingQuantity: stockQuantity,
                  purchasePrice: Number(item.purchasePrice),
                  totalCost: stockQuantity * Number(item.purchasePrice),
                  supplier: item.supplier || null,
                  batchNumber: item.batchNumber || null,
                  expiryDate,
                  purchasedById: activeUser!.id,
                  organizationId: targetOrgId || null,
                },
              });
            });
          } else {
            await prisma.pharmacyItem.create({ data: toItemData(item, stockQuantity, expiryDate) });
          }
        })
      );

      settled.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          count++;
        } else {
          failures.push({ name: chunk[idx].name, error: toErrorMessage(result.reason, "Erreur inconnue") });
        }
      });
    }

    await logAuditAction(activeUser!.id, "IMPORT_PHARMACY_ITEMS_CSV", "PharmacyItem", "bulk", { count, failures: failures.length });
    revalidatePath("/dashboard/pharmacie");
    if (targetOrgId) revalidatePath(`/dashboard/clinics/${targetOrgId}/pharmacie`);
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { count, failures } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'import du fichier.") };
  }
}

export async function recordExpense(data: { cashSessionId: string; description: string; amount: number; organizationId?: string }) {
  try {
    recordExpenseSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser.role);

    const session = await prisma.cashSession.findUnique({ where: { id: data.cashSessionId } });
    if (!session || session.status !== "OPEN") {
      throw new Error("Aucune session de caisse ouverte. Ouvrez la caisse avant d'enregistrer une dépense.");
    }

    const amount = Number(data.amount);

    const transaction = await prisma.financialTransaction.create({
      data: {
        type: "EXPENSE",
        category: "OPERATIONAL_EXPENSE",
        amount,
        description: data.description.trim(),
        recordedById: activeUser.id,
        organizationId: session.organizationId,
        cashSessionId: session.id,
      },
    });

    await logAuditAction(activeUser.id, "RECORD_EXPENSE", "FinancialTransaction", transaction.id);
    revalidatePath(`/dashboard/clinics/${session.organizationId}/caisse`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: transaction };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de la dépense.") };
  }
}

async function decrementStockForItems(
  tx: any,
  items: Array<{ type: "PHARMACY" | "SERVICE"; pharmacyItemId?: string; description: string; quantity: number }>,
  organizationId: string | null
) {
  const stockSnapshots = new Map<string, { name: string; stockQuantity: number; reorderLevel: number }>();
  for (const item of items) {
    if (item.type !== "PHARMACY" || !item.pharmacyItemId) continue;
    const pItem = await tx.pharmacyItem.findUnique({ where: { id: item.pharmacyItemId } });
    if (!pItem) throw new Error(`Produit introuvable : ${item.description}`);
    if (pItem.stockQuantity < item.quantity) {
      throw new Error(`Stock insuffisant pour "${pItem.name}". Disponible: ${pItem.stockQuantity}, Demandé: ${item.quantity}`);
    }
    stockSnapshots.set(item.pharmacyItemId, { name: pItem.name, stockQuantity: pItem.stockQuantity, reorderLevel: pItem.reorderLevel });
  }

  for (const item of items) {
    if (item.type !== "PHARMACY" || !item.pharmacyItemId) continue;
    await tx.pharmacyItem.update({
      where: { id: item.pharmacyItemId },
      data: { stockQuantity: { decrement: item.quantity } },
    });
    await consumeStockLots(tx, item.pharmacyItemId, item.quantity);
  }

  const lowStockAlerts: any[] = [];
  for (const [pharmacyItemId, snapshot] of stockSnapshots) {
    const soldQty = items
      .filter((i) => i.type === "PHARMACY" && i.pharmacyItemId === pharmacyItemId)
      .reduce((sum, i) => sum + Number(i.quantity), 0);
    const newQty = snapshot.stockQuantity - soldQty;
    if (snapshot.stockQuantity > snapshot.reorderLevel && newQty <= snapshot.reorderLevel) {
      lowStockAlerts.push({
        pharmacyItemId,
        itemName: snapshot.name,
        stockQuantity: newQty,
        reorderLevel: snapshot.reorderLevel,
        organizationId,
      });
    }
  }
  return lowStockAlerts;
}

// Enregistre un règlement (total ou partiel) sur une facture en attente (créée à la clôture
// d'une consultation, une demande labo, un envoi d'ordonnance à la pharmacie, ou directement à
// la caisse) : encaisse l'argent, émet une FinancialTransaction pour CE règlement précis (pas
// forcément le total de la facture — paiement échelonné) et le ticket correspondant. Le stock
// N'est PAS touché ici, quel que soit l'état de règlement — cf. dispensePendingInvoice, seul
// endroit où une vente pharmacie décrémente le stock, indépendant du paiement.
export async function payPendingInvoice(
  pendingInvoiceId: string,
  cashSessionId: string,
  amount: number,
  items?: Array<{
    type: "PHARMACY" | "SERVICE";
    pharmacyItemId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>
) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser.role);

    // L'existence/l'état de la facture et de la session sont vérifiés avant la forme du panier :
    // une facture déjà réglée ou une caisse fermée doit renvoyer son message dédié même si le
    // montant transmis est invalide, plutôt que l'erreur générique du schéma Zod.
    const [pending, session] = await Promise.all([
      prisma.pendingInvoice.findUnique({ where: { id: pendingInvoiceId } }),
      prisma.cashSession.findUnique({ where: { id: cashSessionId } }),
    ]);
    if (!pending || pending.status === "PAID") {
      throw new Error("Cette facture en attente n'existe plus ou a déjà été intégralement réglée.");
    }
    if (!session || session.status !== "OPEN") {
      throw new Error("Aucune session de caisse ouverte. Ouvrez la caisse avant d'encaisser.");
    }

    payPendingInvoiceSchema.parse({ pendingInvoiceId, cashSessionId, amount, items });

    // Le panier n'est modifiable (remplace pending.items) que sur le tout premier règlement,
    // tant que rien n'a encore été perçu — dès qu'un acompte existe (PARTIAL), il est verrouillé
    // pour ne pas fausser rétroactivement ce qui a déjà été encaissé dessus.
    const currentItems: any[] = pending.status === "PENDING" && items ? items : ((pending.items as any[]) || []);
    if (!currentItems.length) throw new Error("Le panier de facturation est vide.");

    const totalAmount = currentItems.reduce((sum, item) => sum + Number(item.amount), 0);
    const alreadyPaidAgg = await prisma.financialTransaction.aggregate({
      where: { pendingInvoiceId },
      _sum: { amount: true },
    });
    const alreadyPaid = alreadyPaidAgg._sum.amount || 0;
    const remaining = totalAmount - alreadyPaid;
    const EPS = 0.5; // tolérance flottante (FCFA sans décimales)
    if (amount > remaining + EPS) {
      throw new Error(`Le montant dépasse le reste à payer (${Math.round(remaining)} FCFA).`);
    }

    const summaryDescription = currentItems.length === 1
      ? currentItems[0].description
      : `Facture regroupée (${currentItems.length} articles : ${currentItems.map((i) => i.description).join(", ")})`;

    const transaction = await prisma.financialTransaction.create({
      data: {
        type: "INCOME",
        category: currentItems.some((i) => i.type === "PHARMACY") ? "PHARMACY_SALE" : "SERVICE_FEE",
        amount,
        description: summaryDescription,
        items: currentItems,
        patientId: pending.patientId,
        recordedById: activeUser.id,
        organizationId: pending.organizationId,
        cashSessionId: session.id,
        pendingInvoiceId,
      },
    });

    const newAlreadyPaid = alreadyPaid + amount;
    const nowFullyPaid = newAlreadyPaid >= totalAmount - EPS;
    const updated = await prisma.pendingInvoice.update({
      where: { id: pendingInvoiceId },
      data: {
        status: nowFullyPaid ? "PAID" : "PARTIAL",
        items: currentItems,
        cashSessionId: session.id,
        ...(nowFullyPaid ? { paidAt: new Date() } : {}),
      },
    });

    // Débloque toute demande d'analyse labo liée à cette facture qui attendait le règlement
    // (cf. src/actions/lab.ts:createLabOrder — paymentStatus) — seulement une fois le solde
    // intégralement réglé, jamais sur un simple acompte. No-op si la facture ne concerne pas un
    // examen labo.
    if (nowFullyPaid) {
      await prisma.labOrder.updateMany({
        where: { pendingInvoiceId, paymentStatus: "PENDING" },
        data: { paymentStatus: "PAID" },
      });
    }

    await logAuditAction(activeUser.id, "PAY_PENDING_INVOICE", "PendingInvoice", pendingInvoiceId, { transactionId: transaction.id, amount });
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/caisse`);
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    revalidatePath("/dashboard/lab");
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return {
      success: true,
      data: {
        transaction,
        pendingInvoice: updated,
        invoiceTotalAmount: totalAmount,
        amountPaid: newAlreadyPaid,
        remainingDue: Math.max(0, totalAmount - newAlreadyPaid),
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'encaissement de la facture.") };
  }
}

// Vente comptant directement au guichet de la caisse (pas d'ordonnance/demande préalable). Le
// montant réellement reçu (amountReceived) peut être inférieur au total du panier — vente à
// crédit ou paiement partiel, y compris pour un client comptant anonyme. Comme pour
// payPendingInvoice, le stock n'est décrémenté qu'à la remise en pharmacie, indépendamment de
// l'état de règlement.
export async function createCaisseSale(data: {
  cashSessionId: string;
  items: Array<{
    type: "PHARMACY" | "SERVICE";
    pharmacyItemId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  patientId?: string;
  customPatientName?: string;
  customPatientPhone?: string;
  organizationId?: string;
  amountReceived?: number;
}) {
  try {
    createCaisseSaleSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser.role);

    const session = await prisma.cashSession.findUnique({ where: { id: data.cashSessionId } });
    if (!session || session.status !== "OPEN") {
      throw new Error("Aucune session de caisse ouverte. Ouvrez la caisse avant d'encaisser.");
    }

    const targetOrgId = data.organizationId || session.organizationId;
    const totalAmount = data.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const received = Math.min(totalAmount, Math.max(0, data.amountReceived ?? totalAmount));
    const summaryDescription = data.items.length === 1
      ? data.items[0].description
      : `Vente comptant (${data.items.length} articles : ${data.items.map((i) => i.description).join(", ")})`;

    const customName = data.customPatientName?.trim() || null;
    const customPhone = data.customPatientPhone?.trim() || null;

    // Toujours créée désormais, quel que soit le contenu du panier ou la présence d'un patient :
    // toute vente non intégralement réglée doit être traçable et réapparaître dans "Tickets
    // impayés" / la file pharmacie (dispensePendingInvoice est le seul endroit où le stock
    // bouge). Créée avant la transaction pour lui renseigner pendingInvoiceId directement.
    const pendingInvoice = await prisma.pendingInvoice.create({
      data: {
        status: received >= totalAmount ? "PAID" : received > 0 ? "PARTIAL" : "PENDING",
        patientId: data.patientId || null,
        customPatientName: customName,
        customPatientPhone: customPhone,
        organizationId: targetOrgId,
        items: data.items,
        createdById: activeUser.id,
        // Null tant qu'aucun paiement n'a réellement eu lieu (vente 100% à crédit) — ce champ ne
        // reflète que la dernière session ayant perçu un règlement, cf. commentaire du schéma.
        cashSessionId: received > 0 ? session.id : null,
        ...(received >= totalAmount ? { paidAt: new Date() } : {}),
      },
    });

    // Créée même à 0 FCFA (vente 100% à crédit) : c'est elle qui porte le ticket imprimable et
    // la référence pharmacie — sans transaction, InvoiceModal/invoice-pdf.tsx n'ont rien à
    // afficher pour ce cas, justement celui visé par le paiement échelonné.
    const transaction = await prisma.financialTransaction.create({
      data: {
        type: "INCOME",
        category: data.items.some((i) => i.type === "PHARMACY") ? "PHARMACY_SALE" : "SERVICE_FEE",
        amount: received,
        description: summaryDescription,
        items: data.items,
        patientId: data.patientId || null,
        customPatientName: customName,
        customPatientPhone: customPhone,
        recordedById: activeUser.id,
        organizationId: targetOrgId,
        cashSessionId: session.id,
        pendingInvoiceId: pendingInvoice.id,
      },
    });

    await logAuditAction(activeUser.id, "CREATE_CAISSE_SALE", "FinancialTransaction", transaction.id);
    revalidatePath(`/dashboard/clinics/${targetOrgId}/caisse`);
    revalidatePath(`/dashboard/clinics/${targetOrgId}/pharmacie`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return {
      success: true,
      data: {
        transaction,
        pendingInvoice,
        invoiceTotalAmount: totalAmount,
        amountPaid: received,
        remainingDue: Math.max(0, totalAmount - received),
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la validation de la vente.") };
  }
}

// Modifier / ajouter a posteriori le nom et le numéro de téléphone du client sur une vente déjà enregistrée
export async function updateInvoicePatientInfo(data: {
  pendingInvoiceId: string;
  customPatientName?: string;
  customPatientPhone?: string;
}) {
  try {
    updateInvoicePatientInfoSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser.role);

    const pendingInvoice = await prisma.pendingInvoice.findUnique({
      where: { id: data.pendingInvoiceId },
    });
    if (!pendingInvoice) throw new Error("Facture introuvable.");

    const customName = data.customPatientName?.trim() || null;
    const customPhone = data.customPatientPhone?.trim() || null;

    const updatedInvoice = await prisma.pendingInvoice.update({
      where: { id: data.pendingInvoiceId },
      data: {
        customPatientName: customName,
        customPatientPhone: customPhone,
      },
    });

    await prisma.financialTransaction.updateMany({
      where: { pendingInvoiceId: data.pendingInvoiceId },
      data: {
        customPatientName: customName,
        customPatientPhone: customPhone,
      },
    });

    const targetOrgId = pendingInvoice.organizationId;
    if (targetOrgId) {
      revalidatePath(`/dashboard/clinics/${targetOrgId}/caisse`);
      revalidatePath(`/dashboard/clinics/${targetOrgId}/pharmacie`);
    }
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: updatedInvoice };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour des informations client.") };
  }
}

// Remise physique des articles au comptoir pharmacie — PHARMACIST uniquement. Seul endroit du
// nouveau flux où le stock pharmacie est décrémenté. Indépendant de l'état de règlement de la
// facture (PENDING/PARTIAL/PAID) : un patient peut repartir avec ses médicaments avant d'avoir
// tout payé (vente à crédit / paiement échelonné) — seul dispensedAt marque désormais la remise.
// referenceCode : le pharmacien voit le ticket (patient, médicaments, montant) sans jamais voir
// sa référence — elle reste affichée uniquement côté caisse (invoice-modal.tsx). Le patient doit
// la lui donner de vive voix ; elle est vérifiée ici avant toute remise, pour éviter les litiges
// « je vous l'ai déjà donné » / « non, pas à moi ».
export async function dispensePendingInvoice(pendingInvoiceId: string, referenceCode: string) {
  try {
    dispensePendingInvoiceSchema.parse({ pendingInvoiceId, referenceCode });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyDispenseRole(activeUser.role);

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: pendingInvoiceId },
      include: { prescriptions: true },
    });
    if (!pending) throw new Error("Facture introuvable.");
    if (pending.dispensedAt) {
      throw new Error("Les articles de cette facture ont déjà été remis.");
    }

    const expectedCode = String(pending.id).slice(-6).toUpperCase();
    const enteredCode = referenceCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (enteredCode !== expectedCode) {
      throw new Error("Référence incorrecte. Demandez au patient le code exact remis à la caisse.");
    }

    const items = (pending.items as any[]) || [];
    if (!items.some((i) => i.type === "PHARMACY")) {
      throw new Error("Cette facture ne contient aucun médicament à remettre.");
    }

    let lowStockAlerts: any[] = [];
    await prisma.$transaction(
      async (tx) => {
        lowStockAlerts = await decrementStockForItems(tx, items, pending.organizationId);

        await tx.pendingInvoice.update({
          where: { id: pendingInvoiceId },
          data: { dispensedAt: new Date() },
        });

        for (const prescription of pending.prescriptions) {
          await tx.prescription.update({
            where: { id: prescription.id },
            data: { status: "DISPENSED", dispensedById: activeUser.id, dispensedAt: new Date() },
          });
        }
      },
      { timeout: 20000, maxWait: 10000 }
    );

    if (lowStockAlerts.length > 0) {
      const { appEvents } = await import("@/lib/events");
      for (const alert of lowStockAlerts) appEvents.emit("stock.low", alert);
    }

    await logAuditAction(activeUser.id, "DISPENSE_PENDING_INVOICE", "PendingInvoice", pendingInvoiceId);
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    revalidatePath("/dashboard/pharmacie");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la remise des articles.") };
  }
}

export async function getFinanceSummary(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertFinanceReadRole(activeUser.role);

    const targetOrgId = organizationId || activeUser.organizationId;

    let transactions: any[] = [];
    let pharmacyItems: any[] = [];

    if ((prisma as any).financialTransaction && (prisma as any).pharmacyItem) {
      const whereClause: any = {};
      if (activeUser.organization?.type === "HOLDING" && !organizationId) {
        whereClause.OR = [
          { organizationId: activeUser.organizationId },
          { organization: { parentId: activeUser.organizationId } }
        ];
      } else if (targetOrgId) {
        whereClause.organizationId = targetOrgId;
      }

      transactions = await (prisma as any).financialTransaction.findMany({
        where: whereClause,
        include: {
          recordedBy: { select: { firstName: true, lastName: true } },
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          pharmacyItem: { select: { name: true, dosage: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

    // Fetch pharmacy items directly via raw MongoDB command to return all custom fields
    const pFilter: any = {};
    if (targetOrgId) pFilter.organizationId = { "$oid": targetOrgId };

    // batchSize explicite — même correctif que getPharmacyItems ci-dessus : sans lui, MongoDB
    // plafonne le premier lot à 101 documents et le reste du catalogue disparaît silencieusement
    // (impacte ici le compte d'alertes de stock faible).
    const itemsRes: any = await prisma.$runCommandRaw({
      find: "PharmacyItem",
      filter: pFilter,
      sort: { name: 1 },
      batchSize: 10000,
    });
    pharmacyItems = (itemsRes.cursor?.firstBatch || []).map(formatMongoDoc);

      // Populate user names if available
      const users = await prisma.user.findMany({
        select: { id: true, firstName: true, lastName: true }
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      transactions = transactions.map(t => ({
        ...t,
        recordedBy: t.recordedById ? userMap.get(t.recordedById) : null
      }));
    }

    let totalIncome = 0;
    let totalExpenses = 0;
    let todayIncome = 0;
    let todayExpenses = 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      const createdAt = t.createdAt ? new Date(t.createdAt) : new Date();

      if (t.type === "INCOME") {
        totalIncome += amt;
        if (createdAt >= startOfToday) {
          todayIncome += amt;
        }
      } else if (t.type === "EXPENSE") {
        totalExpenses += amt;
        if (createdAt >= startOfToday) {
          todayExpenses += amt;
        }
      }
    }

    // Le solde de caisse = somme, pour chaque session actuellement OUVERTE, de son propre fond de
    // départ + ses propres encaissements/dépenses (même calcul que expectedAmount dans
    // registers.ts:getSessionSummary/listCashSessions). Une session FERMÉE ne contribue plus rien
    // ici, quel que soit le sort réel de son argent : soit il a été déposé ailleurs (à raison
    // exclu), soit il est resté dans le tiroir et sera redéclaré comme fond d'ouverture de la
    // session suivante — auquel cas il redevient comptabilisé, une seule fois, à cette occasion.
    // Sommer plutôt le fond de TOUTES les sessions ouvertes avec les encaissements de TOUT LE
    // TEMPS (ancienne méthode) comptait deux fois l'argent d'une caisse recyclée d'un caissier à
    // l'autre sans passage au coffre entre les deux : le fond redéclaré par le second caissier
    // s'ajoutait à un total qui incluait déjà les ventes du premier ayant produit cet argent.
    const sessionWhere: any = { status: "OPEN" };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      sessionWhere.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else if (targetOrgId) {
      sessionWhere.organizationId = targetOrgId;
    }
    const openSessions = await prisma.cashSession.findMany({
      where: sessionWhere,
      include: { transactions: { select: { type: true, amount: true } } },
    });
    const cashBalance = openSessions.reduce((sum, s) => {
      let sessionIncome = 0;
      let sessionExpenses = 0;
      for (const t of s.transactions) {
        if (t.type === "INCOME") sessionIncome += t.amount;
        else if (t.type === "EXPENSE") sessionExpenses += t.amount;
      }
      return sum + (s.openingFloat || 0) + sessionIncome - sessionExpenses;
    }, 0);
    const lowStockCount = pharmacyItems.filter((item: any) => Number(item.stockQuantity || 0) <= Number(item.reorderLevel || 10)).length;

    return {
      success: true,
      data: {
        totalIncome,
        totalExpenses,
        cashBalance,
        todayIncome,
        todayExpenses,
        lowStockCount,
        transactions,
        pharmacyItems
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du calcul du bilan financier." };
  }
}

// Journal de caisse détaillé et filtrable (page Finance) — distinct de getFinanceSummary : celui-ci
// sert le tableau de bord (KPI + aperçu, plafonné à 500 lignes), celui-ci sert la consultation
// exhaustive de l'historique (recherche, filtres combinés, pagination côté serveur) pour ne
// jamais masquer de mouvements au-delà d'un plafond. Les totaux filtrés sont calculés par
// agrégation Prisma sur l'ensemble filtré complet, pas seulement la page affichée.
export async function listFinancialTransactions(filters: {
  organizationId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: "INCOME" | "EXPENSE";
  category?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertFinanceReadRole(activeUser.role);

    const page = Math.max(1, Math.floor(filters.page || 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(filters.pageSize || 50)));

    // Toutes les conditions SAUF le type — réutilisées telles quelles pour calculer les totaux
    // encaissé/dépensé indépendamment du filtre de type actif (voir plus bas).
    const baseAnd: any[] = [];

    if (activeUser.organization?.type === "HOLDING" && !filters.organizationId) {
      baseAnd.push({
        OR: [
          { organizationId: activeUser.organizationId },
          { organization: { parentId: activeUser.organizationId } },
        ],
      });
    } else {
      const targetOrgId = filters.organizationId || activeUser.organizationId;
      if (targetOrgId) baseAnd.push({ organizationId: targetOrgId });
    }

    if (filters.dateFrom) {
      const start = new Date(filters.dateFrom);
      start.setHours(0, 0, 0, 0);
      baseAnd.push({ createdAt: { gte: start } });
    }
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      baseAnd.push({ createdAt: { lte: end } });
    }
    if (filters.category && filters.category !== "ALL") {
      baseAnd.push({ category: filters.category });
    }
    if (filters.minAmount != null && !Number.isNaN(Number(filters.minAmount))) {
      baseAnd.push({ amount: { gte: Number(filters.minAmount) } });
    }
    if (filters.maxAmount != null && !Number.isNaN(Number(filters.maxAmount))) {
      baseAnd.push({ amount: { lte: Number(filters.maxAmount) } });
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      baseAnd.push({
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          {
            patient: {
              user: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
          {
            recordedBy: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        ],
      });
    }

    const listWhere = filters.type ? { AND: [...baseAnd, { type: filters.type }] } : { AND: baseAnd };

    const [transactions, totalCount, incomeAgg, expenseAgg] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: listWhere,
        include: {
          recordedBy: { select: { firstName: true, lastName: true } },
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          pharmacyItem: { select: { name: true, dosage: true } },
          // Pour le badge "Partiel/Non payé" du journal : une transaction dont la facture liée
          // n'est pas encore PAID correspond à un règlement partiel/échelonné.
          pendingInvoice: { select: { status: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.financialTransaction.count({ where: listWhere }),
      prisma.financialTransaction.aggregate({
        where: { AND: [...baseAnd, { type: "INCOME" }] },
        _sum: { amount: true },
      }),
      prisma.financialTransaction.aggregate({
        where: { AND: [...baseAnd, { type: "EXPENSE" }] },
        _sum: { amount: true },
      }),
    ]);

    return {
      success: true,
      data: {
        transactions,
        totalCount,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        filteredIncome: incomeAgg._sum.amount || 0,
        filteredExpenses: expenseAgg._sum.amount || 0,
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement du journal de caisse.") };
  }
}

// Complète chaque facture avec le montant déjà réglé à date (somme des FinancialTransaction
// qui la référencent) — nécessaire depuis le paiement échelonné pour afficher un badge
// "Payé/Partiel — reste X FCFA/Non payé" là où le statut seul ne suffit plus.
async function attachAmountPaid<T extends { id: string }>(invoices: T[]): Promise<Array<T & { amountPaid: number }>> {
  if (invoices.length === 0) return [];
  const payments = await prisma.financialTransaction.findMany({
    where: { pendingInvoiceId: { in: invoices.map((inv) => inv.id) } },
    select: { pendingInvoiceId: true, amount: true },
  });
  const paidMap = new Map<string, number>();
  for (const p of payments) {
    if (!p.pendingInvoiceId) continue;
    paidMap.set(p.pendingInvoiceId, (paidMap.get(p.pendingInvoiceId) || 0) + p.amount);
  }
  return invoices.map((inv) => ({ ...inv, amountPaid: paidMap.get(inv.id) || 0 }));
}

// File d'attente du comptoir pharmacie : factures contenant au moins un médicament, pas encore
// remises (dispensedAt null) — quel que soit leur état de règlement (PENDING/PARTIAL/PAID),
// puisqu'un patient peut désormais repartir avec ses médicaments avant d'avoir tout payé.
// Filtrage en mémoire après lecture (un champ Json ne se filtre pas nativement côté Mongo/
// Prisma sur son contenu) — le volume de factures en attente de remise reste faible.
export async function listPharmacyDispenseQueue(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyCatalogReadRole(activeUser.role);

    // Un champ optionnel jamais explicitement écrit à sa création (le cas de dispensedAt pour
    // toute facture créée avant cette remise) reste ABSENT du document Mongo plutôt que null —
    // et { dispensedAt: null } seul ne matche QUE les documents où le champ vaut littéralement
    // null, pas ceux où il est simplement absent (confirmé : { $ne: ["$dispensedAt","$$REMOVE"] }
    // dans la requête générée). isSet: false couvre ce cas, la comparaison à null couvre les
    // documents futurs où il serait explicitement mis à null.
    const notDispensed = { OR: [{ dispensedAt: null }, { dispensedAt: { isSet: false } }] };
    const where: any = { AND: [notDispensed] };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      where.AND.push({
        OR: [
          { organizationId: activeUser.organizationId },
          { organization: { parentId: activeUser.organizationId } },
        ],
      });
    } else {
      const targetOrgId = organizationId || activeUser.organizationId;
      if (targetOrgId) where.AND.push({ organizationId: targetOrgId });
    }

    const invoices = await prisma.pendingInvoice.findMany({
      where,
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      // paidAt peut désormais être null (facture non/partiellement réglée) — createdAt reste
      // toujours renseigné, ordre "plus ancien ticket en attente d'abord" plus fiable.
      orderBy: { createdAt: "desc" },
    });

    const queue = await attachAmountPaid(
      invoices.filter((inv) => Array.isArray(inv.items) && (inv.items as any[]).some((i) => i.type === "PHARMACY"))
    );

    return { success: true, data: queue };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement de la file d'attente pharmacie." };
  }
}

// Historique des remises effectuées (dispensedAt renseigné) — traçabilité pour le comptoir
// pharmacie, distinct de la file d'attente (pas encore remis). L'état de règlement (badge
// Payé/Partiel/Non payé) reste affiché même après remise pour signaler un solde toujours dû.
export async function listPharmacyDispenseHistory(organizationId?: string, options?: { search?: string; take?: number }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyCatalogReadRole(activeUser.role);

    const where: any = { dispensedAt: { not: null } };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      where.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else {
      const targetOrgId = organizationId || activeUser.organizationId;
      if (targetOrgId) where.organizationId = targetOrgId;
    }

    const invoices = await prisma.pendingInvoice.findMany({
      where,
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { dispensedAt: "desc" },
      take: options?.take || 200,
    });

    let history = await attachAmountPaid(
      invoices.filter((inv) => Array.isArray(inv.items) && (inv.items as any[]).some((i) => i.type === "PHARMACY"))
    );

    const search = options?.search?.trim().toLowerCase();
    if (search) {
      history = history.filter((inv) => {
        const ref = String(inv.id).slice(-6).toLowerCase();
        const name = inv.patient?.user ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}`.toLowerCase() : "";
        return ref.includes(search) || name.includes(search);
      });
    }

    return { success: true, data: history };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement de l'historique." };
  }
}

// Créées automatiquement à la clôture d'une consultation, d'une demande labo, un envoi
// d'ordonnance, ou directement à la caisse — pas encore intégralement réglées (PENDING ou
// PARTIAL) — cf. onglet "Tickets impayés" de src/app/dashboard/caisse. Rôle de lecture aligné
// sur REGISTER_READ_ROLES (pas seulement CAISSE_READ_ROLES) : un PHARMACIST qui opère déjà la
// caisse comme un caissier temporaire doit pouvoir voir cet onglet sur la même page.
export async function listPendingInvoices(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterReadRole(activeUser.role);

    const where: any = { status: { in: ["PENDING", "PARTIAL"] } };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      where.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else {
      const targetOrgId = organizationId || activeUser.organizationId;
      if (targetOrgId) where.organizationId = targetOrgId;
    }

    const invoices = await prisma.pendingInvoice.findMany({
      where,
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
        medicalRecord: { select: { title: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: await attachAmountPaid(invoices) };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement des factures en attente." };
  }
}

// Historique complet des tickets de caisse de la clinique (tous statuts : PENDING, PARTIAL, PAID, CANCELLED)
export async function listCaisseHistoryInvoices(organizationId?: string, take: number = 200) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterReadRole(activeUser.role);

    const where: any = {};
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      where.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else {
      const targetOrgId = organizationId || activeUser.organizationId;
      if (targetOrgId) where.organizationId = targetOrgId;
    }

    const invoices = await prisma.pendingInvoice.findMany({
      where,
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
        medicalRecord: { select: { title: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return { success: true, data: await attachAmountPaid(invoices) };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement de l'historique des tickets." };
  }
}
