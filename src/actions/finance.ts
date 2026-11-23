"use server";

import { assertCan, can, type PermissionSubject } from "@/lib/permissions-catalog";
import { applyItemDiscounts, totalDiscount, withDiscount } from "@/lib/invoice-discount";

import { runIdempotent, type IdempotentInput } from "@/lib/idempotency";
import type { Prisma } from "@prisma/client";
import { MAX_PAGE_SIZE, resolvePage } from "@/lib/pagination";
import { attachInvoiceTotals, buildJournalWhere, getJournalTotals, JOURNAL_TRANSACTION_INCLUDE } from "@/lib/finance-journal-query";
import { accountSafely, accountTransaction, postInvoiceWriteOff, reverseDeletedInvoiceSale, accountingEnabled } from "@/lib/accounting/postings";
import { PAYMENT_METHODS, isCashOutCategory } from "@/lib/accounting/plan";
import { buildReversalEntry, COUNTS_IN_KPI_WHERE, countsInKpi } from "@/lib/finance-reversal";
import { prisma } from "@/lib/db";
import { assertOrganizationAccess, resolveTargetOrgId } from "@/lib/org-scope";
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
  cancelDispenseSchema,
  importPharmacyItemsSchema,
  changeInvoiceStatusSchema,
  deletePendingInvoiceSchema,
  applyInvoiceDiscountSchema,
} from "@/validators/finance";
import {
  assertStockWrite,
  completeInventoryCount,
  getItemUnitCostMap,
  cancelInventoryCount,
  saveInventoryCounts,
  startInventoryCount,
} from "@/actions/stock";
import { assertRegisterOperateRole, assertRegisterReadRole } from "@/actions/register-permissions";
import { assertPharmacyItemsSellable } from "@/lib/pharmacy-sale-block";
import { decrementStockForItems } from "@/lib/stock-decrement";
import {
  periodCreatedAtFilter,
  resolvePeriod,
  todayCreatedAtFilter,
  type PeriodInput,
} from "@/lib/finance-period";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertUserModule } from "@/lib/modules-server";

// maxDuration (limite de durée Vercel pour dispensePendingInvoice/cancelDispense, déjà à
// { timeout: 20000, maxWait: 10000 } côté Prisma) NE PEUT PAS être exporté depuis ce fichier : un
// fichier "use server" n'autorise que des exports de fonctions async — voir plutôt les page.tsx
// qui rendent PharmacieView (dashboard/clinics/[id]/pharmacie).

// Tout ticket manipulé par son identifiant doit appartenir à l'établissement de l'utilisateur
// (cf. assertOrganizationAccess, src/lib/org-scope.ts).
const TICKET_ACCESS_DENIED = "Non autorisé. Ce ticket n'appartient pas à votre établissement.";

// ADMIN (holding) garde une vue lecture seule de la finance (KPI, journal, valorisation) ;
// COORDINATOR seul y a un accès d'écriture directe (dépenses hors-session exceptées — voir
// recordExpense, désormais rattaché à une session de caisse). Le catalogue pharmacie a son
// propre rôle de lecture élargi (CASHIER en a besoin pour construire un panier de vente).
// Remise des médicaments au comptoir : PHARMACIST uniquement, volontairement plus strict que
// STOCK_WRITE_ROLES (COORDINATOR+PHARMACIST) qui régit le reste du stock — séparation caisse/
// pharmacie voulue par cette fonctionnalité, seule dérogation à la convention habituelle de ce
// module (partout ailleurs, COORDINATOR reste un rôle de secours).

function assertFinanceReadRole(role: PermissionSubject) {
  if (!can(role, "finance.read")) {
    throw new Error("Non autorisé.");
  }
}

function assertPharmacyCatalogReadRole(role: PermissionSubject) {
  if (!can(role, "pharmacy.catalog.read")) {
    throw new Error("Non autorisé.");
  }
}

function assertPharmacyDispenseRole(role: PermissionSubject) {
  if (!can(role, "pharmacy.dispense")) {
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
  // Blocage de vente d'un produit de pharmacie (cf. setPharmacyItemSaleBlock) : sans cette
  // conversion, le format JSON étendu brut ({ $date }) arriverait tel quel au client.
  if (formatted.saleBlockedAt && formatted.saleBlockedAt.$date) {
    formatted.saleBlockedAt = new Date(formatted.saleBlockedAt.$date);
  }
  if (formatted.saleBlockedById && formatted.saleBlockedById.$oid) {
    formatted.saleBlockedById = formatted.saleBlockedById.$oid;
  }

  return formatted;
}

export async function getPharmacyItems(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "PHARMACIE");
    assertPharmacyCatalogReadRole(activeUser);

    const targetOrgId = await resolveTargetOrgId(activeUser, organizationId);

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
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des médicaments.") };
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

    const targetOrgId = await resolveTargetOrgId(activeUser!, data.organizationId);
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

async function assertNoInventoryInProgress(organizationId: string, message: string) {
  const inProgress = await prisma.inventoryCount.findFirst({ where: { organizationId, status: "IN_PROGRESS" }, select: { id: true } });
  if (inProgress) throw new Error(message);
}

// Applique des quantités réellement comptées par un inventaire démarré, compté et clôturé
// automatiquement (completeInventoryCount) : pertes valorisées en charge, surplus remis en lot,
// le tout tracé dans l'historique des inventaires. Partagé par l'import CSV du stock et la
// correction de stock depuis la fiche d'un produit. Lève une erreur si rien n'a pu être appliqué
// (l'inventaire automatique est alors annulé). `staleProducts` : produits dont le stock a bougé
// pendant l'opération, non corrigés.
async function applyCountedQuantities(
  organizationId: string,
  changes: { id: string; quantity: number }[],
  cancelReason: string
): Promise<{ applied: number; staleProducts: string[] }> {
  let inventoryId: string | null = null;
  try {
    const started: any = await startInventoryCount(organizationId);
    if (!started.success) throw new Error(started.error);
    inventoryId = started.data.id as string;
    const lineByItem = new Map<string, string>(started.data.lines.map((line: any) => [line.pharmacyItemId, line.id]));
    const lines = changes
      .filter((change) => lineByItem.has(change.id))
      .map((change) => ({ lineId: lineByItem.get(change.id)!, countedQuantity: change.quantity }));
    const saved: any = await saveInventoryCounts(inventoryId, lines);
    if (!saved.success) throw new Error(saved.error);
    const done: any = await completeInventoryCount(inventoryId);
    if (!done.success) throw new Error(done.error);
    inventoryId = null;
    const staleProducts: string[] = done.data?.staleProducts || [];
    return { applied: lines.length - staleProducts.length, staleProducts };
  } catch (error) {
    if (inventoryId) await cancelInventoryCount(inventoryId, cancelReason);
    throw error;
  }
}

// Coût d'achat actuel d'un produit (moyenne des lots en stock) et part du stock sans prix d'achat
// connu (stock initial « hérité »), pour la fiche du produit.
export async function getPharmacyItemCost(pharmacyItemId: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);
    const item = await prisma.pharmacyItem.findUnique({ where: { id: pharmacyItemId }, select: { id: true, organizationId: true, stockQuantity: true } });
    if (!item) throw new Error("Produit introuvable.");
    await assertOrganizationAccess(activeUser!, item.organizationId);
    const lots = await prisma.stockPurchase.findMany({ where: { pharmacyItemId, remainingQuantity: { gt: 0 } }, select: { remainingQuantity: true, purchasePrice: true } });
    const lotQuantity = lots.reduce((sum, l) => sum + l.remainingQuantity, 0);
    const avgCost = lotQuantity > 0 ? lots.reduce((sum, l) => sum + l.remainingQuantity * l.purchasePrice, 0) / lotQuantity : null;
    return { success: true as const, data: { avgCost, lotQuantity, stockQuantity: item.stockQuantity, uncosted: Math.max(0, item.stockQuantity - lotQuantity) } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du coût d'achat.") };
  }
}

