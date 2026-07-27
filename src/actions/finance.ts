"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { revalidatePath } from "next/cache";

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

    const targetOrgId = organizationId || activeUser.organizationId;

    if ((prisma as any).pharmacyItem) {
      const whereClause: any = {};
      if (activeUser.organization?.type === "HOLDING" && !organizationId) {
        whereClause.OR = [
          { organizationId: activeUser.organizationId },
          { organization: { parentId: activeUser.organizationId } }
        ];
      } else if (targetOrgId) {
        whereClause.organizationId = targetOrgId;
      }

      const items = await (prisma as any).pharmacyItem.findMany({
        where: whereClause,
        orderBy: { name: "asc" }
      });
      return { success: true, data: items };
    }

    // Fallback using raw MongoDB command if @prisma/client hasn't loaded PharmacyItem
    const filter: any = {};
    if (targetOrgId) {
      filter.organizationId = { "$oid": targetOrgId };
    }

    const rawRes: any = await prisma.$runCommandRaw({
      find: "PharmacyItem",
      filter: filter,
      sort: { name: 1 }
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
  stockQuantity: number;
  reorderLevel: number;
  unitPrice: number;
  organizationId?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const targetOrgId = data.organizationId || activeUser.organizationId;
    const nowISO = new Date().toISOString();

    let item: any;
    if ((prisma as any).pharmacyItem) {
      if (data.id) {
        item = await (prisma as any).pharmacyItem.update({
          where: { id: data.id },
          data: {
            name: data.name,
            dosage: data.dosage || null,
            category: data.category || "MEDICATION",
            stockQuantity: Number(data.stockQuantity),
            reorderLevel: Number(data.reorderLevel),
            unitPrice: Number(data.unitPrice),
          }
        });
      } else {
        item = await (prisma as any).pharmacyItem.create({
          data: {
            name: data.name,
            dosage: data.dosage || null,
            category: data.category || "MEDICATION",
            stockQuantity: Number(data.stockQuantity),
            reorderLevel: Number(data.reorderLevel),
            unitPrice: Number(data.unitPrice),
            organizationId: targetOrgId,
          }
        });
      }
    } else {
      // Fallback MongoDB raw command
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
                stockQuantity: Number(data.stockQuantity),
                reorderLevel: Number(data.reorderLevel),
                unitPrice: Number(data.unitPrice),
                updatedAt: { "$date": nowISO }
              }
            }
          }]
        });
        item = { id: data.id, name: data.name };
      } else {
        const rawRes: any = await prisma.$runCommandRaw({
          insert: "PharmacyItem",
          documents: [{
            name: data.name,
            dosage: data.dosage || null,
            category: data.category || "MEDICATION",
            stockQuantity: Number(data.stockQuantity),
            reorderLevel: Number(data.reorderLevel),
            unitPrice: Number(data.unitPrice),
            organizationId: targetOrgId ? { "$oid": targetOrgId } : null,
            createdAt: { "$date": nowISO },
            updatedAt: { "$date": nowISO }
          }]
        });
        item = { id: "created", name: data.name };
      }
    }

    await logAuditAction(activeUser.id, data.id ? "UPDATE_PHARMACY_ITEM" : "CREATE_PHARMACY_ITEM", "PharmacyItem", item.id || "new");
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: item };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de l'enregistrement de l'article." };
  }
}

