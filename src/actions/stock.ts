"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";
import { recordStockPurchaseSchema, saveInventoryCountsSchema } from "@/validators/stock";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

async function getItemUnitCost(pharmacyItemId: string, client: any = prisma): Promise<number | null> {
  const lots = await client.stockPurchase.findMany({
    where: { pharmacyItemId, remainingQuantity: { gt: 0 } },
  });
  const totalQty = lots.reduce((sum: number, l: any) => sum + l.remainingQuantity, 0);
  if (totalQty === 0) return null;
  const totalCost = lots.reduce((sum: number, l: any) => sum + l.remainingQuantity * l.purchasePrice, 0);
  return totalCost / totalQty;
}

// Même calcul que getItemUnitCost (coût moyen pondéré des lots restants), mais pour plusieurs
// produits en un seul aller-retour — utilisée par getFinanceSummary pour valoriser les
// consommables labo d'un lot de LabOrder sans une requête par produit distinct.
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

  const purchase = await tx.stockPurchase.create({
    data: {
      pharmacyItemId: data.pharmacyItemId,
      quantity: data.quantity,
      remainingQuantity: data.quantity,
      purchasePrice: data.purchasePrice,
      totalCost,
      supplier: data.supplier || null,
      batchNumber: data.batchNumber || null,
      expiryDate: data.expiryDate || null,
      invoiceRef: data.invoiceRef || null,
      purchasedById: data.purchasedById,
      organizationId: data.organizationId || null,
    },
  });

  await tx.pharmacyItem.update({
    where: { id: data.pharmacyItemId },
    data: { stockQuantity: { increment: data.quantity } },
  });

  const transaction = await tx.financialTransaction.create({
    data: {
      type: "EXPENSE",
      category: "PHARMACY_PURCHASE",
      amount: totalCost,
      description: `Achat pharmacie : ${data.quantity}x ${data.itemName}`,
      pharmacyItemId: data.pharmacyItemId,
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
          where: { id: data.linkedExpenseTransactionId, absorbedByPurchaseId: null },
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
        absorbedByPurchaseId: null,
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

  const allItems = await prisma.pharmacyItem.findMany({ where: { organizationId } });
  let changed = false;

  const missingItems = allItems.filter((item) => !existingIds.has(item.id));
  if (missingItems.length > 0) {
    const newLines = await Promise.all(
      missingItems.map(async (item) => ({
        inventoryCountId,
        pharmacyItemId: item.id,
        systemQuantity: item.stockQuantity,
        unitCost: await getItemUnitCost(item.id),
      }))
    );
    await prisma.inventoryCountLine.createMany({ data: newLines });
    changed = true;
  }

  const itemById = new Map(allItems.map((item) => [item.id, item]));
  for (const line of count.lines) {
    if (line.countedQuantity !== null) continue;
    const item = itemById.get(line.pharmacyItemId);
    if (item && item.stockQuantity !== line.systemQuantity) {
      await prisma.inventoryCountLine.update({ where: { id: line.id }, data: { systemQuantity: item.stockQuantity } });
      changed = true;
    }
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

    const lines = await Promise.all(
      items.map(async (item) => ({
        pharmacyItemId: item.id,
        systemQuantity: item.stockQuantity,
        unitCost: await getItemUnitCost(item.id),
      }))
    );

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

    await prisma.$transaction(
      lines.map((line) => {
        const pharmacyItemId = lineById.get(line.lineId)?.pharmacyItemId;
        const liveStock = pharmacyItemId ? liveStockByItem.get(pharmacyItemId) : undefined;
        return prisma.inventoryCountLine.update({
          where: { id: line.lineId },
          data: {
            countedQuantity: Math.round(line.countedQuantity),
            ...(liveStock !== undefined ? { systemQuantity: liveStock } : {}),
          },
        });
      })
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

    await prisma.$transaction(async (tx) => {
      for (const line of count.lines) {
        if (line.countedQuantity === null) continue;

        // saveInventoryCounts fige systemQuantity à l'instant précis où CE comptage a été
        // enregistré. Si le stock réel a bougé depuis (un ravitaillement reçu entretemps, par
        // exemple, en laissant l'inventaire ouvert plusieurs jours), l'écart ci-dessous serait
        // faux dans un sens ou dans l'autre — on ignore alors la ligne plutôt que d'appliquer un
        // ajustement erroné : elle devra être recomptée puis réenregistrée avant de pouvoir être
        // clôturée correctement.
        const liveItem = await tx.pharmacyItem.findUnique({ where: { id: line.pharmacyItemId } });
        if (!liveItem || liveItem.stockQuantity !== line.systemQuantity) {
          if (liveItem) staleProducts.push(liveItem.name);
          continue;
        }

        if (line.countedQuantity === line.systemQuantity) {
          continue;
        }

        const delta = line.countedQuantity - line.systemQuantity;

        if (delta < 0) {
          // Perte constatée : on retire les unités manquantes des lots réellement en
          // stock (FEFO), ce qui valorise la perte aux prix d'achat réels consommés.
          const { consumedCost } = await consumeStockLots(tx, line.pharmacyItemId, -delta);
          totalLossValue += consumedCost;

          await tx.stockAdjustment.create({
            data: {
              pharmacyItemId: line.pharmacyItemId,
              inventoryCountLineId: line.id,
              quantityDelta: delta,
              valuationAmount: consumedCost,
              reason: "INVENTORY",
              createdById: activeUser!.id,
            },
          });

          if (consumedCost > 0) {
            await tx.financialTransaction.create({
              data: {
                type: "EXPENSE",
                category: "STOCK_ADJUSTMENT",
                amount: consumedCost,
                description: `Perte constatée à l'inventaire (${-delta} unité(s))`,
                pharmacyItemId: line.pharmacyItemId,
                quantity: -delta,
                recordedById: activeUser!.id,
                organizationId: count.organizationId,
              },
            });
          }
        } else {
          // Surplus retrouvé : on recrée un lot pour resynchroniser le stock, sans
          // écriture de revenu automatique (un surplus n'est pas un chiffre d'affaires).
          const avgCost = (await getItemUnitCost(line.pharmacyItemId, tx)) ?? 0;
          await tx.stockPurchase.create({
            data: {
              pharmacyItemId: line.pharmacyItemId,
              quantity: delta,
              remainingQuantity: delta,
              purchasePrice: avgCost,
              totalCost: avgCost * delta,
              organizationId: count.organizationId,
              purchasedById: activeUser!.id,
              batchNumber: "AJUSTEMENT-INVENTAIRE",
            },
          });

          await tx.stockAdjustment.create({
            data: {
              pharmacyItemId: line.pharmacyItemId,
              inventoryCountLineId: line.id,
              quantityDelta: delta,
              valuationAmount: avgCost * delta,
              reason: "INVENTORY",
              createdById: activeUser!.id,
            },
          });
        }

        const updatedItem = await tx.pharmacyItem.update({
          where: { id: line.pharmacyItemId },
          data: { stockQuantity: line.countedQuantity },
        });

        // Alerte de rupture uniquement au franchissement du seuil (pas à chaque perte sous le seuil).
        if (delta < 0 && line.systemQuantity > updatedItem.reorderLevel && updatedItem.stockQuantity <= updatedItem.reorderLevel) {
          lowStockAlerts.push({
            pharmacyItemId: updatedItem.id,
            itemName: updatedItem.name,
            stockQuantity: updatedItem.stockQuantity,
            reorderLevel: updatedItem.reorderLevel,
            organizationId: count.organizationId,
          });
        }
      }

      await tx.inventoryCount.update({
        where: { id: inventoryCountId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    });

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

    return { success: true, data: { totalLossValue, staleProducts } };
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
