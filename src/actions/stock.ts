"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";
import { assertItemPurchasable } from "@/lib/pharmacy-sale-block";
import { applyLotConsumption, groupIdsByValue, planLotConsumption, setField } from "@/lib/stock-batch";
import { buildInventoryReport } from "@/lib/inventory-report";
import { recordStockPurchaseSchema, saveInventoryCountsSchema, setPharmacyItemSaleBlockSchema } from "@/validators/stock";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// maxDuration (limite de durée Vercel pour les Server Actions définies ici, cf. saveInventoryCounts/
// completeInventoryCount) NE PEUT PAS être exporté depuis ce fichier : un fichier "use server"
// n'autorise que des exports de fonctions async — voir plutôt les page.tsx qui rendent
// InventoryPanel (dashboard/clinics/[id]/pharmacie, dashboard/clinics/[id]/finance, etc.).

const STOCK_READ_ROLES = ["ADMIN", "COORDINATOR", "PHARMACIST"];
const STOCK_WRITE_ROLES = ["COORDINATOR", "PHARMACIST"];

// ADMIN (holding) garde une vue lecture seule du stock/pharmacie ; seuls COORDINATOR
// et PHARMACIST peuvent enregistrer des mouvements (achats, inventaire).
// Exportées pour être réutilisées par suppliers.ts/purchase-orders.ts (mêmes rôles,
// évite toute divergence entre fichiers).
export async function assertStockRead(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (!STOCK_READ_ROLES.includes(activeUser.role)) {
    throw new Error("Non autorisé.");
  }
}

// Filtre "ce champ est vide" fiable sur MongoDB : { champ: null } ne retrouve QUE les documents où
// le champ vaut explicitement null, pas ceux où il est simplement ABSENT (tout document créé
// avant l'ajout du champ, ou par une création qui ne l'écrit pas) — il faut aussi isSet: false.
// Vérifié sur les données réelles : absorbedByPurchaseId: null renvoyait 0 retrait sur 108,
// isSet: false les 108. À utiliser à la place de { champ: null } dans tout where sur un champ
// optionnel ajouté après coup. À étaler dans le where : { id, ...fieldIsEmpty("champ") }.
function fieldIsEmpty(field: string): any {
  return { OR: [{ [field]: null }, { [field]: { isSet: false } }] };
}

export async function assertStockWrite(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (!STOCK_WRITE_ROLES.includes(activeUser.role)) {
    throw new Error("Non autorisé. Réservé aux coordinateurs et pharmaciens.");
  }
  await requirePermission(activeUser.role, "MANAGE_STOCK");
}

/**
 * Consomme `quantity` unités du stock d'un produit en puisant dans les lots
 * d'achat par ordre FEFO (péremption la plus proche d'abord, puis achat le
 * plus ancien). Doit être appelé à l'intérieur de la même transaction Prisma
 * que le décrément de PharmacyItem.stockQuantity, pour garder les lots
 * cohérents avec le compteur agrégé.
 */
export async function consumeStockLots(tx: any, pharmacyItemId: string, quantity: number) {
  let remaining = quantity;
  let consumedCost = 0;

  const lots = await tx.stockPurchase.findMany({
    where: { pharmacyItemId, remainingQuantity: { gt: 0 } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
  });

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingQuantity, remaining);
    await tx.stockPurchase.update({
      where: { id: lot.id },
      data: { remainingQuantity: { decrement: take } },
    });
    consumedCost += take * lot.purchasePrice;
    remaining -= take;
  }

  // Si les lots enregistrés ne couvrent pas toute la quantité (ex: stock hérité
  // d'avant la mise en place du suivi par achat), on ne bloque pas l'opération :
  // la portion non couverte n'est simplement pas valorisée par lot.
  return { consumedCost, unmatchedQuantity: remaining };
}

// Coût moyen pondéré des lots restants de plusieurs produits en UN seul aller-retour (pas de
// requête par produit) — utilisée par getFinanceSummary pour valoriser les consommables labo d'un
// lot de LabOrder, et par l'inventaire (démarrage, rattrapage, surplus à la clôture). Un produit
// sans aucun lot restant est absent de la map.
export async function getItemUnitCostMap(pharmacyItemIds: string[], client: any = prisma): Promise<Map<string, number>> {
  if (pharmacyItemIds.length === 0) return new Map();
  const lots = await client.stockPurchase.findMany({
    where: { pharmacyItemId: { in: pharmacyItemIds }, remainingQuantity: { gt: 0 } },
  });
  const totals = new Map<string, { qty: number; cost: number }>();
  for (const lot of lots) {
    const acc = totals.get(lot.pharmacyItemId) || { qty: 0, cost: 0 };
    acc.qty += lot.remainingQuantity;
    acc.cost += lot.remainingQuantity * lot.purchasePrice;
    totals.set(lot.pharmacyItemId, acc);
  }
  const result = new Map<string, number>();
  for (const [id, { qty, cost }] of totals) {
    if (qty > 0) result.set(id, cost / qty);
  }
  return result;
}

// Applique une réception de stock sur un article déjà existant : crée le lot StockPurchase,
// incrémente PharmacyItem.stockQuantity, crée la FinancialTransaction correspondante. Réutilisée
// par recordStockPurchase (saisie manuelle) et receivePurchaseOrders.receivePurchaseOrderLines
// (réception de commande fournisseur) — un seul endroit pour cette logique transactionnelle.
export async function applyStockReceipt(
  tx: any,
  data: {
    pharmacyItemId: string;
    itemName: string;
    quantity: number;
    purchasePrice: number;
    supplier?: string | null;
    batchNumber?: string | null;
    expiryDate?: Date | null;
    invoiceRef?: string | null;
    purchasedById: string;
    organizationId?: string | null;
    cashSessionId?: string | null;
  }
) {
  const totalCost = data.quantity * data.purchasePrice;

  // Incrémenté avant la création du lot pour connaître stockBefore/stockAfter sans lecture
  // supplémentaire : la valeur retournée par update() est déjà celle d'APRÈS incrément.
  const updatedItem = await tx.pharmacyItem.update({
    where: { id: data.pharmacyItemId },
    data: { stockQuantity: { increment: data.quantity } },
  });
  const stockAfter = updatedItem.stockQuantity;
  const stockBefore = stockAfter - data.quantity;

  const purchase = await tx.stockPurchase.create({
    data: {
      pharmacyItemId: data.pharmacyItemId,
      quantity: data.quantity,
      remainingQuantity: data.quantity,
      purchasePrice: data.purchasePrice,
      totalCost,
      stockBefore,
      stockAfter,
      supplier: data.supplier || null,
      batchNumber: data.batchNumber || null,
      expiryDate: data.expiryDate || null,
      invoiceRef: data.invoiceRef || null,
      purchasedById: data.purchasedById,
      organizationId: data.organizationId || null,
    },
  });

  const transaction = await tx.financialTransaction.create({
    data: {
      type: "EXPENSE",
      category: "PHARMACY_PURCHASE",
      amount: totalCost,
      description: `Achat pharmacie : ${data.quantity}x ${data.itemName}`,
      pharmacyItemId: data.pharmacyItemId,
      stockPurchaseId: purchase.id,
      quantity: data.quantity,
      recordedById: data.purchasedById,
      organizationId: data.organizationId || null,
      ...(data.cashSessionId ? { cashSessionId: data.cashSessionId } : {}),
    },
  });

  return { purchase, transaction };
}

