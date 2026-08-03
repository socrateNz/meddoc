"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createPurchaseOrderSchema, receivePurchaseOrderLinesSchema } from "@/validators/purchase-orders";
import { assertStockRead, assertStockWrite, applyStockReceipt } from "@/actions/stock";

export async function createPurchaseOrder(data: {
  supplierId: string;
  organizationId?: string;
  expectedDate?: string;
  notes?: string;
  lines: { pharmacyItemId?: string; newItemName?: string; quantityOrdered: number; unitCost: number }[];
}) {
  try {
    createPurchaseOrderSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const targetOrgId = data.organizationId || activeUser!.organizationId;
    if (!targetOrgId) throw new Error("Impossible de déterminer l'établissement cible.");

    const order = await prisma.purchaseOrder.create({
      data: {
        supplierId: data.supplierId,
        organizationId: targetOrgId,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        notes: data.notes || null,
        createdById: activeUser!.id,
        status: "DRAFT",
        lines: {
          create: data.lines.map((line) => ({
            pharmacyItemId: line.pharmacyItemId || null,
            newItemName: line.pharmacyItemId ? null : line.newItemName || null,
            quantityOrdered: Math.round(line.quantityOrdered),
            unitCost: line.unitCost,
          })),
        },
      },
      include: { lines: true },
    });

    await logAuditAction(activeUser!.id, "CREATE_PURCHASE_ORDER", "PurchaseOrder", order.id, { supplierId: data.supplierId });
    revalidatePath("/dashboard/finance");

    return { success: true, data: order };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de la commande.") };
  }
}

export async function updatePurchaseOrderStatus(id: string, status: "SENT" | "CANCELLED") {
  try {
    z.string().min(1).parse(id);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const order = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Commande introuvable.");
    if (order.status !== "DRAFT") throw new Error("Seule une commande à l'état brouillon peut être modifiée ainsi.");

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: { status, sentAt: status === "SENT" ? new Date() : order.sentAt },
    });

    await logAuditAction(activeUser!.id, "UPDATE_PURCHASE_ORDER_STATUS", "PurchaseOrder", id, { status });
    revalidatePath("/dashboard/finance");

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du statut de la commande.") };
  }
}

// Réceptionne tout ou partie des lignes d'une commande fournisseur. Réutilise applyStockReceipt
// (src/actions/stock.ts) — même logique transactionnelle que la saisie manuelle d'achat, appelée
// une fois par ligne reçue. Les réceptions partielles sont possibles sur plusieurs appels.
export async function receivePurchaseOrderLines(
  purchaseOrderId: string,
  receipts: { lineId: string; quantityReceived: number; batchNumber?: string; expiryDate?: string; purchasePrice?: number }[]
) {
  try {
    receivePurchaseOrderLinesSchema.parse({ purchaseOrderId, receipts });
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const order = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { lines: true, supplier: true },
    });
    if (!order) throw new Error("Commande introuvable.");
    if (!["SENT", "PARTIALLY_RECEIVED"].includes(order.status)) {
      throw new Error("Cette commande n'est pas au stade de la réception (doit être envoyée au préalable).");
    }

    await prisma.$transaction(async (tx) => {
      for (const receipt of receipts) {
        const line = order.lines.find((l) => l.id === receipt.lineId);
        if (!line) throw new Error("Ligne de commande introuvable.");

        const remaining = line.quantityOrdered - line.quantityReceived;
        const qty = Math.min(Math.round(receipt.quantityReceived), remaining);
        if (qty <= 0) continue;

        let pharmacyItemId = line.pharmacyItemId;
        let itemName = "";

        if (!pharmacyItemId) {
          // Produit pas encore au catalogue : créé au moment de la première réception.
          const created = await tx.pharmacyItem.create({
            data: {
              name: line.newItemName || "Article sans nom",
              category: "MEDICATION",
              stockQuantity: 0,
              unitPrice: receipt.purchasePrice ?? line.unitCost,
              organizationId: order.organizationId,
            },
          });
          pharmacyItemId = created.id;
          itemName = created.name;
          await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { pharmacyItemId } });
        } else {
          const item = await tx.pharmacyItem.findUnique({ where: { id: pharmacyItemId } });
          itemName = item?.name || line.newItemName || "Article";
        }

        await applyStockReceipt(tx, {
          pharmacyItemId,
          itemName,
          quantity: qty,
          purchasePrice: receipt.purchasePrice ?? line.unitCost,
          supplier: order.supplier.name,
          batchNumber: receipt.batchNumber,
          expiryDate: receipt.expiryDate ? new Date(receipt.expiryDate) : null,
          purchasedById: activeUser!.id,
          organizationId: order.organizationId,
        });

        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantityReceived: { increment: qty } },
        });
      }

      const refreshedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
      const allReceived = refreshedLines.every((l) => l.quantityReceived >= l.quantityOrdered);
      const anyReceived = refreshedLines.some((l) => l.quantityReceived > 0);
      const newStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : order.status;

      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: newStatus, receivedAt: allReceived ? new Date() : order.receivedAt },
      });
    });

    await logAuditAction(activeUser!.id, "RECEIVE_PURCHASE_ORDER", "PurchaseOrder", purchaseOrderId, { receipts });
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    const updated = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { lines: true } });
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la réception de la commande.") };
  }
}

export async function listPurchaseOrders(options?: { supplierId?: string; organizationId?: string; status?: string }) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const where: any = {};
    if (options?.supplierId) where.supplierId = options.supplierId;
    if (options?.status) where.status = options.status;

    const targetOrgId = options?.organizationId || activeUser!.organizationId;
    where.organizationId = targetOrgId ? targetOrgId : { in: [] };

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: true,
        lines: { include: { pharmacyItem: { select: { name: true } } } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return { success: true, data: orders };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des commandes fournisseurs.") };
  }
}