// Correction du stock et/ou du prix d'achat d'un produit depuis sa fiche.
// - Prix d'achat : appliqué à tout le stock restant (lots en stock) ; le stock sans prix d'achat
//   connu reçoit un lot à ce prix (sans dépense, il est déjà là). Les achats passés et leurs
//   écritures ne changent pas : seule la valeur du stock restant (marges, pertes, inventaires) suit.
// - Quantité : la quantité réellement en stock, appliquée par un inventaire automatique (cf.
//   applyCountedQuantities) — jamais une simple réécriture du chiffre.
// Le prix est corrigé avant la quantité : un surplus constaté est ainsi valorisé au nouveau prix.
export async function adjustPharmacyItemStock(data: { id: string; stockQuantity?: number; purchasePrice?: number }) {
  try {
    z.object({
      id: z.string().min(1),
      stockQuantity: z.number().int("Quantité entière attendue").min(0).max(10_000_000).optional(),
      purchasePrice: z.number().min(0).max(100_000_000).optional(),
    }).parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);
    const item = await prisma.pharmacyItem.findUnique({ where: { id: data.id }, select: { id: true, name: true, organizationId: true, stockQuantity: true } });
    if (!item || !item.organizationId) throw new Error("Produit introuvable.");
    await assertOrganizationAccess(activeUser!, item.organizationId);
    const quantityChanges = data.stockQuantity != null && data.stockQuantity !== item.stockQuantity;
    if (quantityChanges) {
      await assertNoInventoryInProgress(item.organizationId, "Un inventaire est en cours (onglet Inventaire) : clôturez-le ou annulez-le avant de corriger le stock.");
    }

    let revalued = false;
    if (data.purchasePrice != null) {
      const price = data.purchasePrice;
      await prisma.$transaction(async (tx) => {
        await tx.stockPurchase.updateMany({ where: { pharmacyItemId: item.id, remainingQuantity: { gt: 0 } }, data: { purchasePrice: price } });
        const lots = await tx.stockPurchase.aggregate({ where: { pharmacyItemId: item.id, remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });
        const uncosted = item.stockQuantity - (lots._sum.remainingQuantity ?? 0);
        if (uncosted > 0) {
          await tx.stockPurchase.create({
            data: {
              pharmacyItemId: item.id,
              quantity: uncosted,
              remainingQuantity: uncosted,
              purchasePrice: price,
              totalCost: uncosted * price,
              batchNumber: "AJUSTEMENT-COUT",
              purchasedById: activeUser!.id,
              organizationId: item.organizationId,
            },
          });
        }
      });
      revalued = true;
    }

    let stockChanged = false;
    if (quantityChanges) {
      const applied = await applyCountedQuantities(item.organizationId, [{ id: item.id, quantity: data.stockQuantity! }], "Correction de stock interrompue");
      if (applied.staleProducts.length > 0) throw new Error("Le stock de ce produit a bougé pendant la correction (vente ou achat) : recommencez.");
      stockChanged = applied.applied > 0;
    }

    await logAuditAction(activeUser!.id, "ADJUST_PHARMACY_ITEM_STOCK", "PharmacyItem", item.id, {
      from: item.stockQuantity,
      to: data.stockQuantity ?? item.stockQuantity,
      purchasePrice: data.purchasePrice ?? null,
    });
    revalidatePath("/dashboard/pharmacie");
    revalidatePath(`/dashboard/clinics/${item.organizationId}/pharmacie`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");
    return { success: true as const, data: { revalued, stockChanged } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la correction du stock.") };
  }
}

// Import CSV en masse.
// - Ligne SANS id : CRÉATION. Pas de rapprochement par nom, pour ne jamais écraser un produit
//   existant à cause d'un nom mal orthographié dans le fichier.
// - Ligne AVEC id (colonne « ID MedDoc » du fichier exporté depuis l'onglet Stock) : MISE À JOUR
//   de ce produit précis de l'établissement (nom, dosage, prix, seuil, lot...). La quantité y est
//   la quantité réelle constatée : un écart avec le stock système passe par un inventaire démarré,
//   compté et clôturé automatiquement (completeInventoryCount) — pertes valorisées en charge et
//   surplus remis en lot exactement comme un inventaire manuel, et tracé dans l'historique des
//   inventaires. Quantité vide = stock inchangé. Le prix d'achat est ignoré en mise à jour.
// Création — stockQuantity (optionnel, 0 par défaut) est une dérogation volontaire à la règle habituelle
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
    id?: string;
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

    const targetOrgId = await resolveTargetOrgId(activeUser!, data.organizationId);

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
    let updated = 0;
    let stockChanged = 0;
    let staleProducts: string[] = [];

    const creations = data.items.filter((item) => !item.id);
    const updateRows = data.items.filter((item) => item.id);

    // ---- Mises à jour (lignes portant l'ID MedDoc d'un produit exporté) ----
    if (updateRows.length > 0) {
      const existing = await prisma.pharmacyItem.findMany({
        where: { id: { in: updateRows.map((item) => item.id!) }, organizationId: targetOrgId || null },
        select: { id: true, stockQuantity: true },
      });
      const stockById = new Map(existing.map((item) => [item.id, item.stockQuantity]));

      const seen = new Set<string>();
      const toUpdate: typeof updateRows = [];
      for (const item of updateRows) {
        if (!stockById.has(item.id!)) {
          failures.push({ name: item.name, error: "Produit introuvable dans cet établissement (supprimé, ou fichier d'un autre établissement)." });
        } else if (seen.has(item.id!)) {
          failures.push({ name: item.name, error: "Ce produit apparaît plusieurs fois dans le fichier : seule la première ligne est prise en compte." });
        } else {
          seen.add(item.id!);
          toUpdate.push(item);
        }
      }

      const quantityChanges = toUpdate
        .filter((item) => item.stockQuantity != null && Math.round(item.stockQuantity) !== stockById.get(item.id!))
        .map((item) => ({ id: item.id!, quantity: Math.round(item.stockQuantity!) }));

      // Vérifié AVANT toute écriture : un inventaire manuel en cours ne doit pas être clôturé ni
      // doublé par l'import.
      if (quantityChanges.length > 0) {
        if (!targetOrgId) throw new Error("Établissement requis pour modifier des quantités en stock.");
        await assertNoInventoryInProgress(
          targetOrgId,
          "Un inventaire est en cours (onglet Inventaire) : clôturez-le ou annulez-le avant d'importer des quantités modifiées. Rien n'a été importé."
        );
      }

      for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
        const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
        const settled = await Promise.allSettled(
          chunk.map(async (item) => {
            const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
            if (expiryDate && Number.isNaN(expiryDate.getTime())) {
              throw new Error(`Date de péremption invalide ("${item.expiryDate}")`);
            }
            // Ni le stock (cf. inventaire ci-dessous) ni l'établissement ne changent ici.
            const fields: Partial<ReturnType<typeof toItemData>> = toItemData(item, 0, expiryDate);
            delete fields.stockQuantity;
            delete fields.organizationId;
            await prisma.pharmacyItem.update({ where: { id: item.id! }, data: fields });
          })
        );
        settled.forEach((result, idx) => {
          if (result.status === "fulfilled") updated++;
          else failures.push({ name: chunk[idx].name, error: toErrorMessage(result.reason, "Erreur inconnue") });
        });
      }

      if (quantityChanges.length > 0) {
        try {
          const applied = await applyCountedQuantities(targetOrgId!, quantityChanges, "Import CSV interrompu");
          staleProducts = applied.staleProducts;
          stockChanged = applied.applied;
        } catch (stockError) {
          failures.push({
            name: "Quantités en stock",
            error: `Non appliquées (les autres informations des produits sont bien mises à jour) : ${toErrorMessage(stockError, "erreur inconnue")}`,
          });
        }
      }
    }

    // ---- Créations ----
    for (let i = 0; i < creations.length; i += CHUNK_SIZE) {
      const chunk = creations.slice(i, i + CHUNK_SIZE);
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

    await logAuditAction(activeUser!.id, "IMPORT_PHARMACY_ITEMS_CSV", "PharmacyItem", "bulk", {
      count,
      updated,
      stockChanged,
      failures: failures.length,
    });
    revalidatePath("/dashboard/pharmacie");
    if (targetOrgId) revalidatePath(`/dashboard/clinics/${targetOrgId}/pharmacie`);
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { count, updated, stockChanged, staleProducts, failures } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'import du fichier.") };
  }
}

