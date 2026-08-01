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
async function assertStockRead(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (!STOCK_READ_ROLES.includes(activeUser.role)) {
    throw new Error("Non autorisé.");
  }
}

async function assertStockWrite(activeUser: any) {
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
  purchasePrice: number;
  supplier?: string;
  batchNumber?: string;
  expiryDate?: string;
  invoiceRef?: string;
  organizationId?: string;
}) {
  try {
    recordStockPurchaseSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const targetOrgId = data.organizationId || activeUser!.organizationId;
    const quantity = Number(data.quantity);
    const purchasePrice = Number(data.purchasePrice);
    const totalCost = quantity * purchasePrice;
    const expiry = data.expiryDate ? new Date(data.expiryDate) : null;

    const result = await prisma.$transaction(async (tx) => {
      let itemId = data.pharmacyItemId;
      let itemName: string;

      if (!itemId) {
        const created = await tx.pharmacyItem.create({
          data: {
            name: data.newItem!.name,
            dosage: data.newItem!.dosage || null,
            category: data.newItem!.category || "MEDICATION",
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

      const purchase = await tx.stockPurchase.create({
        data: {
          pharmacyItemId: itemId,
          quantity,
          remainingQuantity: quantity,
          purchasePrice,
          totalCost,
          supplier: data.supplier || null,
          batchNumber: data.batchNumber || null,
          expiryDate: expiry,
          invoiceRef: data.invoiceRef || null,
          purchasedById: activeUser!.id,
          organizationId: targetOrgId,
        },
      });

      await tx.pharmacyItem.update({
        where: { id: itemId },
        data: { stockQuantity: { increment: quantity } },
      });

      const transaction = await tx.financialTransaction.create({
        data: {
          type: "EXPENSE",
          category: "PHARMACY_PURCHASE",
          amount: totalCost,
          description: `Achat pharmacie : ${quantity}x ${itemName}`,
          pharmacyItemId: itemId,
          quantity,
          recordedById: activeUser!.id,
          organizationId: targetOrgId,
        },
      });

      return { purchase, transaction, pharmacyItemId: itemId };
    });

    await logAuditAction(activeUser!.id, "RECORD_STOCK_PURCHASE", "PharmacyItem", result.pharmacyItemId, {
      quantity,
      purchasePrice,
      totalCost,
    });

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'achat.") };
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
    for (const item of items) {
      totalCostValue += costByItem.get(item.id) || 0;
      totalSaleValue += item.stockQuantity * item.unitPrice;
    }

    return {
      success: true,
      data: {
        totalCostValue,
        totalSaleValue,
        potentialMargin: totalSaleValue - totalCostValue,
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du calcul de la valorisation du stock.") };
  }
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

    const inventoryCount = await prisma.inventoryCount.findFirst({
      where: { organizationId, status: "IN_PROGRESS" },
      include: {
        lines: {
          include: { pharmacyItem: { select: { name: true, dosage: true, category: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

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

    const count = await prisma.inventoryCount.findUnique({ where: { id: inventoryCountId } });
    if (!count || count.status !== "IN_PROGRESS") {
      throw new Error("Cet inventaire n'est plus modifiable.");
    }

    await prisma.$transaction(
      lines.map((line) =>
        prisma.inventoryCountLine.update({
          where: { id: line.lineId },
          data: { countedQuantity: Math.round(line.countedQuantity) },
        })
      )
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

    const count = await prisma.inventoryCount.findUnique({
      where: { id: inventoryCountId },
      include: { lines: true },
    });
    if (!count || count.status !== "IN_PROGRESS") {
      throw new Error("Cet inventaire n'est plus modifiable.");
    }

    let totalLossValue = 0;

    await prisma.$transaction(async (tx) => {
      for (const line of count.lines) {
        if (line.countedQuantity === null || line.countedQuantity === line.systemQuantity) {
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

        await tx.pharmacyItem.update({
          where: { id: line.pharmacyItemId },
          data: { stockQuantity: line.countedQuantity },
        });
      }

      await tx.inventoryCount.update({
        where: { id: inventoryCountId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    });

    await logAuditAction(activeUser!.id, "COMPLETE_INVENTORY_COUNT", "InventoryCount", inventoryCountId, {
      totalLossValue,
    });

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { totalLossValue } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la clôture de l'inventaire.") };
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