export async function recordStockPurchase(data: {
  pharmacyItemId?: string;
  newItem?: {
    name: string;
    dosage?: string;
    category?: string;
    unitPrice: number;
    reorderLevel?: number;
    location?: string;
  };
  quantity: number;
  purchasePrice?: number;
  supplier?: string;
  batchNumber?: string;
  expiryDate?: string;
  invoiceRef?: string;
  organizationId?: string;
  cashSessionId?: string;
  linkedExpenseTransactionId?: string;
}) {
  try {
    recordStockPurchaseSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const targetOrgId = data.organizationId || activeUser!.organizationId;
    const quantity = Number(data.quantity);
    const expiry = data.expiryDate ? new Date(data.expiryDate) : null;

    if (data.cashSessionId) {
      const session = await prisma.cashSession.findUnique({ where: { id: data.cashSessionId } });
      if (!session || session.status !== "OPEN") {
        throw new Error("Aucune session de caisse ouverte. Sélectionnez une caisse ouverte pour décaisser cet achat.");
      }
      if (session.organizationId !== targetOrgId) {
        throw new Error("Cette caisse n'appartient pas à l'établissement de cet achat.");
      }
    }

    // Vérification préalable (message clair) — la réclamation définitive et à l'abri des accès
    // concurrents se fait juste en dessous, dans la transaction (updateMany conditionnel).
    if (data.linkedExpenseTransactionId) {
      const linked = await prisma.financialTransaction.findUnique({ where: { id: data.linkedExpenseTransactionId } });
      if (!linked || linked.type !== "EXPENSE" || linked.category !== "OPERATIONAL_EXPENSE") {
        throw new Error("Ce retrait de caisse est introuvable.");
      }
      if (linked.organizationId !== targetOrgId) {
        throw new Error("Ce retrait n'appartient pas à l'établissement de cet achat.");
      }
      if (linked.absorbedByPurchaseId) {
        throw new Error("Ce retrait a déjà été utilisé pour régler un autre achat.");
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let itemId = data.pharmacyItemId;
      let itemName: string;

      if (!itemId) {
        const created = await tx.pharmacyItem.create({
          data: {
            name: data.newItem!.name,
            dosage: data.newItem!.dosage || null,
            category: (data.newItem!.category as any) || "MEDICATION",
            stockQuantity: 0,
            reorderLevel: data.newItem!.reorderLevel ?? 10,
            unitPrice: data.newItem!.unitPrice,
            location: data.newItem!.location || null,
            organizationId: targetOrgId,
          },
        });
        itemId = created.id;
        itemName = created.name;
      } else {
        const existing = await tx.pharmacyItem.findUnique({ where: { id: itemId } });
        if (!existing) throw new Error("Produit introuvable.");
        // Un produit bloqué par le coordinateur ne peut plus recevoir de nouveau stock (rappel de
        // lot, périmé...) — refusé avant toute écriture de la transaction.
        assertItemPurchasable(existing);
        itemName = existing.name;
      }

      // Prix d'achat optionnel pour un produit déjà au catalogue : à défaut de saisie, reprend
      // le dernier prix d'achat enregistré pour ce produit — évite d'obliger le personnel à
      // ressaisir un prix inchangé à chaque réassort. Requis en revanche pour un nouveau produit
      // (aucun historique à réutiliser), déjà garanti par recordStockPurchaseSchema.
      let purchasePrice: number;
      if (data.purchasePrice !== undefined) {
        purchasePrice = Number(data.purchasePrice);
      } else {
        const lastPurchase = await tx.stockPurchase.findFirst({
          where: { pharmacyItemId: itemId! },
          orderBy: { createdAt: "desc" },
        });
        if (!lastPurchase) {
          throw new Error("Aucun historique d'achat pour ce produit : le prix d'achat est requis pour ce premier enregistrement.");
        }
        purchasePrice = lastPurchase.purchasePrice;
      }

      const { purchase, transaction } = await applyStockReceipt(tx, {
        pharmacyItemId: itemId!,
        itemName,
        quantity,
        purchasePrice,
        supplier: data.supplier,
        batchNumber: data.batchNumber,
        expiryDate: expiry,
        invoiceRef: data.invoiceRef,
        purchasedById: activeUser!.id,
        organizationId: targetOrgId,
        cashSessionId: data.cashSessionId,
      });

      // Réclamation à l'abri des accès concurrents : conditionnée à absorbedByPurchaseId encore
      // null, pour qu'un seul achat puisse régler un retrait donné même si deux enregistrements
      // se chevauchent. count === 0 signifie qu'un autre achat l'a réclamé entre-temps (ou qu'il
      // a été supprimé) — on annule alors toute la transaction plutôt que de laisser un achat
      // orphelin sans le retrait qu'il était censé régler.
      if (data.linkedExpenseTransactionId) {
        const claimed = await tx.financialTransaction.updateMany({
          where: { id: data.linkedExpenseTransactionId, ...fieldIsEmpty("absorbedByPurchaseId") },
          data: { absorbedByPurchaseId: transaction.id },
        });
        if (claimed.count === 0) {
          throw new Error("Ce retrait a déjà été utilisé pour régler un autre achat.");
        }
      }

      return { purchase, transaction, pharmacyItemId: itemId };
    });

    await logAuditAction(activeUser!.id, "RECORD_STOCK_PURCHASE", "PharmacyItem", result.pharmacyItemId, {
      quantity,
      purchasePrice: result.purchase.purchasePrice,
      totalCost: quantity * result.purchase.purchasePrice,
      linkedExpenseTransactionId: data.linkedExpenseTransactionId,
    });

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'achat.") };
  }
}

