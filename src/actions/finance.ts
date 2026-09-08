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
  changeInvoiceStatusSchema,
  deletePendingInvoiceSchema,
} from "@/validators/finance";
import { consumeStockLots, assertStockWrite, getItemUnitCostMap } from "@/actions/stock";
import { assertRegisterOperateRole, assertRegisterReadRole } from "@/actions/register-permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  items: Array<{ type: "PHARMACY" | "SERVICE" | "LAB"; pharmacyItemId?: string; description: string; quantity: number }>,
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

// Reporte dispensedQuantity des anciennes lignes vers les nouvelles quand le panier est encore
// modifiable (premier règlement d'une facture PENDING, cf. payPendingInvoice) — sans ça, un
// caissier qui édite le panier d'un ticket déjà partiellement remis en pharmacie écraserait
// silencieusement la trace de ce qui a déjà été physiquement donné, exposant le pharmacien à
// re-décrémenter du stock déjà remis. Rapprochement par pharmacyItemId, repli sur description
// pour les lignes sans produit catalogué (SERVICE/LAB).
function reconcileItemsWithPriorDispense(oldItems: any[], newItems: any[]): any[] {
  const keyOf = (it: any) => it.pharmacyItemId || it.description;
  const oldByKey = new Map<string, any>();
  for (const it of oldItems) {
    if (it.type === "PHARMACY" && Number(it.dispensedQuantity) > 0) {
      oldByKey.set(keyOf(it), it);
    }
  }
  const newKeys = new Set(newItems.map(keyOf));
  for (const [key, oldItem] of oldByKey) {
    if (!newKeys.has(key)) {
      throw new Error(`"${oldItem.description}" a déjà été remis au patient ; il ne peut pas être retiré de la facture.`);
    }
  }
  return newItems.map((it) => {
    const old = oldByKey.get(keyOf(it));
    if (!old) return it;
    if (Number(it.quantity) < Number(old.dispensedQuantity)) {
      throw new Error(
        `"${it.description}" a déjà été remis (${old.dispensedQuantity}x) — la quantité ne peut pas descendre en dessous de ${old.dispensedQuantity}.`
      );
    }
    return { ...it, dispensedQuantity: old.dispensedQuantity };
  });
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
    type: "PHARMACY" | "SERVICE" | "LAB";
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
    if (!pending || pending.status === "PAID" || pending.status === "CANCELLED") {
      throw new Error("Cette facture en attente n'existe plus, a déjà été intégralement réglée, ou a été clôturée.");
    }
    if (!session || session.status !== "OPEN") {
      throw new Error("Aucune session de caisse ouverte. Ouvrez la caisse avant d'encaisser.");
    }

    payPendingInvoiceSchema.parse({ pendingInvoiceId, cashSessionId, amount, items });

    // Le panier n'est modifiable (remplace pending.items) que sur le tout premier règlement,
    // tant que rien n'a encore été perçu — dès qu'un acompte existe (PARTIAL), il est verrouillé
    // pour ne pas fausser rétroactivement ce qui a déjà été encaissé dessus. Reconcilié avec
    // dispensedQuantity (cf. reconcileItemsWithPriorDispense) pour ne jamais perdre la trace
    // d'une remise partielle déjà effectuée en pharmacie.
    const currentItems: any[] =
      pending.status === "PENDING" && items
        ? reconcileItemsWithPriorDispense((pending.items as any[]) || [], items)
        : ((pending.items as any[]) || []);
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
        category: currentItems.some((i) => i.type === "PHARMACY")
          ? "PHARMACY_SALE"
          : currentItems.some((i) => i.type === "LAB")
          ? "LAB_EXAM_FEE"
          : "SERVICE_FEE",
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

    // Une demande d'analyse labo liée n'a plus de statut de règlement propre à synchroniser :
    // PendingInvoice.status (PENDING/PARTIAL/PAID) est déjà la seule source de vérité affichée
    // (cf. LabOrder.pendingInvoice dans ORDER_INCLUDE) — vente à crédit possible comme en
    // pharmacie, aucun déblocage à faire ici.

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
    type: "PHARMACY" | "SERVICE" | "LAB";
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
        category: data.items.some((i) => i.type === "PHARMACY")
          ? "PHARMACY_SALE"
          : data.items.some((i) => i.type === "LAB")
          ? "LAB_EXAM_FEE"
          : "SERVICE_FEE",
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
// facture (PENDING/PARTIAL/PAID) : un patient peut repartir avec une partie de ses médicaments
// avant d'avoir tout payé (vente à crédit / paiement échelonné).
//
// Remise PARTIELLE, ligne par ligne et par quantité : `lines` ne porte que la quantité remise
// LORS DE CET APPEL (pas cumulée) pour chaque ligne PHARMACY du panier, repérée par son index
// dans PendingInvoice.items[] (identité stable, ce tableau n'est jamais réordonné). Le reste
// (quantité commandée moins déjà remis) n'est simplement jamais décrémenté du stock tant qu'il
// n'a pas fait l'objet d'un appel dédié — rien à "retourner" si le patient ne revient jamais,
// puisque ce reste n'a jamais quitté le stock. `dispensedAt` n'est posé que lorsque TOUTES les
// lignes PHARMACY sont intégralement remises ET que les consommables labo (s'il y en a) sont
// réglés — jamais sur une étape partielle. Les consommables labo restent tout-ou-rien
// (cf. labConsumablesDispensedAt) : un examen se réalise en une fois, indépendamment de combien
// de médicaments ont déjà été remis ce jour-là.
//
// referenceCode : le pharmacien voit le ticket (patient, médicaments, montant) sans jamais voir
// sa référence — elle reste affichée uniquement côté caisse (invoice-modal.tsx). Le patient doit
// la lui donner de vive voix ; elle est vérifiée à chaque appel (y compris une remise partielle
// suivante), pour éviter les litiges « je vous l'ai déjà donné » / « non, pas à moi ».
export async function dispensePendingInvoice(
  pendingInvoiceId: string,
  referenceCode: string,
  lines: Array<{ index: number; quantity: number }> = []
) {
  try {
    dispensePendingInvoiceSchema.parse({ pendingInvoiceId, referenceCode, lines });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyDispenseRole(activeUser.role);

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: pendingInvoiceId },
      include: { prescriptions: true, labOrders: { select: { id: true, testDetails: true } } },
    });
    if (!pending) throw new Error("Facture introuvable.");
    if (pending.dispensedAt) {
      throw new Error("Les articles de cette facture ont déjà été remis.");
    }
    if (pending.status === "CANCELLED") {
      throw new Error("Ce ticket a été clôturé côté caisse ; plus rien à remettre.");
    }

    const expectedCode = String(pending.id).slice(-6).toUpperCase();
    const enteredCode = referenceCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (enteredCode !== expectedCode) {
      throw new Error("Référence incorrecte. Demandez au patient le code exact remis à la caisse.");
    }

    // Consommables des examens labo liés (cf. lab.ts:createLabOrder — testDetails fige la
    // recette au moment de la commande) — toujours tout-ou-rien, cf. commentaire de fonction.
    const labConsumableItems = (pending.labOrders || []).flatMap((lo) =>
      ((lo.testDetails as any[]) || []).flatMap((td) =>
        (td.consumables || []).map((c: any) => ({
          type: "PHARMACY" as const,
          pharmacyItemId: c.pharmacyItemId,
          description: c.name,
          quantity: Number(c.quantity) || 0,
        }))
      )
    );
    const hasLabConsumables = labConsumableItems.length > 0;
    const cartHasPharmacyLines = ((pending.items as any[]) || []).some((i) => i.type === "PHARMACY");
    if (!cartHasPharmacyLines && !hasLabConsumables) {
      throw new Error("Cette facture ne contient aucun médicament à remettre.");
    }

    let lowStockAlerts: any[] = [];
    let fullyDispensedNow = false;
    await prisma.$transaction(
      async (tx) => {
        // Relecture fraîche des champs modifiés par une éventuelle remise concurrente sur le
        // même ticket (autre onglet, autre poste), pour ne jamais écraser un progrès déjà
        // enregistré entre la lecture ci-dessus et l'ouverture de cette transaction.
        const fresh = await tx.pendingInvoice.findUnique({
          where: { id: pendingInvoiceId },
          select: { items: true, dispensedAt: true, labConsumablesDispensedAt: true, status: true },
        });
        if (!fresh) throw new Error("Facture introuvable.");
        if (fresh.dispensedAt) throw new Error("Les articles de cette facture ont déjà été remis.");
        if (fresh.status === "CANCELLED") throw new Error("Ce ticket a été clôturé côté caisse ; plus rien à remettre.");

        const freshItems: any[] = (fresh.items as any[]) || [];
        const itemsToDecrement: Array<{ type: "PHARMACY"; pharmacyItemId?: string; description: string; quantity: number }> = [];

        for (const line of lines) {
          const item = freshItems[line.index];
          if (!item || item.type !== "PHARMACY") {
            throw new Error(`Ligne invalide (index ${line.index}).`);
          }
          if (line.quantity <= 0) continue; // no-op toléré (idempotent sur un double envoi à 0)
          const already = Number(item.dispensedQuantity) || 0;
          const remaining = Number(item.quantity) - already;
          if (line.quantity > remaining) {
            throw new Error(
              `"${item.description}" : quantité demandée (${line.quantity}) supérieure au reste disponible (${remaining}).`
            );
          }
          item.dispensedQuantity = already + line.quantity;
          itemsToDecrement.push({
            type: "PHARMACY",
            pharmacyItemId: item.pharmacyItemId,
            description: item.description,
            quantity: line.quantity,
          });
        }

        const doLabNow = hasLabConsumables && !fresh.labConsumablesDispensedAt;
        if (doLabNow) itemsToDecrement.push(...labConsumableItems);

        if (itemsToDecrement.length === 0) {
          throw new Error("Rien à remettre pour cette action.");
        }

        lowStockAlerts = await decrementStockForItems(tx, itemsToDecrement, pending.organizationId);

        const allCartLinesComplete = freshItems
          .filter((it) => it.type === "PHARMACY")
          .every((it) => (Number(it.dispensedQuantity) || 0) >= Number(it.quantity));
        const labSettled = !hasLabConsumables || !!fresh.labConsumablesDispensedAt || doLabNow;
        fullyDispensedNow = allCartLinesComplete && labSettled;

        await tx.pendingInvoice.update({
          where: { id: pendingInvoiceId },
          data: {
            items: freshItems,
            ...(doLabNow ? { labConsumablesDispensedAt: new Date() } : {}),
            ...(fullyDispensedNow ? { dispensedAt: new Date() } : {}),
          },
        });

        // Marqué DISPENSED uniquement une fois la remise intégralement terminée — le poser sur
        // une étape partielle serait trompeur pour tout ce qui lit ce statut par ailleurs.
        if (fullyDispensedNow) {
          for (const prescription of pending.prescriptions) {
            await tx.prescription.update({
              where: { id: prescription.id },
              data: { status: "DISPENSED", dispensedById: activeUser.id, dispensedAt: new Date() },
            });
          }
        }
      },
      { timeout: 20000, maxWait: 10000 }
    );

    if (lowStockAlerts.length > 0) {
      const { appEvents } = await import("@/lib/events");
      for (const alert of lowStockAlerts) appEvents.emit("stock.low", alert);
    }

    await logAuditAction(activeUser.id, "DISPENSE_PENDING_INVOICE", "PendingInvoice", pendingInvoiceId, { lines, fullyDispensedNow });
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    revalidatePath("/dashboard/pharmacie");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { fullyDispensedNow } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la remise des articles.") };
  }
}