export async function recordExpense(data: Parameters<typeof recordExpenseOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("recordExpense", idempotencyKey, payload, () => recordExpenseOnce(payload));
}

async function recordExpenseOnce(data: { cashSessionId: string; description: string; amount: number; organizationId?: string; category?: string }) {
  try {
    recordExpenseSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser);

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
        paymentMethod: "CASH",
        expenseCategory: isCashOutCategory(data.category) ? data.category : "other",
      },
    });

    // « Une dépense n'existe pas sans son écriture » : si la comptabilité est active et que
    // l'écriture échoue, la dépense saisie est retirée et l'erreur affichée.
    if (await accountingEnabled(session.organizationId)) {
      try {
        await accountTransaction(transaction.id);
      } catch (accountingError) {
        await prisma.financialTransaction.delete({ where: { id: transaction.id } });
        throw accountingError;
      }
    }

    await logAuditAction(activeUser.id, "RECORD_EXPENSE", "FinancialTransaction", transaction.id);
    revalidatePath(`/dashboard/clinics/${session.organizationId}/caisse`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: transaction };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de la dépense.") };
  }
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
  pendingInvoiceId: Parameters<typeof payPendingInvoiceOnce>[0],
  cashSessionId: Parameters<typeof payPendingInvoiceOnce>[1],
  amount: Parameters<typeof payPendingInvoiceOnce>[2],
  items?: Parameters<typeof payPendingInvoiceOnce>[3],
  idempotencyKey?: string,
  paymentMethod?: string
) {
  return runIdempotent(
    "payPendingInvoice",
    idempotencyKey,
    { pendingInvoiceId, cashSessionId, amount, items, paymentMethod },
    () => payPendingInvoiceOnce(pendingInvoiceId, cashSessionId, amount, items, paymentMethod)
  );
}

async function payPendingInvoiceOnce(
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
    discount?: number;
    discountReason?: string;
  }>,
  paymentMethod?: string
) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser);

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
    // Ticket et caisse doivent appartenir à l'établissement de l'utilisateur (ou à une clinique de
    // sa holding) — un identifiant d'un autre établissement ne doit jamais être encaissé.
    await assertOrganizationAccess(activeUser, pending.organizationId, TICKET_ACCESS_DENIED);
    await assertOrganizationAccess(activeUser, session.organizationId);

    payPendingInvoiceSchema.parse({ pendingInvoiceId, cashSessionId, amount, items });

    // Seuls les produits AJOUTÉS au ticket sont contrôlés : un ticket déjà émis (ordonnance,
    // consultation, vente à crédit) qui contenait déjà un produit depuis bloqué doit rester
    // encaissable tel quel — l'interdire couperait un patient de son règlement, voire coincerait
    // un ticket déjà partiellement remis (que reconcileItemsWithPriorDispense interdit de vider).
    if (pending.status === "PENDING" && items) {
      const alreadyOnTicket = new Set(
        ((pending.items as any[]) || []).map((i) => i.pharmacyItemId).filter(Boolean)
      );
      await assertPharmacyItemsSellable(items.filter((i) => !(i.pharmacyItemId && alreadyOnTicket.has(i.pharmacyItemId))));
    }

    // Le panier n'est modifiable (remplace pending.items) que sur le tout premier règlement,
    // tant que rien n'a encore été perçu — dès qu'un acompte existe (PARTIAL), il est verrouillé
    // pour ne pas fausser rétroactivement ce qui a déjà été encaissé dessus. Reconcilié avec
    // dispensedQuantity (cf. reconcileItemsWithPriorDispense) pour ne jamais perdre la trace
    // d'une remise partielle déjà effectuée en pharmacie.
    // Réductions : montants nets recalculés ici ; en créer ou en augmenter exige
    // « invoices.discount » (cf. src/lib/invoice-discount.ts) — le caissier encaisse tel quel un
    // ticket déjà réduit par le coordinateur.
    const currentItems: any[] =
      pending.status === "PENDING" && items
        ? reconcileItemsWithPriorDispense((pending.items as any[]) || [], applyItemDiscounts(activeUser, items, (pending.items as any[]) || []))
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
        paymentMethod: normalizePaymentMethod(paymentMethod),
      },
    });
    await accountSafely("Encaissement", pending.organizationId, () => accountTransaction(transaction.id));

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

    await logAuditAction(activeUser.id, "PAY_PENDING_INVOICE", "PendingInvoice", pendingInvoiceId, {
      transactionId: transaction.id,
      amount,
      ...(totalDiscount(currentItems) > 0 ? { discount: totalDiscount(currentItems) } : {}),
    });
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
export async function createCaisseSale(data: Parameters<typeof createCaisseSaleOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createCaisseSale", idempotencyKey, payload, () => createCaisseSaleOnce(payload));
}

async function createCaisseSaleOnce(data: {
  cashSessionId: string;
  items: Array<{
    type: "PHARMACY" | "SERVICE" | "LAB";
    pharmacyItemId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    discount?: number;
    discountReason?: string;
  }>;
  patientId?: string;
  customPatientName?: string;
  customPatientPhone?: string;
  organizationId?: string;
  amountReceived?: number;
  paymentMethod?: string;
}) {
  try {
    createCaisseSaleSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser);
    // Vente de produits (lignes PHARMACY) : module « Pharmacie & stock » de la licence ; les
    // prestations (SERVICE, LAB) relèvent du socle (caisse).
    if (data.items.some((item) => item.type === "PHARMACY")) assertUserModule(activeUser, "PHARMACIE");

    const session = await prisma.cashSession.findUnique({ where: { id: data.cashSessionId } });
    if (!session || session.status !== "OPEN") {
      throw new Error("Aucune session de caisse ouverte. Ouvrez la caisse avant d'encaisser.");
    }

    await assertPharmacyItemsSellable(data.items);
    // Réductions accordées au guichet : réservées à « invoices.discount », montants nets recalculés.
    data = { ...data, items: applyItemDiscounts(activeUser, data.items) };

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
        paymentMethod: normalizePaymentMethod(data.paymentMethod),
      },
    });
    await accountSafely("Vente au comptoir", targetOrgId, () => accountTransaction(transaction.id));

    await logAuditAction(
      activeUser.id,
      "CREATE_CAISSE_SALE",
      "FinancialTransaction",
      transaction.id,
      totalDiscount(data.items) > 0 ? { discount: totalDiscount(data.items) } : undefined
    );
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