export async function recordPharmacySale(data: {
  pharmacyItemId: string;
  quantity: number;
  patientId?: string;
  organizationId?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const targetOrgId = data.organizationId || activeUser.organizationId;
    const qty = Number(data.quantity);
    if (qty <= 0) throw new Error("La quantité doit être supérieure à zéro.");
    const nowISO = new Date().toISOString();

    let item: any = null;
    if ((prisma as any).pharmacyItem) {
      item = await (prisma as any).pharmacyItem.findUnique({ where: { id: data.pharmacyItemId } });
    } else {
      const rawRes: any = await prisma.$runCommandRaw({
        find: "PharmacyItem",
        filter: { _id: { "$oid": data.pharmacyItemId } }
      });
      const docs = rawRes.cursor?.firstBatch || [];
      if (docs.length > 0) item = formatMongoDoc(docs[0]);
    }

    if (!item) throw new Error("Article introuvable.");
    if (item.stockQuantity < qty) {
      throw new Error(`Stock insuffisant. Stock disponible : ${item.stockQuantity}`);
    }

    const totalAmount = item.unitPrice * qty;
    const description = `Vente pharmacie: ${qty}x ${item.name}${item.dosage ? ` (${item.dosage})` : ''}`;

    if ((prisma as any).financialTransaction && (prisma as any).pharmacyItem) {
      const transaction = await prisma.$transaction(async (tx) => {
        await (tx as any).pharmacyItem.update({
          where: { id: data.pharmacyItemId },
          data: { stockQuantity: { decrement: qty } }
        });

        return await (tx as any).financialTransaction.create({
          data: {
            type: "INCOME",
            category: "PHARMACY_SALE",
            amount: totalAmount,
            description: description,
            pharmacyItemId: item.id,
            quantity: qty,
            patientId: data.patientId || null,
            recordedById: activeUser.id,
            organizationId: targetOrgId,
          }
        });
      });
      await logAuditAction(activeUser.id, "RECORD_PHARMACY_SALE", "FinancialTransaction", transaction.id);
    } else {
      // Fallback MongoDB raw commands
      await prisma.$runCommandRaw({
        update: "PharmacyItem",
        updates: [{
          q: { _id: { "$oid": data.pharmacyItemId } },
          u: { "$inc": { stockQuantity: -qty } }
        }]
      });

      await prisma.$runCommandRaw({
        insert: "FinancialTransaction",
        documents: [{
          type: "INCOME",
          category: "PHARMACY_SALE",
          amount: totalAmount,
          description: description,
          pharmacyItemId: { "$oid": data.pharmacyItemId },
          quantity: qty,
          patientId: data.patientId ? { "$oid": data.patientId } : null,
          recordedById: { "$oid": activeUser.id },
          organizationId: targetOrgId ? { "$oid": targetOrgId } : null,
          createdAt: { "$date": nowISO }
        }]
      });
      await logAuditAction(activeUser.id, "RECORD_PHARMACY_SALE", "FinancialTransaction", data.pharmacyItemId);
    }

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de l'enregistrement de la vente." };
  }
}

export async function recordSpecifiedIncome(data: {
  description: string;
  amount: number;
  patientId?: string;
  organizationId?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const amount = Number(data.amount);
    if (amount <= 0) throw new Error("Le montant doit être supérieur à zéro.");
    if (!data.description.trim()) throw new Error("Le motif/libellé est obligatoire.");

    const targetOrgId = data.organizationId || activeUser.organizationId;
    const nowISO = new Date().toISOString();

    if ((prisma as any).financialTransaction) {
      const transaction = await (prisma as any).financialTransaction.create({
        data: {
          type: "INCOME",
          category: "SERVICE_FEE",
          amount: amount,
          description: data.description.trim(),
          patientId: data.patientId || null,
          recordedById: activeUser.id,
          organizationId: targetOrgId,
        }
      });
      await logAuditAction(activeUser.id, "RECORD_INCOME", "FinancialTransaction", transaction.id);
    } else {
      // Fallback MongoDB raw command
      await prisma.$runCommandRaw({
        insert: "FinancialTransaction",
        documents: [{
          type: "INCOME",
          category: "SERVICE_FEE",
          amount: amount,
          description: data.description.trim(),
          patientId: data.patientId ? { "$oid": data.patientId } : null,
          recordedById: { "$oid": activeUser.id },
          organizationId: targetOrgId ? { "$oid": targetOrgId } : null,
          createdAt: { "$date": nowISO }
        }]
      });
      await logAuditAction(activeUser.id, "RECORD_INCOME", "FinancialTransaction", activeUser.id);
    }

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de l'enregistrement de l'encaissement." };
  }
}

export async function recordExpense(data: {
  description: string;
  amount: number;
  organizationId?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const amount = Number(data.amount);
    if (amount <= 0) throw new Error("Le montant doit être supérieur à zéro.");
    if (!data.description.trim()) throw new Error("Le motif du retrait/dépense est obligatoire.");

    const targetOrgId = data.organizationId || activeUser.organizationId;
    const nowISO = new Date().toISOString();

    if ((prisma as any).financialTransaction) {
      const transaction = await (prisma as any).financialTransaction.create({
        data: {
          type: "EXPENSE",
          category: "OPERATIONAL_EXPENSE",
          amount: amount,
          description: data.description.trim(),
          recordedById: activeUser.id,
          organizationId: targetOrgId,
        }
      });
      await logAuditAction(activeUser.id, "RECORD_EXPENSE", "FinancialTransaction", transaction.id);
    } else {
      // Fallback MongoDB raw command
      await prisma.$runCommandRaw({
        insert: "FinancialTransaction",
        documents: [{
          type: "EXPENSE",
          category: "OPERATIONAL_EXPENSE",
          amount: amount,
          description: data.description.trim(),
          recordedById: { "$oid": activeUser.id },
          organizationId: targetOrgId ? { "$oid": targetOrgId } : null,
          createdAt: { "$date": nowISO }
        }]
      });
      await logAuditAction(activeUser.id, "RECORD_EXPENSE", "FinancialTransaction", activeUser.id);
    }

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de l'enregistrement de la dépense." };
  }
}