// Retraits "Nouvelle dépense" (cf. recordExpense, catégorie OPERATIONAL_EXPENSE) pas encore
// réclamés par un achat pharmacie — alimente le sélecteur "Ce montant provient-il d'un retrait
// déjà enregistré ?" de stock-purchase-dialog.tsx quand l'achat n'est volontairement pas décaissé
// une seconde fois d'une caisse (cf. recordStockPurchase, linkedExpenseTransactionId). Fenêtre de
// 30 jours : un retrait plus ancien jamais réglé par un achat est probablement une vraie dépense
// distincte, pas un oubli de liaison.
export async function getAvailableExpenseWithdrawals(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const targetOrgId = organizationId || activeUser!.organizationId;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const withdrawals = await prisma.financialTransaction.findMany({
      where: {
        type: "EXPENSE",
        category: "OPERATIONAL_EXPENSE",
        ...fieldIsEmpty("absorbedByPurchaseId"),
        organizationId: targetOrgId || undefined,
        createdAt: { gte: since },
      },
      select: { id: true, description: true, amount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return { success: true, data: withdrawals };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des retraits disponibles.") };
  }
}

// Bloque (ou débloque) la vente d'un médicament à la caisse — réservé au COORDINATOR, volontairement
// plus strict que assertStockWrite (COORDINATOR + PHARMACIST) : c'est une décision de supervision
// (rappel de lot, produit périmé, retrait commercial...), pas une opération de stock courante, et
// ni le caissier qui subit le blocage ni le pharmacien ne doivent pouvoir le lever eux-mêmes.
// Bloquer exige un motif, affiché à la caisse pour que le caissier comprenne pourquoi le produit
// est indisponible. N'empêche pas la remise d'un ticket déjà émis : seule la création/modification
// de ticket est visée (cf. assertPharmacyItemsSellable dans finance.ts).
export async function setPharmacyItemSaleBlock(data: { pharmacyItemId: string; blocked: boolean; reason?: string }) {
  try {
    setPharmacyItemSaleBlockSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    if (activeUser.role !== "COORDINATOR") {
      throw new Error("Non autorisé. Seul le coordinateur peut bloquer ou débloquer la vente d'un médicament.");
    }

    const item = await prisma.pharmacyItem.findUnique({ where: { id: data.pharmacyItemId } });
    if (!item) throw new Error("Produit introuvable.");
    if (item.organizationId !== activeUser.organizationId) {
      throw new Error("Non autorisé. Ce produit n'appartient pas à votre établissement.");
    }

    const reason = data.reason?.trim() || null;
    await prisma.pharmacyItem.update({
      where: { id: data.pharmacyItemId },
      data: data.blocked
        ? { saleBlockedAt: new Date(), saleBlockedReason: reason, saleBlockedById: activeUser.id }
        : { saleBlockedAt: null, saleBlockedReason: null, saleBlockedById: null },
    });

    await logAuditAction(
      activeUser.id,
      data.blocked ? "BLOCK_PHARMACY_ITEM_SALE" : "UNBLOCK_PHARMACY_ITEM_SALE",
      "PharmacyItem",
      data.pharmacyItemId,
      { itemName: item.name, reason }
    );
    revalidatePath("/dashboard/pharmacie");
    revalidatePath(`/dashboard/clinics/${item.organizationId}/pharmacie`);
    revalidatePath(`/dashboard/clinics/${item.organizationId}/caisse`);
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la modification du blocage de vente.") };
  }
}

// Suppression d'un produit du catalogue — voir checkPharmacyItemDeletable pour ce qui l'autorise
// ou l'interdit. Volontairement réservée au COORDINATOR (comme l'annulation d'un achat et le
// blocage de vente) : détruire une fiche produit est une décision de supervision.
function assertCoordinatorForCatalog(activeUser: any, action: string) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (activeUser.role !== "COORDINATOR") {
    throw new Error(`Non autorisé. Seul le coordinateur peut ${action}.`);
  }
}

// Un produit n'est supprimable que s'il n'a AUCUN historique comptable ou opérationnel à
// préserver. Sinon la suppression laisserait des écritures (achats, pertes d'inventaire, ventes en
// cours...) pointer vers un produit disparu, et effacerait rétroactivement le coût d'achat déjà
// compté dans les rapports financiers. Dans ce cas, "Bloquer la vente" reste l'alternative : il
// retire le produit de la caisse sans toucher à l'historique.
//
// Ne bloquent PAS (retirés avec le produit) : les lots d'achat jamais entamés sans écriture
// comptable associée (typiquement le stock amorcé par import CSV), et les lignes d'un inventaire
// non clôturé — un inventaire en cours se poursuit simplement sans ce produit. Les lignes
// d'ordonnance perdent leur rattachement au catalogue (le libellé du médicament, lui, reste).
async function checkPharmacyItemDeletable(item: { id: string; organizationId: string | null }) {
  const [transactionCount, adjustmentCount, lots, closedInventoryLines, removableInventoryLines, purchaseOrderLines, labTests, openInvoices] =
    await Promise.all([
      prisma.financialTransaction.count({ where: { pharmacyItemId: item.id } }),
      prisma.stockAdjustment.count({ where: { pharmacyItemId: item.id } }),
      prisma.stockPurchase.findMany({ where: { pharmacyItemId: item.id }, select: { quantity: true, remainingQuantity: true } }),
      prisma.inventoryCountLine.count({ where: { pharmacyItemId: item.id, inventoryCount: { status: "COMPLETED" } } }),
      prisma.inventoryCountLine.count({ where: { pharmacyItemId: item.id, inventoryCount: { status: { not: "COMPLETED" } } } }),
      prisma.purchaseOrderLine.count({ where: { pharmacyItemId: item.id } }),
      prisma.labTest.findMany({ where: { organizationId: item.organizationId }, select: { name: true, consumables: true } }),
      prisma.pendingInvoice.findMany({
        where: { organizationId: item.organizationId, status: { not: "CANCELLED" }, ...fieldIsEmpty("dispensedAt") },
        select: { items: true, labOrders: { select: { testDetails: true } } },
      }),
    ]);

  const blockers: string[] = [];
  if (transactionCount > 0) {
    blockers.push(`${transactionCount} écriture(s) comptable(s) (achats, pertes d'inventaire) y sont rattachées.`);
  }
  if (adjustmentCount > 0) blockers.push(`${adjustmentCount} ajustement(s) de stock y sont rattachés.`);
  const consumedLots = lots.filter((l) => l.remainingQuantity !== l.quantity).length;
  if (consumedLots > 0) blockers.push(`${consumedLots} lot(s) d'achat ont déjà été en partie vendus ou consommés.`);
  if (closedInventoryLines > 0) blockers.push(`Il figure dans ${closedInventoryLines} inventaire(s) déjà clôturé(s).`);
  if (purchaseOrderLines > 0) blockers.push(`Il figure dans ${purchaseOrderLines} ligne(s) de commande fournisseur.`);

  const usedByLabTests = labTests
    .filter((t) => Array.isArray(t.consumables) && (t.consumables as any[]).some((c) => c?.pharmacyItemId === item.id))
    .map((t) => t.name);
  if (usedByLabTests.length > 0) {
    blockers.push(`Il est utilisé dans la recette de l'examen labo : ${usedByLabTests.join(", ")}.`);
  }

  const openTickets = openInvoices.filter(
    (inv) =>
      ((inv.items as any[]) || []).some((i) => i?.pharmacyItemId === item.id) ||
      (inv.labOrders || []).some((lo) =>
        ((lo.testDetails as any[]) || []).some((td) => (td?.consumables || []).some((c: any) => c?.pharmacyItemId === item.id))
      )
  ).length;
  if (openTickets > 0) blockers.push(`Il figure dans ${openTickets} ticket(s) en cours (à régler ou à remettre).`);

  return { blockers, lotsToRemove: lots.length, inventoryLinesToRemove: removableInventoryLines };
}

// Ce que la suppression ferait, sans rien modifier : alimente la boîte de confirmation (qui liste
// les blocages tout de suite plutôt que de laisser l'utilisateur les découvrir en cliquant).
export async function getPharmacyItemDeletionInfo(pharmacyItemId: string) {
  try {
    z.string().min(1).parse(pharmacyItemId);
    const activeUser = await getCurrentUser();
    assertCoordinatorForCatalog(activeUser, "supprimer un produit");

    const item = await prisma.pharmacyItem.findUnique({ where: { id: pharmacyItemId } });
    if (!item) throw new Error("Produit introuvable.");
    if (item.organizationId !== activeUser!.organizationId) {
      throw new Error("Non autorisé. Ce produit n'appartient pas à votre établissement.");
    }

    const check = await checkPharmacyItemDeletable(item);
    return {
      success: true,
      data: { name: item.name, dosage: item.dosage, stockQuantity: item.stockQuantity, ...check },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la vérification du produit.") };
  }
}

export async function deletePharmacyItem(pharmacyItemId: string) {
  try {
    z.string().min(1).parse(pharmacyItemId);
    const activeUser = await getCurrentUser();
    assertCoordinatorForCatalog(activeUser, "supprimer un produit");

    const item = await prisma.pharmacyItem.findUnique({ where: { id: pharmacyItemId } });
    if (!item) throw new Error("Produit introuvable.");
    if (item.organizationId !== activeUser!.organizationId) {
      throw new Error("Non autorisé. Ce produit n'appartient pas à votre établissement.");
    }

    const check = await checkPharmacyItemDeletable(item);
    if (check.blockers.length > 0) {
      throw new Error(`Suppression impossible : ${check.blockers.join(" ")}`);
    }

    // À ce stade, tout lot restant est intact et sans écriture comptable, et toute ligne
    // d'inventaire restante appartient à un inventaire non clôturé (cf. checkPharmacyItemDeletable).
    await prisma.$transaction(async (tx) => {
      await tx.stockPurchase.deleteMany({ where: { pharmacyItemId } });
      await tx.inventoryCountLine.deleteMany({ where: { pharmacyItemId } });
      await tx.prescriptionItem.updateMany({ where: { pharmacyItemId }, data: { pharmacyItemId: null } });
      await tx.pharmacyItem.delete({ where: { id: pharmacyItemId } });
    });

    await logAuditAction(activeUser!.id, "DELETE_PHARMACY_ITEM", "PharmacyItem", pharmacyItemId, {
      name: item.name,
      dosage: item.dosage,
      stockQuantity: item.stockQuantity,
      removedLots: check.lotsToRemove,
      removedInventoryLines: check.inventoryLinesToRemove,
    });
    revalidatePath("/dashboard/pharmacie");
    revalidatePath(`/dashboard/clinics/${item.organizationId}/pharmacie`);
    revalidatePath(`/dashboard/clinics/${item.organizationId}/caisse`);
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la suppression du produit.") };
  }
}

// Annule un achat pharmacie erroné (saisie manuelle) : décrémente le stock, supprime le lot et sa
// dépense associée. Réservé aux lots dont AUCUNE unité n'a encore été consommée
// (remainingQuantity === quantity) — dès qu'une seule unité a été vendue, remise ou reprise dans
// un ajustement, la reprendre spécifiquement dans ce lot devient ambigu (cf. le même choix pour
// cancelDispense : tout-ou-rien plutôt qu'une correction partielle potentiellement fausse). Ne
// s'applique jamais à un lot "AJUSTEMENT-INVENTAIRE"/"ANNULATION-REMISE" : ce ne sont pas des
// achats, ils n'ont pas leur place ici.
//
// Avant ce correctif, la seule façon de rattraper un achat saisi par erreur était de passer par
// l'inventaire (constater une "perte" équivalente) — ce qui laisse l'achat erroné ET la perte
// compensatoire compter chacun comme une dépense séparée (double comptage), au lieu d'annuler
// proprement l'écriture d'origine.
export async function cancelStockPurchase(stockPurchaseId: string, reason?: string) {
  try {
    z.string().min(1).parse(stockPurchaseId);
    const activeUser = await getCurrentUser();
    // COORDINATOR uniquement, volontairement plus strict que assertStockWrite (qui laisse aussi
    // le PHARMACIST enregistrer un achat) : effacer une écriture financière déjà passée est une
    // décision de supervision — celui qui a saisi l'achat ne doit pas pouvoir le faire disparaître
    // seul, même pour corriger sa propre erreur.
    if (!activeUser) throw new Error("Non authentifié.");
    if (activeUser.role !== "COORDINATOR") {
      throw new Error("Non autorisé. Seul le coordinateur peut annuler un achat.");
    }

    const purchase = await prisma.stockPurchase.findUnique({
      where: { id: stockPurchaseId },
      include: { pharmacyItem: { select: { name: true } }, financialTransactions: true },
    });
    if (!purchase) throw new Error("Achat introuvable.");
    if (purchase.organizationId && purchase.organizationId !== activeUser.organizationId) {
      throw new Error("Non autorisé. Cet achat n'appartient pas à votre établissement.");
    }

    if (purchase.batchNumber === "AJUSTEMENT-INVENTAIRE" || purchase.batchNumber === "ANNULATION-REMISE") {
      throw new Error("Ce lot n'est pas un achat direct (surplus d'inventaire ou retour de remise annulée) : il ne peut pas être annulé ici.");
    }
    if (purchase.remainingQuantity !== purchase.quantity) {
      const consumed = purchase.quantity - purchase.remainingQuantity;
      throw new Error(
        `Impossible d'annuler cet achat : ${consumed} unité(s) sur ${purchase.quantity} ont déjà été vendues, remises ou consommées d'une autre façon.`
      );
    }

    const hasLinkedExpense = purchase.financialTransactions.length > 0;

    await prisma.$transaction(async (tx) => {
      await tx.pharmacyItem.update({
        where: { id: purchase.pharmacyItemId },
        data: { stockQuantity: { decrement: purchase.quantity } },
      });

      for (const t of purchase.financialTransactions) {
        // Un retrait de caisse absorbé par cet achat (cf. linkedExpenseTransactionId) redevient
        // une dépense normale : l'achat qu'il finançait est annulé, mais le retrait a bien eu lieu.
        await tx.financialTransaction.updateMany({
          where: { absorbedByPurchaseId: t.id },
          data: { absorbedByPurchaseId: null },
        });
        await tx.financialTransaction.delete({ where: { id: t.id } });
      }

      await tx.stockPurchase.delete({ where: { id: stockPurchaseId } });
    });

    await logAuditAction(activeUser!.id, "CANCEL_STOCK_PURCHASE", "StockPurchase", stockPurchaseId, {
      pharmacyItemId: purchase.pharmacyItemId,
      quantity: purchase.quantity,
      totalCost: purchase.totalCost,
      hasLinkedExpense,
      reason: reason || null,
    });
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return {
      success: true,
      data: {
        // Achat antérieur au lien StockPurchase<->FinancialTransaction (cf. schema) : le stock a
        // bien été corrigé, mais aucune dépense n'a pu être retrouvée/retirée automatiquement.
        warning: hasLinkedExpense
          ? null
          : "Aucune dépense associée n'a été retrouvée pour cet achat (probablement antérieur à cette fonctionnalité) : seul le stock a été corrigé, vérifiez manuellement le journal des dépenses.",
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'annulation de l'achat.") };
  }
}

export async function getStockPurchaseHistory(organizationId?: string, pharmacyItemId?: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const where: any = {};
    if (pharmacyItemId) where.pharmacyItemId = pharmacyItemId;
    const targetOrgId = organizationId || activeUser!.organizationId;
    if (targetOrgId) where.organizationId = targetOrgId;

    const purchases = await prisma.stockPurchase.findMany({
      where,
      include: {
        pharmacyItem: { select: { name: true, dosage: true } },
        purchasedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return { success: true, data: purchases };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de l'historique des achats.") };
  }
}

export async function getStockValuation(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const targetOrgId = organizationId || activeUser!.organizationId;
    const orgFilter = targetOrgId ? { organizationId: targetOrgId } : {};

    const items = await prisma.pharmacyItem.findMany({ where: orgFilter });
    const lots = await prisma.stockPurchase.findMany({
      where: { remainingQuantity: { gt: 0 }, ...orgFilter },
    });

    const costByItem = new Map<string, number>();
    for (const lot of lots) {
      costByItem.set(
        lot.pharmacyItemId,
        (costByItem.get(lot.pharmacyItemId) || 0) + lot.remainingQuantity * lot.purchasePrice
      );
    }

    let totalCostValue = 0;
    let totalSaleValue = 0;
    const byCategoryMap = new Map<string, { costValue: number; saleValue: number }>();
    const byLocationMap = new Map<string, { costValue: number; saleValue: number }>();

    for (const item of items) {
      const costValue = costByItem.get(item.id) || 0;
      const saleValue = item.stockQuantity * item.unitPrice;
      totalCostValue += costValue;
      totalSaleValue += saleValue;

      const catEntry = byCategoryMap.get(item.category) || { costValue: 0, saleValue: 0 };
      catEntry.costValue += costValue;
      catEntry.saleValue += saleValue;
      byCategoryMap.set(item.category, catEntry);

      const locKey = item.location || "Non renseigné";
      const locEntry = byLocationMap.get(locKey) || { costValue: 0, saleValue: 0 };
      locEntry.costValue += costValue;
      locEntry.saleValue += saleValue;
      byLocationMap.set(locKey, locEntry);
    }

    return {
      success: true,
      data: {
        totalCostValue,
        totalSaleValue,
        potentialMargin: totalSaleValue - totalCostValue,
        byCategory: Array.from(byCategoryMap.entries()).map(([category, v]) => ({ category, ...v })),
        byLocation: Array.from(byLocationMap.entries()).map(([location, v]) => ({ location, ...v })),
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du calcul de la valorisation du stock.") };
  }
}

// Maintient le comptage EN COURS aligné sur le catalogue/stock réels tant qu'une ligne n'a pas
// encore été comptée :
// 1. Ajoute toute ligne manquante pour un produit créé APRÈS le démarrage de cet inventaire
//    (nouvel achat de produit inédit, import CSV, réception de commande fournisseur, création
//    manuelle...) — sans ce rattrapage, ces produits n'apparaissaient jamais dans l'inventaire
//    tant qu'un nouveau n'était pas redémarré : le badge "Stock (N)" (catalogue actuel, toujours
//    à jour) et le "N produit(s) à compter" de l'inventaire (figé au démarrage) divergeaient
//    silencieusement.
// 2. Rafraîchit systemQuantity des lignes PAS ENCORE comptées si le stock a bougé depuis le
//    démarrage (un ravitaillement reçu pendant que l'inventaire reste ouvert, cf. recordStockPurchase)
//    — sans ça, le pharmacien verrait une "Stock système" obsolète pendant qu'il compte, et
//    saisir la vraie quantité physique aujourd'hui produirait un écart de surplus fictif
//    (le ravitaillement, déjà comptabilisé par son propre achat, serait compté une deuxième fois
//    comme "surplus trouvé"). Les lignes DÉJÀ comptées ne sont volontairement jamais retouchées
//    ici : systemQuantity y représente "ce que le système disait au moment du comptage physique"
//    (cf. saveInventoryCounts, qui la fige à cet instant précis) — completeInventoryCount détecte
//    séparément un mouvement survenu APRÈS ce comptage.
// Idempotent ; appelée à la fois à la lecture (getActiveInventoryCount) et à la clôture
// (completeInventoryCount) pour rester correcte même si le client affiche une version pas tout à
// fait à jour. Retourne true si quelque chose a changé.
async function syncInventoryCountLines(inventoryCountId: string, organizationId: string): Promise<boolean> {
  const count = await prisma.inventoryCount.findUnique({
    where: { id: inventoryCountId },
    select: { lines: { select: { id: true, pharmacyItemId: true, countedQuantity: true, systemQuantity: true } } },
  });
  if (!count) return false;
  const existingIds = new Set(count.lines.map((l) => l.pharmacyItemId));

  const allItems = await prisma.pharmacyItem.findMany({
    where: { organizationId },
    select: { id: true, stockQuantity: true },
  });
  let changed = false;

  // Écritures groupées (cf. src/lib/stock-batch.ts) : une requête par produit manquant / par ligne
  // périmée dépassait la durée maximale de la fonction sur un catalogue de plusieurs centaines de
  // produits, à ~330ms l'aller-retour vers la base depuis Vercel.
  const missingItems = allItems.filter((item) => !existingIds.has(item.id));
  if (missingItems.length > 0) {
    const costByItem = await getItemUnitCostMap(missingItems.map((item) => item.id));
    await prisma.inventoryCountLine.createMany({
      data: missingItems.map((item) => ({
        inventoryCountId,
        pharmacyItemId: item.id,
        systemQuantity: item.stockQuantity,
        unitCost: costByItem.get(item.id) ?? null,
      })),
    });
    changed = true;
  }

  const itemById = new Map(allItems.map((item) => [item.id, item]));
  const staleLines: Array<[string, number]> = [];
  for (const line of count.lines) {
    if (line.countedQuantity !== null) continue;
    const item = itemById.get(line.pharmacyItemId);
    if (item && item.stockQuantity !== line.systemQuantity) staleLines.push([line.id, item.stockQuantity]);
  }
  for (const [systemQuantity, lineIds] of groupIdsByValue(staleLines)) {
    await setField(prisma.inventoryCountLine, lineIds, "systemQuantity", systemQuantity);
    changed = true;
  }

  return changed;
}

export async function startInventoryCount(organizationId: string) {
  try {
    z.string().min(1, "Établissement requis").parse(organizationId);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const existing = await prisma.inventoryCount.findFirst({
      where: { organizationId, status: "IN_PROGRESS" },
    });
    if (existing) {
      throw new Error("Un inventaire est déjà en cours pour cet établissement.");
    }

    const items = await prisma.pharmacyItem.findMany({ where: { organizationId } });

    // Un seul aller-retour pour les coûts de tout le catalogue (au lieu d'une requête par produit).
    const costByItem = await getItemUnitCostMap(items.map((item) => item.id));
    const lines = items.map((item) => ({
      pharmacyItemId: item.id,
      systemQuantity: item.stockQuantity,
      unitCost: costByItem.get(item.id) ?? null,
    }));

    const inventoryCount = await prisma.inventoryCount.create({
      data: {
        organizationId,
        startedById: activeUser!.id,
        lines: { create: lines },
      },
      include: {
        lines: { include: { pharmacyItem: { select: { name: true, dosage: true, category: true } } } },
      },
    });

    await logAuditAction(activeUser!.id, "START_INVENTORY_COUNT", "InventoryCount", inventoryCount.id);
    revalidatePath("/dashboard/finance");

    return { success: true, data: inventoryCount };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du démarrage de l'inventaire.") };
  }
}

export async function getActiveInventoryCount(organizationId: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const includeLines = {
      lines: {
        include: { pharmacyItem: { select: { name: true, dosage: true, category: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    };

    let inventoryCount = await prisma.inventoryCount.findFirst({
      where: { organizationId, status: "IN_PROGRESS" },
      include: includeLines,
    });

    if (inventoryCount) {
      const added = await syncInventoryCountLines(inventoryCount.id, organizationId);
      if (added) {
        inventoryCount = await prisma.inventoryCount.findFirst({
          where: { id: inventoryCount.id },
          include: includeLines,
        });
      }
    }

    return { success: true, data: inventoryCount };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de l'inventaire en cours.") };
  }
}

export async function saveInventoryCounts(
  inventoryCountId: string,
  lines: { lineId: string; countedQuantity: number }[]
) {
  try {
    saveInventoryCountsSchema.parse({ inventoryCountId, lines });
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const count = await prisma.inventoryCount.findUnique({ where: { id: inventoryCountId }, include: { lines: true } });
    if (!count || count.status !== "IN_PROGRESS") {
      throw new Error("Cet inventaire n'est plus modifiable.");
    }

    // Fige systemQuantity à SA valeur actuelle au moment précis où le comptage physique est
    // saisi — pas la valeur figée au démarrage de l'inventaire, potentiellement obsolète si un
    // ravitaillement a été reçu entretemps (cf. recordStockPurchase pendant un inventaire resté
    // ouvert). L'écart calculé à la clôture compare ainsi toujours le comptage à ce que le
    // système disait réellement à cet instant, pas à une photo prise plusieurs jours avant.
    const lineById = new Map(count.lines.map((l) => [l.id, l]));
    const pharmacyItemIds = lines
      .map((l) => lineById.get(l.lineId)?.pharmacyItemId)
      .filter((id): id is string => !!id);
    const currentItems = pharmacyItemIds.length
      ? await prisma.pharmacyItem.findMany({ where: { id: { in: pharmacyItemIds } }, select: { id: true, stockQuantity: true } })
      : [];
    const liveStockByItem = new Map(currentItems.map((i) => [i.id, i.stockQuantity]));

    // Écritures groupées : les lignes qui reçoivent exactement les mêmes valeurs (quantité comptée +
    // stock réel figé — la grande majorité tombe sur quelques couples fréquents comme 0/0, 5/5...)
    // partent en un seul updateMany au lieu d'un update chacune, à ~330ms l'aller-retour. Une ligne
    // qui n'appartient pas à CET inventaire est refusée (l'ancienne boucle mettait à jour
    // n'importe quel id fourni par le client).
    const valuesByLine = new Map<string, { countedQuantity: number; systemQuantity?: number }>();
    for (const line of lines) {
      const existing = lineById.get(line.lineId);
      if (!existing) throw new Error("Ligne d'inventaire introuvable pour cet inventaire.");
      const liveStock = liveStockByItem.get(existing.pharmacyItemId);
      valuesByLine.set(line.lineId, {
        countedQuantity: Math.round(line.countedQuantity),
        ...(liveStock !== undefined ? { systemQuantity: liveStock } : {}),
      });
    }
    const groups = new Map<string, { ids: string[]; data: { countedQuantity: number; systemQuantity?: number } }>();
    for (const [lineId, data] of valuesByLine) {
      const key = `${data.countedQuantity}|${data.systemQuantity ?? ""}`;
      const group = groups.get(key);
      if (group) group.ids.push(lineId);
      else groups.set(key, { ids: [lineId], data });
    }

    await prisma.$transaction(
      async (tx) => {
        for (const { ids, data } of groups.values()) {
          if (ids.length === 1) await tx.inventoryCountLine.update({ where: { id: ids[0] }, data });
          else await tx.inventoryCountLine.updateMany({ where: { id: { in: ids } }, data });
        }
      },
      // La forme tableau de $transaction ne prend pas d'option timeout (seule la forme callback
      // le permet) — nécessaire ici car un catalogue de plusieurs centaines de produits (276
      // constatés en production) dépasse largement le timeout par défaut de Prisma (5s) une fois
      // chaque ligne comptée envoyée en une seule transaction Mongo : l'enregistrement échouait
      // silencieusement avant même d'atteindre la validation métier, cf. échange avec
      // l'utilisateur sur ce blocage précis.
      { timeout: 60000, maxWait: 15000 }
    );

    revalidatePath("/dashboard/finance");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement du comptage.") };
  }
}

export async function completeInventoryCount(inventoryCountId: string) {
  try {
    z.string().min(1).parse(inventoryCountId);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    let count = await prisma.inventoryCount.findUnique({
      where: { id: inventoryCountId },
      include: { lines: true },
    });
    if (!count || count.status !== "IN_PROGRESS") {
      throw new Error("Cet inventaire n'est plus modifiable.");
    }

    // Rattrapage de sécurité si le client affichait une version pas tout à fait à jour (cf.
    // syncInventoryCountLines) : une ligne ajoutée seulement ici arrive avec countedQuantity
    // null, donc sans impact sur le stock à la clôture (comportement déjà existant pour toute
    // ligne jamais comptée) — mais elle est au moins tracée plutôt que silencieusement absente.
    const added = await syncInventoryCountLines(count.id, count.organizationId);
    if (added) {
      count = await prisma.inventoryCount.findUnique({ where: { id: inventoryCountId }, include: { lines: true } });
      if (!count) throw new Error("Cet inventaire n'est plus modifiable.");
    }

    let totalLossValue = 0;
    const lowStockAlerts: { pharmacyItemId: string; itemName: string; stockQuantity: number; reorderLevel: number; organizationId: string | null }[] = [];
    // Produits dont le stock a bougé (ravitaillement reçu, remise pharmacie) APRÈS
    // l'enregistrement de leur comptage — cf. vérification ci-dessous.
    const staleProducts: string[] = [];

    // Toute la clôture tient en un nombre de requêtes quasi constant (lectures groupées, calcul en
    // mémoire, créations en createMany, mises à jour groupées par valeur identique) au lieu de ~6
    // requêtes séquentielles PAR ligne comptée : sur 276 produits comptés, la seule relecture
    // "stock réel" ligne par ligne dépassait la durée maximale de la fonction Vercel (504
    // FUNCTION_INVOCATION_TIMEOUT) à ~330ms l'aller-retour vers la base.
    await prisma.$transaction(async (tx) => {
      const counted = count.lines.filter((line) => line.countedQuantity !== null);
      const liveItems: any[] = counted.length
        ? await tx.pharmacyItem.findMany({ where: { id: { in: counted.map((line) => line.pharmacyItemId) } } })
        : [];
      const liveById = new Map(liveItems.map((item) => [item.id, item]));

      // saveInventoryCounts fige systemQuantity à l'instant précis où CE comptage a été
      // enregistré. Si le stock réel a bougé depuis (un ravitaillement reçu entretemps, par
      // exemple, en laissant l'inventaire ouvert plusieurs jours), l'écart serait faux dans un sens
      // ou dans l'autre — on ignore alors la ligne plutôt que d'appliquer un ajustement erroné :
      // elle devra être recomptée puis réenregistrée avant de pouvoir être clôturée correctement.
      const losses: { line: (typeof counted)[number]; item: any; delta: number }[] = [];
      const surpluses: { line: (typeof counted)[number]; delta: number }[] = [];
      const seen = new Set<string>();
      for (const line of counted) {
        if (seen.has(line.pharmacyItemId)) continue;
        seen.add(line.pharmacyItemId);

        const liveItem = liveById.get(line.pharmacyItemId);
        if (!liveItem || liveItem.stockQuantity !== line.systemQuantity) {
          if (liveItem) staleProducts.push(liveItem.name);
          continue;
        }
        if (line.countedQuantity === line.systemQuantity) continue;

        const delta = line.countedQuantity! - line.systemQuantity;
        if (delta < 0) losses.push({ line, item: liveItem, delta });
        else surpluses.push({ line, delta });
      }

      if (losses.length > 0) {
        // Perte constatée : on retire les unités manquantes des lots réellement en stock (FEFO),
        // ce qui valorise la perte aux prix d'achat réels consommés.
        const lots: any[] = await tx.stockPurchase.findMany({
          where: { pharmacyItemId: { in: losses.map(({ line }) => line.pharmacyItemId) }, remainingQuantity: { gt: 0 } },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        });
        const plan = planLotConsumption(lots, new Map(losses.map(({ line, delta }) => [line.pharmacyItemId, -delta])));
        await applyLotConsumption(tx, plan);

        await tx.stockAdjustment.createMany({
          data: losses.map(({ line, delta }) => ({
            pharmacyItemId: line.pharmacyItemId,
            inventoryCountLineId: line.id,
            quantityDelta: delta,
            valuationAmount: plan.costByItem.get(line.pharmacyItemId) ?? 0,
            reason: "INVENTORY",
            createdById: activeUser!.id,
          })),
        });

        // Une perte non valorisée (aucun lot) n'ajoute rien à la comptabilité.
        const expenses = losses
          .map(({ line, delta }) => ({ line, delta, cost: plan.costByItem.get(line.pharmacyItemId) ?? 0 }))
          .filter(({ cost }) => cost > 0);
        if (expenses.length > 0) {
          await tx.financialTransaction.createMany({
            data: expenses.map(({ line, delta, cost }) => ({
              type: "EXPENSE",
              category: "STOCK_ADJUSTMENT",
              amount: cost,
              description: `Perte constatée à l'inventaire (${-delta} unité(s))`,
              pharmacyItemId: line.pharmacyItemId,
              quantity: -delta,
              recordedById: activeUser!.id,
              organizationId: count.organizationId,
            })),
          });
        }
        totalLossValue += Array.from(plan.costByItem.values()).reduce((sum, cost) => sum + cost, 0);
      }

      if (surpluses.length > 0) {
        // Surplus retrouvé : on recrée un lot pour resynchroniser le stock, sans écriture de
        // revenu automatique (un surplus n'est pas un chiffre d'affaires).
        const avgCostByItem = await getItemUnitCostMap(surpluses.map(({ line }) => line.pharmacyItemId), tx);
        await tx.stockPurchase.createMany({
          data: surpluses.map(({ line, delta }) => {
            const avgCost = avgCostByItem.get(line.pharmacyItemId) ?? 0;
            return {
              pharmacyItemId: line.pharmacyItemId,
              quantity: delta,
              remainingQuantity: delta,
              purchasePrice: avgCost,
              totalCost: avgCost * delta,
              organizationId: count.organizationId,
              purchasedById: activeUser!.id,
              batchNumber: "AJUSTEMENT-INVENTAIRE",
            };
          }),
        });
        await tx.stockAdjustment.createMany({
          data: surpluses.map(({ line, delta }) => ({
            pharmacyItemId: line.pharmacyItemId,
            inventoryCountLineId: line.id,
            quantityDelta: delta,
            valuationAmount: (avgCostByItem.get(line.pharmacyItemId) ?? 0) * delta,
            reason: "INVENTORY",
            createdById: activeUser!.id,
          })),
        });
      }

      // Nouveau stock = quantité comptée ; mises à jour groupées par valeur identique.
      const changedLines = [...losses.map(({ line }) => line), ...surpluses.map(({ line }) => line)];
      const newStocks = changedLines.map((line) => [line.pharmacyItemId, line.countedQuantity!] as [string, number]);
      for (const [quantity, ids] of groupIdsByValue(newStocks)) {
        await setField(tx.pharmacyItem, ids, "stockQuantity", quantity);
      }

      // Alerte de rupture uniquement au franchissement du seuil (pas à chaque perte sous le seuil).
      for (const { line, item } of losses) {
        if (line.systemQuantity > item.reorderLevel && line.countedQuantity! <= item.reorderLevel) {
          lowStockAlerts.push({
            pharmacyItemId: item.id,
            itemName: item.name,
            stockQuantity: line.countedQuantity!,
            reorderLevel: item.reorderLevel,
            organizationId: count.organizationId,
          });
        }
      }

      await tx.inventoryCount.update({
        where: { id: inventoryCountId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }, { timeout: 60000, maxWait: 15000 }); // cf. saveInventoryCounts : un grand catalogue dépasse le timeout Prisma par défaut (5s)

    await logAuditAction(activeUser!.id, "COMPLETE_INVENTORY_COUNT", "InventoryCount", inventoryCountId, {
      totalLossValue,
      staleProductsCount: staleProducts.length,
    });

    if (lowStockAlerts.length > 0) {
      const { appEvents } = await import("@/lib/events");
      for (const alert of lowStockAlerts) appEvents.emit("stock.low", alert);
    }

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { inventoryCountId, totalLossValue, staleProducts } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la clôture de l'inventaire.") };
  }
}

// Abandonne un inventaire IN_PROGRESS sans rien appliquer — aucune écriture de stock/finance n'a
// encore eu lieu à ce stade (tout se joue à la clôture, cf. completeInventoryCount ci-dessus),
// donc annuler se résume à marquer le comptage CANCELLED : rien à réintégrer ni à corriger
// ailleurs. Utile quand un inventaire a été démarré par erreur, ou laissé ouvert trop longtemps
// (ravitaillements reçus entretemps, cf. syncInventoryCountLines) au point qu'il vaut mieux
// repartir d'un comptage propre plutôt que de le clôturer. Mêmes rôles que pour le démarrer/le
// clôturer : pas de séparation des tâches nécessaire ici, contrairement à cancelDispense,
// puisqu'il n'y a rien de physique (stock déjà remis) à corriger.
export async function cancelInventoryCount(inventoryCountId: string, reason?: string) {
  try {
    z.string().min(1).parse(inventoryCountId);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const count = await prisma.inventoryCount.findUnique({ where: { id: inventoryCountId } });
    if (!count || count.status !== "IN_PROGRESS") {
      throw new Error("Cet inventaire n'est plus modifiable.");
    }

    await prisma.inventoryCount.update({
      where: { id: inventoryCountId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: activeUser!.id, notes: reason || null },
    });

    await logAuditAction(activeUser!.id, "CANCEL_INVENTORY_COUNT", "InventoryCount", inventoryCountId, { reason: reason || null });
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'annulation de l'inventaire.") };
  }
}

export async function getInventoryHistory(organizationId: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const counts = await prisma.inventoryCount.findMany({
      where: { organizationId, status: "COMPLETED" },
      include: {
        startedBy: { select: { firstName: true, lastName: true } },
        lines: true,
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    });

    return { success: true, data: counts };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de l'historique des inventaires.") };
  }
}

// Données du rapport PDF d'un inventaire CLÔTURÉ : lignes de comptage avec leur produit, et les
// ajustements réellement appliqués (StockAdjustment rattachés aux lignes) — c'est eux, et non la
// simple comparaison compté/système, qui disent quels produits ont vu leur stock modifié (cf.
// buildInventoryReport). Accessible à l'établissement de l'inventaire, ou à la holding parente
// (lecture seule, comme le reste du stock pour ADMIN).
export async function getInventoryReport(inventoryCountId: string) {
  try {
    z.string().min(1).parse(inventoryCountId);
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const count = await prisma.inventoryCount.findUnique({
      where: { id: inventoryCountId },
      include: {
        organization: { select: { name: true, logoUrl: true, parentId: true } },
        startedBy: { select: { firstName: true, lastName: true } },
        lines: {
          include: { pharmacyItem: { select: { name: true, dosage: true, category: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!count) throw new Error("Inventaire introuvable.");

    const sameOrg = count.organizationId === activeUser!.organizationId;
    const parentHolding =
      activeUser!.organization?.type === "HOLDING" && count.organization?.parentId === activeUser!.organizationId;
    if (!sameOrg && !parentHolding) {
      throw new Error("Non autorisé. Cet inventaire n'appartient pas à votre établissement.");
    }
    if (count.status !== "COMPLETED") {
      throw new Error("Le rapport n'est disponible que pour un inventaire clôturé.");
    }

    const adjustments = await prisma.stockAdjustment.findMany({
      where: { inventoryCountLineId: { in: count.lines.map((line) => line.id) } },
      select: { inventoryCountLineId: true, quantityDelta: true, valuationAmount: true },
    });

    return {
      success: true,
      data: {
        inventory: {
          id: count.id,
          status: count.status,
          createdAt: count.createdAt,
          completedAt: count.completedAt,
          startedBy: count.startedBy,
        },
        organization: { name: count.organization?.name ?? null, logoUrl: count.organization?.logoUrl ?? null },
        report: buildInventoryReport(count.lines, adjustments),
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement du rapport d'inventaire.") };
  }
}