// Clôture un ticket à crédit/acompte dont on sait qu'il ne sera jamais réglé intégralement —
// déclenchée depuis la Caisse (onglet "Tickets impayés"), jamais depuis la pharmacie. N'exige
// aucune saisie de quantité : ce qui a déjà été remis est déjà connu via
// items[].dispensedQuantity, alimenté par les remises partielles précédentes
// (cf. dispensePendingInvoice). Un seul document modifié, aucun accès à
// PharmacyItem/StockPurchase/StockAdjustment : la partie jamais remise n'a, par construction,
// jamais quitté le stock — il n'y a donc rien à réintégrer. Aucune nouvelle écriture financière
// non plus : les règlements déjà perçus (payments) restent acquis tels quels.
export async function closeUnpaidInvoice(pendingInvoiceId: string) {
  try {
    z.string().min(1).parse(pendingInvoiceId);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser.role);

    const pending = await prisma.pendingInvoice.findUnique({ where: { id: pendingInvoiceId } });
    if (!pending) throw new Error("Facture introuvable.");
    if (!["PENDING", "PARTIAL"].includes(pending.status)) {
      throw new Error("Cette facture est déjà réglée intégralement ou déjà clôturée.");
    }

    const updated = await prisma.pendingInvoice.update({
      where: { id: pendingInvoiceId },
      data: { status: "CANCELLED", closedAt: new Date(), closedById: activeUser.id },
    });

    await logAuditAction(activeUser.id, "CLOSE_UNPAID_INVOICE", "PendingInvoice", pendingInvoiceId);
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/caisse`);
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la clôture du ticket.") };
  }
}

// Modification exceptionnelle de statut d'un ticket (ex: rectification d'une erreur de saisie) —
// réservée au COORDINATOR et aux ADMIN. Si le statut passe à PENDING (ou si l'option d'annulation des
// paiements est activée), tous les règlements associés à ce ticket sont supprimés pour déduire
// le montant du solde de caisse.
export async function changeInvoiceStatus(data: {
  pendingInvoiceId: string;
  newStatus: "PENDING" | "PARTIAL" | "PAID" | "CANCELLED";
  withdrawPayments?: boolean;
  reason?: string;
}) {
  try {
    changeInvoiceStatusSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const allowedRoles = ["COORDINATOR", "ADMIN", "SUPER_ADMIN"];
    if (!allowedRoles.includes(activeUser.role)) {
      throw new Error("Non autorisé. Seul le coordonnateur ou un administrateur peut modifier le statut d'un ticket.");
    }

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: data.pendingInvoiceId },
      include: { payments: true },
    });
    if (!pending) throw new Error("Facture introuvable.");

    const oldStatus = pending.status;
    const shouldWithdraw = data.withdrawPayments ?? (data.newStatus === "PENDING");

    await prisma.$transaction(async (tx) => {
      if (shouldWithdraw) {
        await tx.financialTransaction.deleteMany({
          where: { pendingInvoiceId: data.pendingInvoiceId },
        });
      }

      const updateData: any = {
        status: data.newStatus,
      };

      if (data.newStatus === "PENDING") {
        updateData.paidAt = null;
        updateData.cashSessionId = null;
      } else if (data.newStatus === "PAID") {
        updateData.paidAt = new Date();
      } else if (data.newStatus === "CANCELLED") {
        updateData.closedAt = new Date();
        updateData.closedById = activeUser.id;
      }

      await tx.pendingInvoice.update({
        where: { id: data.pendingInvoiceId },
        data: updateData,
      });
    });

    await logAuditAction(activeUser.id, "CHANGE_INVOICE_STATUS", "PendingInvoice", data.pendingInvoiceId, {
      oldStatus,
      newStatus: data.newStatus,
      withdrawPayments: shouldWithdraw,
      reason: data.reason || null,
    });

    revalidatePath(`/dashboard/clinics/${pending.organizationId}/caisse`);
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard/lab");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la modification du statut du ticket.") };
  }
}

// Suppression temporaire exceptionnelle d'un ticket de caisse —
// réservée au COORDINATOR et aux ADMIN.
// Tous les règlements et liens associés (ordonnances, labo) sont nettoyés pour maintenir la cohérence.
export async function deletePendingInvoice(data: {
  pendingInvoiceId: string;
  reason?: string;
}) {
  try {
    deletePendingInvoiceSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const allowedRoles = ["COORDINATOR", "ADMIN", "SUPER_ADMIN"];
    if (!allowedRoles.includes(activeUser.role)) {
      throw new Error("Non autorisé. Seul le coordonnateur ou un administrateur peut supprimer un ticket.");
    }

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: data.pendingInvoiceId },
    });
    if (!pending) throw new Error("Facture introuvable.");

    await prisma.$transaction(async (tx) => {
      // 1. Supprimer les paiements en caisse associés (pour retirer les montants du solde de caisse)
      await tx.financialTransaction.deleteMany({
        where: { pendingInvoiceId: data.pendingInvoiceId },
      });

      // 2. Déconnecter les ordonnances rattachées
      await tx.prescription.updateMany({
        where: { pendingInvoiceId: data.pendingInvoiceId },
        data: { pendingInvoiceId: null },
      });

      // 3. Déconnecter les demandes d'examens labo rattachées
      await tx.labOrder.updateMany({
        where: { pendingInvoiceId: data.pendingInvoiceId },
        data: { pendingInvoiceId: null },
      });

      // 4. Supprimer le PendingInvoice
      await tx.pendingInvoice.delete({
        where: { id: data.pendingInvoiceId },
      });
    });

    await logAuditAction(activeUser.id, "DELETE_PENDING_INVOICE", "PendingInvoice", data.pendingInvoiceId, {
      deletedInvoiceId: data.pendingInvoiceId,
      reason: data.reason || null,
    });

    if (pending.organizationId) {
      revalidatePath(`/dashboard/clinics/${pending.organizationId}/caisse`);
      revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    }
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard/lab");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la suppression du ticket.") };
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
    // Même périmètre, pour retrouver le dernier montant compté des caisses actuellement SANS
    // session ouverte (cf. calcul de cashBalance plus bas — évite qu'une caisse tombe à 0 F entre
    // la clôture d'une session et l'ouverture de la suivante, alors que l'argent compté est
    // toujours physiquement dans le tiroir).
    const closedSessionWhere: any = { status: "CLOSED" };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      closedSessionWhere.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else if (targetOrgId) {
      closedSessionWhere.organizationId = targetOrgId;
    }
    // Répartition du CA par catégorie — calculée par agrégation sur l'ENSEMBLE des transactions
    // INCOME (via groupBy), jamais depuis `transactions` ci-dessus : ce tableau est plafonné à
    // 500 lignes pour l'aperçu du tableau de bord, une clinique dépassant ce volume aurait sinon
    // une répartition tronquée et fausse.
    const categoryWhere: any = { type: "INCOME" };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      categoryWhere.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else if (targetOrgId) {
      categoryWhere.organizationId = targetOrgId;
    }

    // Périmètre org/holding identique à categoryWhere/sessionWhere, réutilisé pour chiffrer le
    // coût des examens labo (LabOrder n'a pas de champ montant agrégeable : le coût de chaque
    // commande se calcule en JS depuis son testDetails figé, cf. plus bas).
    const labOrderWhere: any = {};
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      labOrderWhere.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else if (targetOrgId) {
      labOrderWhere.organizationId = targetOrgId;
    }

    // Même périmètre, pour le coût "Médicament" de la marge simple (cf. Promise.all plus bas) :
    // basé sur les lots StockPurchase eux-mêmes plutôt que sur les seules FinancialTransaction
    // PHARMACY_PURCHASE, pour inclure aussi les produits amorcés via import CSV avec un prix
    // d'achat (importPharmacyItems crée un lot valorisé mais volontairement aucune dépense, cf.
    // ce fichier) — sinon un catalogue démarré par import CSV affichait toujours une marge à 100%
    // sur le médicament, quel que soit le prix d'achat réellement saisi. Exclut les lots créés
    // par un ajustement de surplus d'inventaire (batchNumber "AJUSTEMENT-INVENTAIRE") : un
    // surplus retrouvé ne coûte rien de nouveau, ce n'est pas un achat.
    const stockPurchaseWhere: any = { batchNumber: { not: "AJUSTEMENT-INVENTAIRE" } };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      stockPurchaseWhere.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else if (targetOrgId) {
      stockPurchaseWhere.organizationId = targetOrgId;
    }

    const [openSessions, lastClosedSessions, categoryAllTime, categoryToday, pharmacyPurchaseAllTime, pharmacyPurchaseToday, labOrdersForCost, pharmacySaleTransactions] = await Promise.all([
      prisma.cashSession.findMany({
        where: sessionWhere,
        include: { transactions: { select: { type: true, amount: true } } },
      }),
      prisma.cashSession.findMany({
        where: closedSessionWhere,
        orderBy: { closedAt: "desc" },
        select: { registerId: true, countedAmount: true },
      }),
      prisma.financialTransaction.groupBy({
        by: ["category"],
        where: categoryWhere,
        _sum: { amount: true },
      }),
      prisma.financialTransaction.groupBy({
        by: ["category"],
        where: { ...categoryWhere, createdAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      // Marge simple (approximative) côté Médicament : achats de stock sur la période plutôt que
      // le coût exact des seules unités vendues — cf. décision produit, cohérent avec le fait que
      // l'app ne relie aujourd'hui aucun lot d'achat précis à une vente donnée.
      prisma.stockPurchase.aggregate({
        where: stockPurchaseWhere,
        _sum: { totalCost: true },
      }),
      prisma.stockPurchase.aggregate({
        where: { ...stockPurchaseWhere, createdAt: { gte: startOfToday } },
        _sum: { totalCost: true },
      }),
      prisma.labOrder.findMany({ where: labOrderWhere, select: { testDetails: true, createdAt: true } }),
      // Bénéfice sur les ventes déjà réalisées (par opposition à la marge simple ci-dessus, basée
      // sur les achats de LA PÉRIODE) : quantités effectivement vendues, uncapped comme
      // labOrdersForCost — jamais depuis `transactions` (plafonné à 500 lignes).
      prisma.financialTransaction.findMany({
        where: { ...categoryWhere, category: "PHARMACY_SALE" },
        select: { items: true, createdAt: true },
      }),
    ]);

    // Marge simple côté Examens : coût propre de chaque test (LabTest.baseCost, figé sur
    // testDetails à la commande) + coût actuel moyen (FEFO) des consommables réellement listés
    // dans la recette de chaque examen commandé sur la période — pas de catégorie de dépense
    // "achat labo" dédiée (les consommables partagent le même stock/circuit d'achat que la
    // pharmacie), donc reconstitué ici depuis testDetails plutôt que depuis FinancialTransaction.
    const consumablePharmacyItemIds = new Set<string>();
    for (const order of labOrdersForCost) {
      for (const td of (order.testDetails as any[]) || []) {
        for (const c of td.consumables || []) {
          if (c.pharmacyItemId) consumablePharmacyItemIds.add(c.pharmacyItemId);
        }
      }
    }
    const consumableUnitCosts = await getItemUnitCostMap([...consumablePharmacyItemIds]);

    let labCostAllTime = 0;
    let labCostToday = 0;
    for (const order of labOrdersForCost) {
      let orderCost = 0;
      for (const td of (order.testDetails as any[]) || []) {
        orderCost += Number(td.baseCost || 0);
        for (const c of td.consumables || []) {
          orderCost += (consumableUnitCosts.get(c.pharmacyItemId) || 0) * Number(c.quantity || 0);
        }
      }
      labCostAllTime += orderCost;
      if (order.createdAt && new Date(order.createdAt) >= startOfToday) labCostToday += orderCost;
    }

    // Coût des ventes Médicament déjà réalisées : quantités PHARMACY effectivement vendues sur la
    // période × coût unitaire moyen ACTUEL des lots restants (même méthode d'estimation que pour
    // les consommables labo ci-dessus — pas le coût historique exact du lot réellement consommé
    // à la vente, cf. consumeStockLots). Limite connue : un produit totalement épuisé depuis
    // n'a plus de lot restant pour estimer son coût, et compte alors pour 0 ici plutôt que de
    // fausser le total avec un coût obsolète.
    const soldQtyAllTime = new Map<string, number>();
    const soldQtyToday = new Map<string, number>();
    for (const tx of pharmacySaleTransactions) {
      const isToday = tx.createdAt && new Date(tx.createdAt) >= startOfToday;
      for (const it of (tx.items as any[]) || []) {
        if (it.type !== "PHARMACY" || !it.pharmacyItemId) continue;
        const qty = Number(it.quantity) || 0;
        soldQtyAllTime.set(it.pharmacyItemId, (soldQtyAllTime.get(it.pharmacyItemId) || 0) + qty);
        if (isToday) soldQtyToday.set(it.pharmacyItemId, (soldQtyToday.get(it.pharmacyItemId) || 0) + qty);
      }
    }
    const soldUnitCosts = await getItemUnitCostMap([...soldQtyAllTime.keys()]);
    let soldCogsAllTime = 0;
    for (const [itemId, qty] of soldQtyAllTime) soldCogsAllTime += qty * (soldUnitCosts.get(itemId) || 0);
    let soldCogsToday = 0;
    for (const [itemId, qty] of soldQtyToday) soldCogsToday += qty * (soldUnitCosts.get(itemId) || 0);
    // Caisses avec une session ouverte : solde théorique vivant (fond + encaissements - dépenses
    // de CETTE session). Caisses sans session ouverte en ce moment (entre une clôture et la
    // réouverture suivante) : on retient le dernier montant compté à la clôture précédente plutôt
    // que 0 — cet argent est encore physiquement dans le tiroir, seulement pas encore redéclaré
    // comme fond d'ouverture d'une nouvelle session. Chaque caisse ne contribue jamais deux fois :
    // soit via sa session ouverte, soit via son dernier comptage, jamais les deux.
    const openRegisterIds = new Set(openSessions.map((s) => s.registerId));
    const lastClosedBalanceByRegister = new Map<string, number>();
    for (const s of lastClosedSessions) {
      if (openRegisterIds.has(s.registerId) || lastClosedBalanceByRegister.has(s.registerId)) continue;
      lastClosedBalanceByRegister.set(s.registerId, s.countedAmount ?? 0);
    }

    const openBalance = openSessions.reduce((sum, s) => {
      let sessionIncome = 0;
      let sessionExpenses = 0;
      for (const t of s.transactions) {
        if (t.type === "INCOME") sessionIncome += t.amount;
        else if (t.type === "EXPENSE") sessionExpenses += t.amount;
      }
      return sum + (s.openingFloat || 0) + sessionIncome - sessionExpenses;
    }, 0);
    const closedCarryoverBalance = [...lastClosedBalanceByRegister.values()].reduce((sum, v) => sum + v, 0);
    const cashBalance = openBalance + closedCarryoverBalance;
    const lowStockCount = pharmacyItems.filter((item: any) => Number(item.stockQuantity || 0) <= Number(item.reorderLevel || 10)).length;

    const todayByCategory = new Map(categoryToday.map((c) => [c.category, c._sum.amount || 0]));
    const revenueByCategory = categoryAllTime
      .map((c) => ({
        category: c.category as string,
        totalIncome: c._sum.amount || 0,
        todayIncome: todayByCategory.get(c.category) || 0,
      }))
      .sort((a, b) => b.totalIncome - a.totalIncome);

    // Bénéfice (marge simple) par catégorie facturable : Médicament = ventes pharmacie - achats
    // de stock de la période ; Examens = ventes labo - coût des tests réalisés (cf. calcul
    // ci-dessus) ; toute autre catégorie (Services...) n'a pas de coût matière connu, sa marge
    // vaut donc 100% de son revenu. Volontairement une marge globale par période, pas le
    // bénéfice exact de chaque vente individuelle (cf. échange avec l'utilisateur).
    const categoryCost: Record<string, { allTime: number; today: number }> = {
      PHARMACY_SALE: { allTime: pharmacyPurchaseAllTime._sum.totalCost || 0, today: pharmacyPurchaseToday._sum.totalCost || 0 },
      LAB_EXAM_FEE: { allTime: labCostAllTime, today: labCostToday },
    };
    const profitByCategory = revenueByCategory
      .map((c) => {
        const cost = categoryCost[c.category] || { allTime: 0, today: 0 };
        const entry: {
          category: string;
          revenue: number;
          cost: number;
          profit: number;
          todayRevenue: number;
          todayCost: number;
          todayProfit: number;
          soldCost?: number;
          soldProfit?: number;
          todaySoldCost?: number;
          todaySoldProfit?: number;
        } = {
          category: c.category,
          revenue: c.totalIncome,
          cost: cost.allTime,
          profit: c.totalIncome - cost.allTime,
          todayRevenue: c.todayIncome,
          todayCost: cost.today,
          todayProfit: c.todayIncome - cost.today,
        };
        // Second calcul, Médicament uniquement : bénéfice sur ce qui a déjà été vendu (coût des
        // seules unités vendues) plutôt que sur les achats de la période — cf. calcul plus haut.
        if (c.category === "PHARMACY_SALE") {
          entry.soldCost = soldCogsAllTime;
          entry.soldProfit = c.totalIncome - soldCogsAllTime;
          entry.todaySoldCost = soldCogsToday;
          entry.todaySoldProfit = c.todayIncome - soldCogsToday;
        }
        return entry;
      })
      .sort((a, b) => b.profit - a.profit);

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
        pharmacyItems,
        revenueByCategory,
        profitByCategory
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

// Ligne homogène "à remettre" pour une facture, quelle que soit son origine — vente pharmacie
// directe (items PHARMACY) ou examen labo (LabOrder.testDetails[].consumables, cf. lab.ts —
// le patient récupère les produits consommés par son examen au comptoir pharmacie exactement
// comme un médicament). Centralise ici la seule branche origine-dépendante de tout le flux de
// remise, pour que pharmacie-view.tsx n'affiche qu'une seule forme de données.
// Deux groupes distincts plutôt qu'une liste fusionnée : les lignes du panier (cartLines) sont
// capables de remise partielle et gardent leur identité (index dans items[], nécessaire pour
// dispensePendingInvoice) ; les consommables labo (labLines) restent tout-ou-rien et purement
// informatifs côté UI — cf. commentaire de dispensePendingInvoice pour le pourquoi de cette
// séparation.
function computeDispenseLines(inv: { items: any; labOrders?: { testDetails: any }[] }) {
  const cartLines = ((inv.items as any[]) || [])
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => it.type === "PHARMACY")
    .map(({ it, index }) => {
      const quantity = Number(it.quantity) || 0;
      const dispensedQuantity = Number(it.dispensedQuantity) || 0;
      return {
        index,
        pharmacyItemId: it.pharmacyItemId || null,
        description: it.description,
        quantity,
        dispensedQuantity,
        remainingQuantity: Math.max(0, quantity - dispensedQuantity),
      };
    });

  const labMap = new Map<string, { description: string; quantity: number }>();
  for (const lo of inv.labOrders || []) {
    for (const td of (lo.testDetails as any[]) || []) {
      for (const c of td.consumables || []) {
        const key = c.pharmacyItemId || c.name;
        const existing = labMap.get(key);
        if (existing) existing.quantity += Number(c.quantity) || 0;
        else labMap.set(key, { description: c.name, quantity: Number(c.quantity) || 0 });
      }
    }
  }
  return { cartLines, labLines: [...labMap.values()] };
}

function hasDispensableContent(inv: { items: any; labOrders?: { testDetails: any }[] }) {
  const hasPharmacyItems = Array.isArray(inv.items) && (inv.items as any[]).some((i) => i.type === "PHARMACY");
  const hasLabConsumables = (inv.labOrders || []).some((lo) =>
    ((lo.testDetails as any[]) || []).some((td: any) => (td.consumables || []).length > 0)
  );
  return hasPharmacyItems || hasLabConsumables;
}

// File d'attente du comptoir pharmacie : factures contenant au moins un médicament, pas encore
// intégralement remises (dispensedAt null) et pas clôturées côté caisse (status CANCELLED) —
// quel que soit leur état de règlement sinon (PENDING/PARTIAL/PAID), puisqu'un patient peut
// repartir avec une partie de ses médicaments avant d'avoir tout payé. Un ticket partiellement
// remis reste ici tant qu'il reste quelque chose à donner, avec sa progression ligne par ligne.
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
    const notCancelled = { status: { not: "CANCELLED" } };
    const where: any = { AND: [notDispensed, notCancelled] };
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
        labOrders: { select: { testDetails: true } },
      },
      // paidAt peut désormais être null (facture non/partiellement réglée) — createdAt reste
      // toujours renseigné, ordre "plus ancien ticket en attente d'abord" plus fiable.
      orderBy: { createdAt: "desc" },
    });

    const queue = await attachAmountPaid(invoices.filter(hasDispensableContent));
    const queueWithLines = queue.map((inv) => {
      const { cartLines, labLines } = computeDispenseLines(inv);
      return { ...inv, cartLines, labLines };
    });

    return { success: true, data: queueWithLines };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement de la file d'attente pharmacie." };
  }
}

// Historique pharmacie : factures intégralement remises (dispensedAt renseigné) OU clôturées
// côté caisse sans avoir été intégralement remises (status CANCELLED) — un ticket partiellement
// remis puis abandonné reste ainsi traçable ici plutôt que de disparaître silencieusement. L'état
// de règlement (badge Payé/Partiel/Non payé/Clôturé) reste affiché pour signaler un solde dû.
export async function listPharmacyDispenseHistory(organizationId?: string, options?: { search?: string; take?: number }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyCatalogReadRole(activeUser.role);

    const relevant = { OR: [{ dispensedAt: { not: null } }, { status: "CANCELLED" }] };
    const where: any = { AND: [relevant] };
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
        labOrders: { select: { testDetails: true } },
      },
      orderBy: { dispensedAt: "desc" },
      take: options?.take || 200,
    });

    let history = (await attachAmountPaid(invoices.filter(hasDispensableContent))).map((inv) => {
      const { cartLines, labLines } = computeDispenseLines(inv);
      return { ...inv, cartLines, labLines };
    });

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
        // Nécessaire pour afficher le récapitulatif donné/commandé (panier + labo) dans la boîte
        // de dialogue de clôture d'un ticket non réglé (cf. closeUnpaidInvoice).
        labOrders: { select: { testDetails: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const withLines = (await attachAmountPaid(invoices)).map((inv) => {
      const { cartLines, labLines } = computeDispenseLines(inv);
      return { ...inv, cartLines, labLines };
    });

    return { success: true, data: withLines };
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