export async function recordMultiItemInvoice(data: {
  items: Array<{
    type: "PHARMACY" | "SERVICE";
    pharmacyItemId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  patientId?: string;
  organizationId?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    if (!data.items || data.items.length === 0) {
      throw new Error("Le panier de facturation est vide.");
    }

    const targetOrgId = data.organizationId || activeUser.organizationId;
    const nowISO = new Date().toISOString();

    // 1. Verify stocks for all pharmacy items in the cart
    for (const item of data.items) {
      if (item.type === "PHARMACY" && item.pharmacyItemId) {
        let pItem: any = null;
        if ((prisma as any).pharmacyItem) {
          pItem = await (prisma as any).pharmacyItem.findUnique({ where: { id: item.pharmacyItemId } });
        } else {
          const rawRes: any = await prisma.$runCommandRaw({
            find: "PharmacyItem",
            filter: { _id: { "$oid": item.pharmacyItemId } }
          });
          const docs = rawRes.cursor?.firstBatch || [];
          if (docs.length > 0) pItem = formatMongoDoc(docs[0]);
        }

        if (!pItem) throw new Error(`Produit introuvable : ${item.description}`);
        if (pItem.stockQuantity < item.quantity) {
          throw new Error(`Stock insuffisant pour "${pItem.name}". Disponible: ${pItem.stockQuantity}, Demandé: ${item.quantity}`);
        }
      }
    }

    // 2. Decrement stocks for pharmacy items
    for (const item of data.items) {
      if (item.type === "PHARMACY" && item.pharmacyItemId) {
        if ((prisma as any).pharmacyItem) {
          await (prisma as any).pharmacyItem.update({
            where: { id: item.pharmacyItemId },
            data: { stockQuantity: { decrement: item.quantity } }
          });
        } else {
          await prisma.$runCommandRaw({
            update: "PharmacyItem",
            updates: [{
              q: { _id: { "$oid": item.pharmacyItemId } },
              u: { "$inc": { stockQuantity: -item.quantity } }
            }]
          });
        }
      }
    }

    // 3. Compute grand total and combined description
    const totalAmount = data.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const summaryDescription = data.items.length === 1 
      ? data.items[0].description 
      : `Facture regroupée (${data.items.length} articles : ${data.items.map(i => i.description).join(', ')})`;

    const itemsJsonStr = JSON.stringify(data.items);

    let transaction: any = null;
    if ((prisma as any).financialTransaction) {
      transaction = await (prisma as any).financialTransaction.create({
        data: {
          type: "INCOME",
          category: data.items.some(i => i.type === "PHARMACY") ? "PHARMACY_SALE" : "SERVICE_FEE",
          amount: totalAmount,
          description: summaryDescription,
          patientId: data.patientId || null,
          recordedById: activeUser.id,
          organizationId: targetOrgId,
        }
      });
      transaction.items = data.items;
      await logAuditAction(activeUser.id, "RECORD_MULTI_INVOICE", "FinancialTransaction", transaction.id);
    } else {
      // Fallback MongoDB raw command
      await prisma.$runCommandRaw({
        insert: "FinancialTransaction",
        documents: [{
          type: "INCOME",
          category: data.items.some(i => i.type === "PHARMACY") ? "PHARMACY_SALE" : "SERVICE_FEE",
          amount: totalAmount,
          description: summaryDescription,
          itemsJson: itemsJsonStr,
          patientId: data.patientId ? { "$oid": data.patientId } : null,
          recordedById: { "$oid": activeUser.id },
          organizationId: targetOrgId ? { "$oid": targetOrgId } : null,
          createdAt: { "$date": nowISO }
        }]
      });
      transaction = {
        id: `fac-${Date.now()}`,
        type: "INCOME",
        amount: totalAmount,
        description: summaryDescription,
        items: data.items,
        createdAt: nowISO
      };
      await logAuditAction(activeUser.id, "RECORD_MULTI_INVOICE", "FinancialTransaction", activeUser.id);
    }

    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: transaction };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la validation du panier." };
  }
}

export async function getFinanceSummary(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

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
        orderBy: { createdAt: "desc" }
      });

      pharmacyItems = await (prisma as any).pharmacyItem.findMany({
        where: whereClause
      });
    } else {
      // Fallback MongoDB raw commands
      const filter: any = {};
      if (targetOrgId) filter.organizationId = { "$oid": targetOrgId };

      const txRes: any = await prisma.$runCommandRaw({
        find: "FinancialTransaction",
        filter: filter,
        sort: { createdAt: -1 }
      });
      transactions = (txRes.cursor?.firstBatch || []).map(formatMongoDoc);

      const itemsRes: any = await prisma.$runCommandRaw({
        find: "PharmacyItem",
        filter: filter
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

    const cashBalance = totalIncome - totalExpenses;
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