// Réduction accordée sur un ticket encore non réglé (examen, consultation, ordonnance, nuitées...) :
// par ligne, en FCFA, avec un motif ; 0 retire la réduction. Réservé à « invoices.discount » (le
// coordinateur par défaut). Seulement avant tout encaissement : une fois un règlement reçu, la vente
// est comptabilisée et le panier verrouillé — un reste dû qu'on renonce à percevoir se clôture
// (closeUnpaidInvoice, passé en perte).
export async function applyInvoiceDiscount(data: { pendingInvoiceId: string; discounts: { index: number; discount: number; reason?: string }[] }) {
  try {
    applyInvoiceDiscountSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertCan(activeUser, "invoices.discount", "Non autorisé. Seul un responsable (coordinateur) peut accorder une réduction.");

    const pending = await prisma.pendingInvoice.findUnique({ where: { id: data.pendingInvoiceId } });
    if (!pending) throw new Error("Ticket introuvable.");
    await assertOrganizationAccess(activeUser, pending.organizationId, TICKET_ACCESS_DENIED);
    const paid = await prisma.financialTransaction.aggregate({ where: { pendingInvoiceId: pending.id }, _sum: { amount: true } });
    if (pending.status !== "PENDING" || (paid._sum.amount || 0) > 0) {
      throw new Error("Une réduction ne s'accorde qu'avant tout encaissement sur le ticket. Pour renoncer au reste dû, clôturez le ticket.");
    }

    const items = [...((pending.items as any[]) || [])];
    for (const d of data.discounts) {
      if (!items[d.index]) throw new Error("Ligne du ticket introuvable.");
      items[d.index] = withDiscount(items[d.index], d.discount, d.reason, { id: activeUser.id });
    }
    // Ticket entièrement offert : plus rien à encaisser, il est soldé (aucune vente à comptabiliser).
    const newTotal = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const updated = await prisma.pendingInvoice.update({
      where: { id: pending.id },
      data: { items, ...(newTotal <= 0 ? { status: "PAID", paidAt: new Date() } : {}) },
    });

    await logAuditAction(activeUser.id, "APPLY_INVOICE_DISCOUNT", "PendingInvoice", pending.id, {
      discounts: data.discounts.map((d) => ({ line: items[d.index]?.description, discount: Math.round(d.discount), reason: d.reason || null })),
      totalDiscount: totalDiscount(items),
    });
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/caisse`);
    revalidatePath("/dashboard/caisse");
    return { success: true as const, data: { items: updated.items as any[], total: newTotal, settled: newTotal <= 0 } };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'application de la réduction.") };
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
    assertRegisterOperateRole(activeUser);

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
  pendingInvoiceId: Parameters<typeof dispensePendingInvoiceOnce>[0],
  referenceCode: Parameters<typeof dispensePendingInvoiceOnce>[1],
  lines: Parameters<typeof dispensePendingInvoiceOnce>[2] = [],
  idempotencyKey?: string
) {
  return runIdempotent(
    "dispensePendingInvoice",
    idempotencyKey,
    { pendingInvoiceId, referenceCode, lines },
    () => dispensePendingInvoiceOnce(pendingInvoiceId, referenceCode, lines)
  );
}

// Remise directe depuis la caisse, juste après la vente ou l'encaissement, quand la personne qui
// encaisse est aussi celle qui remet (caissière-pharmacienne) : tous les médicaments restant à
// remettre sur le ticket sortent du stock, sans aller sur la page Pharmacie. Même contrôle que la
// remise pharmacie (rôle pharmacien, module Pharmacie, stock suffisant, lots) ; la référence n'est
// pas redemandée puisqu'elle vient d'être imprimée par la même personne. Valable aussi pour une
// vente à crédit : la remise ne dépend pas du paiement.
export async function dispenseAtCashier(pendingInvoiceId: string) {
  try {
    z.string().min(1).parse(pendingInvoiceId);
    const pending = await prisma.pendingInvoice.findUnique({ where: { id: pendingInvoiceId }, select: { id: true, items: true, dispensedAt: true } });
    if (!pending) throw new Error("Facture introuvable.");
    if (pending.dispensedAt) return { success: true as const, data: { alreadyDispensed: true } };
    const lines = ((pending.items as any[]) || [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === "PHARMACY")
      .map(({ item, index }) => ({ index, quantity: Math.max(0, Number(item.quantity) - (Number(item.dispensedQuantity) || 0)) }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) return { success: true as const, data: { alreadyDispensed: true } };
    const res = await dispensePendingInvoiceOnce(pendingInvoiceId, String(pending.id).slice(-6).toUpperCase(), lines);
    return res.success ? { success: true as const, data: { alreadyDispensed: false } } : { success: false as const, error: res.error as string };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la remise des médicaments.") };
  }
}

async function dispensePendingInvoiceOnce(
  pendingInvoiceId: string,
  referenceCode: string,
  lines: Array<{ index: number; quantity: number }> = []
) {
  try {
    dispensePendingInvoiceSchema.parse({ pendingInvoiceId, referenceCode, lines });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "PHARMACIE");
    assertPharmacyDispenseRole(activeUser);

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: pendingInvoiceId },
      include: { prescriptions: true, labOrders: { select: { id: true, testDetails: true } } },
    });
    if (!pending) throw new Error("Facture introuvable.");
    await assertOrganizationAccess(activeUser, pending.organizationId, TICKET_ACCESS_DENIED);
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
      // 50s : sous le maxDuration de 60s posé sur le layout /dashboard (cf. son commentaire) —
      // la fonction Vercel serait coupée avant qu'un délai Prisma plus long ne serve à quelque chose.
      { timeout: 50000, maxWait: 10000 }
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

// Annule intégralement la remise d'un ticket (tout ou rien, pas ligne par ligne ni comptage par
// comptage) — correction réservée au COORDINATOR quand le pharmacien a remis par erreur : remet
// dispensedQuantity à 0 sur toutes les lignes PHARMACY, réintègre le stock consommé (un nouveau
// lot StockPurchase par produit, valorisé au coût moyen actuel des lots restants — la remise
// d'origine ne garde pas trace des lots précis consommés via consumeStockLots en FEFO, donc
// impossible de les restaurer eux-mêmes ; même logique que le surplus constaté à la clôture d'un
// inventaire, cf. completeInventoryCount), annule labConsumablesDispensedAt le cas échéant, et
// repasse dispensedAt à null ainsi que les ordonnances liées de DISPENSED à SENT_TO_PHARMACY.
// N'annule jamais un paiement déjà perçu (cf. payPendingInvoice, totalement indépendant de la
// remise) : seul le mouvement de stock est corrigé.
export async function cancelDispense(pendingInvoiceId: string, reason?: string) {
  try {
    cancelDispenseSchema.parse({ pendingInvoiceId, reason });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "PHARMACIE");

    if (!can(activeUser, "pharmacy.dispense.cancel")) {
      throw new Error("Non autorisé. Seul le coordonnateur peut annuler une remise.");
    }

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: pendingInvoiceId },
      include: { prescriptions: true, labOrders: { select: { id: true, testDetails: true } } },
    });
    if (!pending) throw new Error("Facture introuvable.");
    await assertOrganizationAccess(activeUser, pending.organizationId, TICKET_ACCESS_DENIED);

    // Recette figée au moment de la commande labo (cf. dispensePendingInvoice) : jamais mutée
    // ensuite, donc pas besoin d'une relecture fraîche comme pour pending.items ci-dessous.
    const labConsumableItems = (pending.labOrders || []).flatMap((lo) =>
      ((lo.testDetails as any[]) || []).flatMap((td) =>
        (td.consumables || []).map((c: any) => ({
          pharmacyItemId: c.pharmacyItemId as string | undefined,
          quantity: Number(c.quantity) || 0,
        }))
      )
    );

    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.pendingInvoice.findUnique({
          where: { id: pendingInvoiceId },
          select: { items: true, labConsumablesDispensedAt: true },
        });
        if (!fresh) throw new Error("Facture introuvable.");

        const freshItems: any[] = (fresh.items as any[]) || [];
        const toRestore = new Map<string, number>();

        for (const item of freshItems) {
          if (item.type !== "PHARMACY" || !item.pharmacyItemId) continue;
          const qty = Number(item.dispensedQuantity) || 0;
          if (qty > 0) {
            toRestore.set(item.pharmacyItemId, (toRestore.get(item.pharmacyItemId) || 0) + qty);
            item.dispensedQuantity = 0;
          }
        }

        if (fresh.labConsumablesDispensedAt) {
          for (const c of labConsumableItems) {
            if (!c.pharmacyItemId || c.quantity <= 0) continue;
            toRestore.set(c.pharmacyItemId, (toRestore.get(c.pharmacyItemId) || 0) + c.quantity);
          }
        }

        if (toRestore.size === 0) {
          throw new Error("Rien n'a été remis pour cette facture : rien à annuler.");
        }

        const costByItem = await getItemUnitCostMap(Array.from(toRestore.keys()), tx);

        for (const [pharmacyItemId, quantity] of toRestore) {
          const avgCost = costByItem.get(pharmacyItemId) ?? 0;
          await tx.pharmacyItem.update({
            where: { id: pharmacyItemId },
            data: { stockQuantity: { increment: quantity } },
          });
          await tx.stockPurchase.create({
            data: {
              pharmacyItemId,
              quantity,
              remainingQuantity: quantity,
              purchasePrice: avgCost,
              totalCost: avgCost * quantity,
              organizationId: pending.organizationId,
              purchasedById: activeUser.id,
              batchNumber: "ANNULATION-REMISE",
            },
          });
          await tx.stockAdjustment.create({
            data: {
              pharmacyItemId,
              quantityDelta: quantity,
              valuationAmount: avgCost * quantity,
              reason: "DISPENSE_CANCELLED",
              createdById: activeUser.id,
            },
          });
        }

        await tx.pendingInvoice.update({
          where: { id: pendingInvoiceId },
          data: {
            items: freshItems,
            dispensedAt: null,
            ...(fresh.labConsumablesDispensedAt ? { labConsumablesDispensedAt: null } : {}),
          },
        });

        for (const prescription of pending.prescriptions) {
          if (prescription.status === "DISPENSED") {
            await tx.prescription.update({
              where: { id: prescription.id },
              data: { status: "SENT_TO_PHARMACY", dispensedById: null, dispensedAt: null },
            });
          }
        }
      },
      // 50s : sous le maxDuration de 60s posé sur le layout /dashboard (cf. son commentaire) —
      // la fonction Vercel serait coupée avant qu'un délai Prisma plus long ne serve à quelque chose.
      { timeout: 50000, maxWait: 10000 }
    );

    await logAuditAction(activeUser.id, "CANCEL_DISPENSE", "PendingInvoice", pendingInvoiceId, { reason: reason || null });
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    revalidatePath("/dashboard/pharmacie");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'annulation de la remise.") };
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
    assertRegisterOperateRole(activeUser);

    const pending = await prisma.pendingInvoice.findUnique({ where: { id: pendingInvoiceId } });
    if (!pending) throw new Error("Facture introuvable.");
    await assertOrganizationAccess(activeUser, pending.organizationId, TICKET_ACCESS_DENIED);
    if (!["PENDING", "PARTIAL"].includes(pending.status)) {
      throw new Error("Cette facture est déjà réglée intégralement ou déjà clôturée.");
    }

    const updated = await prisma.pendingInvoice.update({
      where: { id: pendingInvoiceId },
      data: { status: "CANCELLED", closedAt: new Date(), closedById: activeUser.id },
    });
    await accountSafely("Créance abandonnée", pending.organizationId, () => postInvoiceWriteOff(pendingInvoiceId));

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

// Moyen de règlement reçu du client, ramené à une valeur connue (espèces par défaut).
function normalizePaymentMethod(method: string | undefined | null): string {
  return method && (PAYMENT_METHODS as readonly string[]).includes(method) ? method : "CASH";
}

// Comptabilise les contrepassations de règlements d'un ticket (cf. reverseInvoicePayments).
async function accountInvoiceReversals(pendingInvoiceId: string) {
  const reversals = await prisma.financialTransaction.findMany({
    where: { category: "REVERSAL", reversedFromInvoiceId: pendingInvoiceId },
    select: { id: true },
  });
  for (const r of reversals) await accountTransaction(r.id);
}

// Contrepassation des règlements d'un ticket — remplace l'ancienne suppression physique
// (deleteMany), qui modifiait rétroactivement le montant attendu et l'écart des sessions de caisse
// déjà clôturées (recalculés à chaque lecture depuis leurs transactions, cf. getSessionSummary).
// Pour chaque règlement encore rattaché au ticket :
// - le règlement d'origine est conservé tel quel (montant, session, date) mais détaché du ticket
//   (pendingInvoiceId vidé) et marqué contrepassé — il sort ainsi de tous les calculs de montant
//   réglé, qui ne lisent que les transactions rattachées au ticket ;
// - une écriture inverse (catégorie REVERSAL, même montant) est créée, rattachée à la session
//   d'origine si elle est encore ouverte (le tiroir reste juste), sinon hors session et datée du
//   jour : une session clôturée n'est jamais modifiée (cf. buildReversalEntry).
// À appeler dans la transaction Prisma de l'appelant.
async function reverseInvoicePayments(
  tx: Prisma.TransactionClient,
  params: { pendingInvoiceId: string; userId: string; reason?: string | null }
) {
  const payments = await tx.financialTransaction.findMany({
    where: { pendingInvoiceId: params.pendingInvoiceId },
    include: { cashSession: { select: { status: true } } },
  });

  let reversedAmount = 0;
  let reversedCount = 0;
  const now = new Date();
  for (const payment of payments) {
    // Détachement conditionné au rattachement encore présent : deux annulations concurrentes du
    // même ticket ne peuvent pas contrepasser deux fois le même règlement.
    const detached = await tx.financialTransaction.updateMany({
      where: { id: payment.id, pendingInvoiceId: params.pendingInvoiceId },
      data: {
        pendingInvoiceId: null,
        reversedAt: now,
        reversedById: params.userId,
        reversedFromInvoiceId: params.pendingInvoiceId,
      },
    });
    if (detached.count === 0) continue;

    await tx.financialTransaction.create({
      data: buildReversalEntry(payment, {
        userId: params.userId,
        label: "Annulation de règlement",
        reason: params.reason,
        reversedFromInvoiceId: params.pendingInvoiceId,
      }),
    });
    reversedAmount += payment.amount;
    reversedCount += 1;
  }
  return { reversedCount, reversedAmount };
}

// Modification exceptionnelle de statut d'un ticket (ex: rectification d'une erreur de saisie) —
// réservée au COORDINATOR et aux ADMIN. Si le statut passe à PENDING (ou si l'option d'annulation des
// paiements est activée), tous les règlements associés à ce ticket sont contrepassés (jamais
// supprimés, cf. reverseInvoicePayments) pour déduire le montant du solde de caisse.
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

    if (!can(activeUser, "invoices.manage")) {
      throw new Error("Non autorisé. Seul le coordonnateur ou un administrateur peut modifier le statut d'un ticket.");
    }

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: data.pendingInvoiceId },
      include: { payments: true },
    });
    if (!pending) throw new Error("Facture introuvable.");
    await assertOrganizationAccess(activeUser, pending.organizationId, TICKET_ACCESS_DENIED);

    const oldStatus = pending.status;
    const shouldWithdraw = data.withdrawPayments ?? (data.newStatus === "PENDING");

    let reversal = { reversedCount: 0, reversedAmount: 0 };
    await prisma.$transaction(async (tx) => {
      if (shouldWithdraw) {
        reversal = await reverseInvoicePayments(tx, {
          pendingInvoiceId: data.pendingInvoiceId,
          userId: activeUser.id,
          reason: data.reason,
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

    await accountSafely("Changement de statut d'un ticket", pending.organizationId, async () => {
      await accountInvoiceReversals(data.pendingInvoiceId);
      if (data.newStatus === "CANCELLED") await postInvoiceWriteOff(data.pendingInvoiceId);
    });

    await logAuditAction(activeUser.id, "CHANGE_INVOICE_STATUS", "PendingInvoice", data.pendingInvoiceId, {
      oldStatus,
      newStatus: data.newStatus,
      withdrawPayments: shouldWithdraw,
      reversedPayments: reversal.reversedCount,
      reversedAmount: reversal.reversedAmount,
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
// Les règlements sont contrepassés (jamais supprimés, cf. reverseInvoicePayments) et les liens
// associés (ordonnances, labo) détachés avant la suppression du ticket lui-même.
export async function deletePendingInvoice(data: {
  pendingInvoiceId: string;
  reason?: string;
}) {
  try {
    deletePendingInvoiceSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    if (!can(activeUser, "invoices.manage")) {
      throw new Error("Non autorisé. Seul le coordonnateur ou un administrateur peut supprimer un ticket.");
    }

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: data.pendingInvoiceId },
    });
    if (!pending) throw new Error("Facture introuvable.");
    await assertOrganizationAccess(activeUser, pending.organizationId, TICKET_ACCESS_DENIED);

    let reversal = { reversedCount: 0, reversedAmount: 0 };
    await prisma.$transaction(async (tx) => {
      // 1. Contrepasser les règlements (retire les montants du solde de caisse sans effacer
      //    l'historique des sessions)
      reversal = await reverseInvoicePayments(tx, {
        pendingInvoiceId: data.pendingInvoiceId,
        userId: activeUser.id,
        reason: data.reason ? `ticket supprimé : ${data.reason}` : "ticket supprimé",
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

    if (pending.organizationId) {
      const orgId = pending.organizationId;
      await accountSafely("Suppression d'un ticket", orgId, async () => {
        await accountInvoiceReversals(data.pendingInvoiceId);
        await reverseDeletedInvoiceSale(orgId, data.pendingInvoiceId);
      });
    }

    await logAuditAction(activeUser.id, "DELETE_PENDING_INVOICE", "PendingInvoice", data.pendingInvoiceId, {
      deletedInvoiceId: data.pendingInvoiceId,
      reversedPayments: reversal.reversedCount,
      reversedAmount: reversal.reversedAmount,
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


// `periodInput` = filtre global de période de la page Finance (cf. src/lib/finance-period.ts) : il
// borne les recettes, dépenses, la répartition des revenus et le bénéfice (coûts compris). Sans
// période : tout l'historique, comme avant. Le solde de caisse, les alertes de stock et la
// valorisation sont un ÉTAT ACTUEL et ne dépendent jamais de la période. Les chiffres "du jour"
// sont l'intersection d'aujourd'hui et de la période (0 si la période s'arrête avant aujourd'hui).
export async function getFinanceSummary(organizationId?: string, periodInput?: PeriodInput) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertFinanceReadRole(activeUser);

    const targetOrgId = await resolveTargetOrgId(activeUser, organizationId);

    const period = resolvePeriod(periodInput);
    const periodCreatedAt = periodCreatedAtFilter(period);
    const todayCreatedAt = todayCreatedAtFilter(period);
    const inToday = (date: Date | string) => {
      const t = new Date(date);
      return t >= todayCreatedAt.gte && (!todayCreatedAt.lte || t <= todayCreatedAt.lte);
    };

    let transactions: any[] = [];
    let pharmacyItems: any[] = [];
    let expenseRows: any[] = [];

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
      if (periodCreatedAt) whereClause.createdAt = periodCreatedAt;

      // Aperçu "Activité récente" : la page n'en affiche que 5, inutile d'en charger 500 à chaque
      // changement de période. Les TOTAUX ne viennent plus de cette liste plafonnée (cf.
      // expenseRows et les agrégats par catégorie plus bas), qui les tronquait au-delà de 500.
      transactions = await (prisma as any).financialTransaction.findMany({
        where: whereClause,
        include: {
          recordedBy: { select: { firstName: true, lastName: true } },
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          pharmacyItem: { select: { name: true, dosage: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      // TOUTES les dépenses de la période (deux champs seulement) pour un total exact, quel que
      // soit le volume. Sommées en JS plutôt que par agrégat : l'exclusion des retraits absorbés
      // (absorbedByPurchaseId) exigerait un filtre "champ renseigné" fragile sur MongoDB (un champ
      // absent n'est pas un champ null, cf. fieldIsEmpty dans stock.ts).
      expenseRows = await (prisma as any).financialTransaction.findMany({
        where: { ...whereClause, type: "EXPENSE" },
        select: { type: true, category: true, amount: true, absorbedByPurchaseId: true, reversedAt: true, createdAt: true },
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

    let totalExpenses = 0;
    let todayExpenses = 0;

    for (const t of expenseRows) {
      if (t.type !== "EXPENSE") continue;
      // Un retrait de caisse (OPERATIONAL_EXPENSE) réclamé par un achat pharmacie
      // (absorbedByPurchaseId posé, cf. recordStockPurchase) n'est plus qu'un transfert vers
      // cet achat, pas une dépense propre à l'établissement — le coût réel est déjà compté via
      // la FinancialTransaction PHARMACY_PURCHASE de l'achat lui-même. L'exclure ici évite de
      // compter deux fois le même argent, cf. échange avec l'utilisateur sur ce point précis.
      if (t.absorbedByPurchaseId) continue;
      // Contrepassation : ni le règlement annulé ni son écriture d'annulation ne sont des dépenses
      // de l'établissement (cf. src/lib/finance-reversal.ts).
      if (!countsInKpi(t)) continue;
      const amt = Number(t.amount || 0);
      totalExpenses += amt;
      if (t.createdAt && inToday(t.createdAt)) todayExpenses += amt;
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
    // Hors règlements contrepassés et écritures d'annulation (cf. src/lib/finance-reversal.ts) :
    // un règlement annulé ne compte plus dans les recettes, comme lorsqu'il était supprimé.
    const categoryWhere: any = { type: "INCOME", AND: [COUNTS_IN_KPI_WHERE] };
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      categoryWhere.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else if (targetOrgId) {
      categoryWhere.organizationId = targetOrgId;
    }
    if (periodCreatedAt) categoryWhere.createdAt = periodCreatedAt;

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
    if (periodCreatedAt) labOrderWhere.createdAt = periodCreatedAt;

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
    if (periodCreatedAt) stockPurchaseWhere.createdAt = periodCreatedAt;

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
        where: { ...categoryWhere, createdAt: todayCreatedAt },
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
        where: { ...stockPurchaseWhere, createdAt: todayCreatedAt },
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
      if (order.createdAt && inToday(order.createdAt)) labCostToday += orderCost;
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
      const isToday = tx.createdAt && inToday(tx.createdAt);
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

    // Recettes = somme des agrégats par catégorie sur TOUTES les transactions de la période (jamais
    // depuis `transactions`, qui n'est qu'un aperçu).
    const totalIncome = categoryAllTime.reduce((sum, c) => sum + (c._sum.amount || 0), 0);
    const todayIncome = categoryToday.reduce((sum, c) => sum + (c._sum.amount || 0), 0);

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
        profitByCategory,
        period,
      }
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du calcul du bilan financier.") };
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
  // Décalage horaire du navigateur (Date.getTimezoneOffset) : les jours du filtre sont ceux de
  // l'utilisateur, cf. src/lib/finance-period.ts.
  tzOffsetMinutes?: number;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertFinanceReadRole(activeUser);
    // Valide l'organisation demandée (jamais un identifiant arbitraire) avant de construire le filtre.
    await resolveTargetOrgId(activeUser, filters.organizationId);

    const page = Math.max(1, Math.floor(filters.page || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(filters.pageSize || MAX_PAGE_SIZE)));

    // Filtres, totaux et reste dû partagés avec l'export PDF/Excel (src/lib/finance-journal-query.ts).
    const { baseAnd, listWhere } = buildJournalWhere(activeUser, filters);

    const [transactions, totalCount, totals] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: listWhere,
        include: JOURNAL_TRANSACTION_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.financialTransaction.count({ where: listWhere }),
      getJournalTotals(baseAnd),
    ]);

    const transactionsWithInvoiceTotals = await attachInvoiceTotals(transactions);

    return {
      success: true,
      data: {
        transactions: transactionsWithInvoiceTotals,
        totalCount,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        filteredIncome: totals.income,
        filteredExpenses: totals.expenses,
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

// ---------------------------------------------------------------------------------------------
// Files pharmacie : remise (à faire) et historique (remis / annulé). Le contenu d'une facture (lignes
// PHARMACY dans un champ Json, consommables des examens) ne se filtre pas avec Prisma : ces requêtes
// passent par MongoDB directement, qui filtre, trie et pagine en base.
// ---------------------------------------------------------------------------------------------

type ActiveFinanceUser = { role: string; organizationId: string | null; organization?: { type?: string | null } | null };
type Oid = { $oid: string };

const toOid = (id: string): Oid => ({ $oid: id });
const rawId = (value: unknown): string => (typeof value === "string" ? value : (value as Oid).$oid);

// Organisations couvertes : la clinique demandée, ou la holding et ses cliniques.
async function scopeOrganizationIds(activeUser: ActiveFinanceUser, organizationId?: string): Promise<string[]> {
  if (activeUser.organization?.type === "HOLDING" && !organizationId) {
    const children = await prisma.organization.findMany({ where: { parentId: activeUser.organizationId! }, select: { id: true } });
    return [activeUser.organizationId!, ...children.map((c) => c.id)];
  }
  const targetOrgId = await resolveTargetOrgId(activeUser, organizationId);
  return targetOrgId ? [targetOrgId] : [];
}

// Factures portant au moins un consommable d'examen (LabOrder.testDetails[].consumables) : elles aussi
// se remettent au comptoir, au même titre qu'un médicament.
async function invoicesWithLabConsumables(orgIds: string[]): Promise<Oid[]> {
  const res: any = await prisma.$runCommandRaw({
    find: "LabOrder",
    filter: {
      organizationId: { $in: orgIds.map(toOid) },
      pendingInvoiceId: { $ne: null },
      testDetails: { $elemMatch: { "consumables.0": { $exists: true } } },
    },
    projection: { pendingInvoiceId: 1 },
    batchSize: 10000,
  });
  const ids = new Set<string>((res.cursor?.firstBatch || []).map((row: any) => rawId(row.pendingInvoiceId)));
  return [...ids].map(toOid);
}

// Réductions accordées sur la période (cf. src/lib/invoice-discount.ts) : total, et détail ligne
// par ligne — patient, prestation, montant, motif, qui l'a accordée. Datée du moment où la réduction
// a été accordée (à défaut, de la création du ticket). Mêmes droits que la synthèse financière.
export async function listInvoiceDiscounts(organizationId?: string, periodInput?: PeriodInput) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertFinanceReadRole(activeUser);
    const orgIds = await scopeOrganizationIds(activeUser, organizationId);
    if (orgIds.length === 0) return { success: true as const, data: { total: 0, count: 0, lines: [] as DiscountLine[] } };

    const period = resolvePeriod(periodInput);
    const range = periodCreatedAtFilter(period);
    const res: any = await prisma.$runCommandRaw({
      find: "PendingInvoice",
      filter: { organizationId: { $in: orgIds.map(toOid) }, items: { $elemMatch: { discount: { $gt: 0 } } } },
      projection: { items: 1, patientId: 1, customPatientName: 1, createdAt: 1, status: 1 },
      sort: { createdAt: -1 },
      limit: 5000,
      batchSize: 5000,
    });
    const rawDate = (v: any): Date => new Date(v?.$date ?? v);
    const lines: DiscountLine[] = [];
    for (const inv of res.cursor?.firstBatch || []) {
      const invoiceId = rawId(inv._id);
      for (const it of (inv.items as any[]) || []) {
        const discount = Math.round(Number(it?.discount) || 0);
        if (discount <= 0) continue;
        const at = it.discountAt ? new Date(it.discountAt) : rawDate(inv.createdAt);
        if (range?.gte && at < range.gte) continue;
        if (range?.lte && at > range.lte) continue;
        lines.push({
          invoiceId,
          ticketRef: `TCK-${invoiceId.slice(-6).toUpperCase()}`,
          at: at.toISOString(),
          patientId: inv.patientId ? rawId(inv.patientId) : null,
          patientName: inv.customPatientName || null,
          description: String(it.description || ""),
          gross: Math.round(Number(it.quantity) * Number(it.unitPrice)) || Math.round(Number(it.amount) || 0) + discount,
          discount,
          reason: it.discountReason || null,
          grantedById: it.discountById || null,
          grantedByName: null,
          status: String(inv.status || ""),
        });
      }
    }

    const patientIds = [...new Set(lines.map((l) => l.patientId).filter(Boolean) as string[])];
    const userIds = [...new Set(lines.map((l) => l.grantedById).filter(Boolean) as string[])];
    const [patients, users] = await Promise.all([
      patientIds.length ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } }) : [],
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    ]);
    const patientName = new Map(patients.map((p) => [p.id, `${p.user.lastName} ${p.user.firstName}`]));
    const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    for (const l of lines) {
      if (l.patientId) l.patientName = patientName.get(l.patientId) ?? l.patientName;
      if (l.grantedById) l.grantedByName = userName.get(l.grantedById) ?? null;
    }
    lines.sort((a, b) => b.at.localeCompare(a.at));
    return { success: true as const, data: { total: lines.reduce((sum, l) => sum + l.discount, 0), count: lines.length, lines } };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des réductions.") };
  }
}

type DiscountLine = {
  invoiceId: string;
  ticketRef: string;
  at: string;
  patientId: string | null;
  patientName: string | null;
  description: string;
  gross: number;
  discount: number;
  reason: string | null;
  grantedById: string | null;
  grantedByName: string | null;
  status: string;
};

// Filtre « au moins un médicament, ou un consommable d'examen ».
function dispensableClause(labInvoiceIds: Oid[]) {
  return {
    $or: [
      { items: { $elemMatch: { type: "PHARMACY" } } },
      ...(labInvoiceIds.length > 0 ? [{ _id: { $in: labInvoiceIds } }] : []),
    ],
  };
}

// Patients dont le nom correspond à la recherche : sert à filtrer l'historique côté serveur.
async function patientOidsMatching(term: string): Promise<Oid[]> {
  const patients = await prisma.patient.findMany({
    where: {
      user: {
        OR: [
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
        ],
      },
    },
    select: { id: true },
  });
  return patients.map((p) => toOid(p.id));
}

// Total exact + identifiants de la page demandée, dans l'ordre de tri.
async function rawInvoicePage(filter: Prisma.InputJsonObject, sort: Record<string, number>, page: number, pageSize: number) {
  const [countRes, findRes]: any[] = await Promise.all([
    prisma.$runCommandRaw({ count: "PendingInvoice", query: filter }),
    prisma.$runCommandRaw({
      find: "PendingInvoice",
      filter,
      sort,
      skip: (page - 1) * pageSize,
      limit: pageSize,
      projection: { _id: 1 },
    }),
  ]);
  return {
    total: Number(countRes.n ?? 0),
    ids: (findRes.cursor?.firstBatch || []).map((row: any) => rawId(row._id)) as string[],
  };
}

// Charge les factures de la page, dans l'ordre demandé, avec leurs lignes à remettre.
async function loadInvoicesInOrder(ids: string[]) {
  const rows = await prisma.pendingInvoice.findMany({
    where: { id: { in: ids } },
    include: {
      patient: { include: { user: { select: { firstName: true, lastName: true } } } },
      labOrders: { select: { testDetails: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(id)).filter((row): row is (typeof rows)[number] => row !== undefined);
  const withPaid = await attachAmountPaid(ordered);
  return withPaid.map((inv) => {
    const { cartLines, labLines } = computeDispenseLines(inv);
    return { ...inv, cartLines, labLines };
  });
}

// File de remise du comptoir : factures à remettre, pas entièrement remises, pas clôturées — quel que
// soit leur état de règlement (un patient peut repartir avec une partie de ses médicaments avant d'avoir
// tout payé). Un ticket partiellement remis reste ici tant qu'il reste quelque chose à donner.
export async function listPharmacyDispenseQueue(organizationId?: string, options?: { page?: number; pageSize?: number }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "PHARMACIE");
    assertPharmacyCatalogReadRole(activeUser);

    const { page, pageSize } = resolvePage(options);
    const orgIds = await scopeOrganizationIds(activeUser, organizationId);
    const labIds = await invoicesWithLabConsumables(orgIds);
    // { dispensedAt: null } couvre à la fois null et un champ absent (jamais écrit avant la remise).
    const filter = {
      organizationId: { $in: orgIds.map(toOid) },
      status: { $ne: "CANCELLED" },
      dispensedAt: null,
      ...dispensableClause(labIds),
    };
    const { total, ids } = await rawInvoicePage(filter, { createdAt: -1 }, page, pageSize);
    const data = await loadInvoicesInOrder(ids);
    return { success: true as const, data, total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de la file d'attente pharmacie.") };
  }
}

// Historique : factures remises (même partiellement) ou annulées, les plus récemment remises d'abord.
export async function listPharmacyDispenseHistory(organizationId?: string, options?: { search?: string; page?: number; pageSize?: number }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "PHARMACIE");
    assertPharmacyCatalogReadRole(activeUser);

    const { page, pageSize } = resolvePage(options);
    const orgIds = await scopeOrganizationIds(activeUser, organizationId);
    const labIds = await invoicesWithLabConsumables(orgIds);
    const term = options?.search?.trim();
    // Recherche : par nom de patient, ou par référence (les 6 derniers caractères de l'identifiant,
    // tels qu'imprimés sur le ticket).
    const searchClause: Prisma.InputJsonObject[] = [];
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      searchClause.push({ $expr: { $regexMatch: { input: { $substrCP: [{ $toString: "$_id" }, 18, 6] }, regex: escaped, options: "i" } } });
      searchClause.push({ patientId: { $in: await patientOidsMatching(term) } });
    }
    const filter: Prisma.InputJsonObject = {
      organizationId: { $in: orgIds.map(toOid) },
      $and: [{ $or: [{ dispensedAt: { $ne: null } }, { status: "CANCELLED" }] }, dispensableClause(labIds)],
      ...(searchClause.length > 0 ? { $or: searchClause } : {}),
    };
    const { total, ids } = await rawInvoicePage(filter, { dispensedAt: -1 }, page, pageSize);
    const data = await loadInvoicesInOrder(ids);
    return { success: true as const, data, total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de l'historique.") };
  }
}

// Créées automatiquement à la clôture d'une consultation, d'une demande labo, un envoi
// d'ordonnance, ou directement à la caisse — pas encore intégralement réglées (PENDING ou
// PARTIAL) — cf. onglet "Tickets impayés" de src/app/dashboard/caisse. Rôle de lecture aligné
// sur REGISTER_READ_ROLES. Liste paginée ; le bandeau (valeur, déjà réglé, partiels) porte sur
// toutes les factures en attente.
export async function listPendingInvoices(organizationId?: string, options?: { page?: number; pageSize?: number }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterReadRole(activeUser);

    const orgIds = await scopeOrganizationIds(activeUser, organizationId);
    const where = { status: { in: ["PENDING", "PARTIAL"] }, organizationId: { in: orgIds } };
    const { page, pageSize, skip, take } = resolvePage(options);

    const [pageRows, total, allRows] = await Promise.all([
      prisma.pendingInvoice.findMany({
        where,
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
          medicalRecord: { select: { title: true, createdAt: true } },
          // Nécessaire pour afficher le récapitulatif donné/commandé (panier + labo) dans la boîte
          // de dialogue de clôture d'un ticket non réglé (cf. closeUnpaidInvoice).
          labOrders: { select: { testDetails: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.pendingInvoice.count({ where }),
      prisma.pendingInvoice.findMany({ where, select: { id: true, status: true, items: true } }),
    ]);

    const paidAll = await attachAmountPaid(allRows);
    const summary = paidAll.reduce(
      (acc, inv) => {
        const invoiceValue = ((inv.items as any[]) || []).reduce((sum, it) => sum + Number(it.amount || 0), 0);
        acc.totalValue += invoiceValue;
        acc.totalPaid += inv.amountPaid;
        if (inv.status === "PARTIAL") acc.partialCount++;
        return acc;
      },
      { totalValue: 0, totalPaid: 0, partialCount: 0 }
    );

    const withPaid = await attachAmountPaid(pageRows);
    const withLines = withPaid.map((inv) => {
      const { cartLines, labLines } = computeDispenseLines(inv);
      return { ...inv, cartLines, labLines };
    });

    return { success: true as const, data: withLines, total, page, pageSize, summary };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des factures en attente.") };
  }
}

// Historique complet des tickets de caisse de la clinique (tous statuts : PENDING, PARTIAL, PAID, CANCELLED)
const HISTORY_STATUSES = ["PAID", "PARTIAL", "PENDING", "CANCELLED"] as const;

export async function listCaisseHistoryInvoices(
  organizationId?: string,
  options: { page?: number; pageSize?: number; status?: string; search?: string } = {}
) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterReadRole(activeUser);

    const where: Prisma.PendingInvoiceWhereInput = {};
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      where.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else {
      const targetOrgId = await resolveTargetOrgId(activeUser, organizationId);
      if (targetOrgId) where.organizationId = targetOrgId;
    }

    if (options.status && (HISTORY_STATUSES as readonly string[]).includes(options.status)) {
      where.status = options.status;
    }

    const search = options.search?.trim();
    if (search) {
      where.AND = [
        {
          OR: [
            { customPatientName: { contains: search, mode: "insensitive" } },
            { customPatientPhone: { contains: search } },
            {
              patient: {
                user: {
                  OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search } },
                  ],
                },
              },
            },
          ],
        },
      ];
    }

    const pageSize = Math.min(Math.max(options.pageSize ?? MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(options.page ?? 1, 1);

    const [invoices, total] = await Promise.all([
      prisma.pendingInvoice.findMany({
        where,
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } },
          medicalRecord: { select: { title: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.pendingInvoice.count({ where }),
    ]);

    return { success: true, data: await attachAmountPaid(invoices), total, page, pageSize };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de l'historique des tickets.") };
  }
}
