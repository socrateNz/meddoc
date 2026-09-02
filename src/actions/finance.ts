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
  dispensePendingInvoiceSchema,
} from "@/validators/finance";
import { consumeStockLots, assertStockWrite } from "@/actions/stock";
import { assertRegisterOperateRole } from "@/actions/register-permissions";
import { revalidatePath } from "next/cache";

// ADMIN (holding) garde une vue lecture seule de la finance (KPI, journal, valorisation) ;
// COORDINATOR seul y a un accès d'écriture directe (dépenses hors-session exceptées — voir
// recordExpense, désormais rattaché à une session de caisse). Le catalogue pharmacie a son
// propre rôle de lecture élargi (CASHIER en a besoin pour construire un panier de vente).
const FINANCE_READ_ROLES = ["ADMIN", "COORDINATOR"];
const PHARMACY_CATALOG_READ_ROLES = ["ADMIN", "COORDINATOR", "PHARMACIST", "CASHIER"];
const CAISSE_READ_ROLES = ["ADMIN", "COORDINATOR", "CASHIER"];
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

// Règle le panier d'une facture en attente (créée à la clôture d'une consultation, une demande
// labo, ou un envoi d'ordonnance à la pharmacie) : encaisse l'argent, émet la FinancialTransaction
// et le ticket. Le stock N'est PAS touché ici — cf. dispensePendingInvoice, seul endroit où une
// vente pharmacie décrémente le stock, une fois les articles physiquement remis au patient.
export async function payPendingInvoice(
  pendingInvoiceId: string,
  cashSessionId: string,
  items: Array<{
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
    // panier transmis est vide, plutôt que l'erreur générique "panier vide" du schéma Zod.
    const [pending, session] = await Promise.all([
      prisma.pendingInvoice.findUnique({ where: { id: pendingInvoiceId } }),
      prisma.cashSession.findUnique({ where: { id: cashSessionId } }),
    ]);
    if (!pending || pending.status !== "PENDING") {
      throw new Error("Cette facture en attente n'existe plus ou a déjà été réglée.");
    }
    if (!session || session.status !== "OPEN") {
      throw new Error("Aucune session de caisse ouverte. Ouvrez la caisse avant d'encaisser.");
    }

    payPendingInvoiceSchema.parse({ pendingInvoiceId, cashSessionId, items });

    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
    const summaryDescription = items.length === 1
      ? items[0].description
      : `Facture regroupée (${items.length} articles : ${items.map((i) => i.description).join(", ")})`;

    const transaction = await prisma.financialTransaction.create({
      data: {
        type: "INCOME",
        category: items.some((i) => i.type === "PHARMACY") ? "PHARMACY_SALE" : "SERVICE_FEE",
        amount: totalAmount,
        description: summaryDescription,
        patientId: pending.patientId,
        recordedById: activeUser.id,
        organizationId: pending.organizationId,
        cashSessionId: session.id,
      },
    });
    (transaction as any).items = items;

    const updated = await prisma.pendingInvoice.update({
      where: { id: pendingInvoiceId },
      data: {
        status: "PAID",
        items,
        financialTransactionId: transaction.id,
        cashSessionId: session.id,
        paidAt: new Date(),
      },
    });

    // Débloque toute demande d'analyse labo liée à cette facture qui attendait le règlement
    // (cf. src/actions/lab.ts:createLabOrder — paymentStatus). No-op si la facture ne concerne
    // pas un examen labo.
    await prisma.labOrder.updateMany({
      where: { pendingInvoiceId, paymentStatus: "PENDING" },
      data: { paymentStatus: "PAID" },
    });

    await logAuditAction(activeUser.id, "PAY_PENDING_INVOICE", "PendingInvoice", pendingInvoiceId, { transactionId: transaction.id });
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/caisse`);
    revalidatePath(`/dashboard/clinics/${pending.organizationId}/pharmacie`);
    revalidatePath("/dashboard/lab");
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { transaction, pendingInvoice: updated } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'encaissement de la facture.") };
  }
}

// Vente comptant directement au guichet de la caisse (pas d'ordonnance/demande préalable) :
// le paiement a lieu à la construction du panier, donc la PendingInvoice créée ici est déjà
// PAID. Comme pour payPendingInvoice, le stock n'est décrémenté qu'à la remise en pharmacie.
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
  organizationId?: string;
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
    const summaryDescription = data.items.length === 1
      ? data.items[0].description
      : `Vente comptant (${data.items.length} articles : ${data.items.map((i) => i.description).join(", ")})`;

    const transaction = await prisma.financialTransaction.create({
      data: {
        type: "INCOME",
        category: data.items.some((i) => i.type === "PHARMACY") ? "PHARMACY_SALE" : "SERVICE_FEE",
        amount: totalAmount,
        description: summaryDescription,
        patientId: data.patientId || null,
        recordedById: activeUser.id,
        organizationId: targetOrgId,
        cashSessionId: session.id,
      },
    });
    (transaction as any).items = data.items;

    let pendingInvoice = null;
    if (data.patientId) {
      pendingInvoice = await prisma.pendingInvoice.create({
        data: {
          status: "PAID",
          patientId: data.patientId,
          organizationId: targetOrgId,
          items: data.items,
          createdById: activeUser.id,
          cashSessionId: session.id,
          financialTransactionId: transaction.id,
          paidAt: new Date(),
        },
      });
    }

    await logAuditAction(activeUser.id, "CREATE_CAISSE_SALE", "FinancialTransaction", transaction.id);
    revalidatePath(`/dashboard/clinics/${targetOrgId}/caisse`);
    revalidatePath(`/dashboard/clinics/${targetOrgId}/pharmacie`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { transaction, pendingInvoice } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la validation de la vente.") };
  }
}

// Remise physique des articles au comptoir pharmacie — PHARMACIST uniquement. Seul endroit du
// nouveau flux où le stock pharmacie est décrémenté, une fois le ticket PAID présenté.
export async function dispensePendingInvoice(pendingInvoiceId: string) {
  try {
    dispensePendingInvoiceSchema.parse({ pendingInvoiceId });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyDispenseRole(activeUser.role);

    const pending = await prisma.pendingInvoice.findUnique({
      where: { id: pendingInvoiceId },
      include: { prescriptions: true },
    });
    if (!pending) throw new Error("Facture introuvable.");
    if (pending.status !== "PAID") {
      throw new Error(
        pending.status === "PENDING"
          ? "Cette facture n'est pas encore réglée à la caisse."
          : "Les articles de cette facture ont déjà été remis."
      );
    }

    const items = (pending.items as any[]) || [];
    if (!items.some((i) => i.type === "PHARMACY")) {
      throw new Error("Cette facture ne contient aucun médicament à remettre.");
    }

    let lowStockAlerts: any[] = [];
    await prisma.$transaction(async (tx) => {
      lowStockAlerts = await decrementStockForItems(tx, items, pending.organizationId);

      await tx.pendingInvoice.update({
        where: { id: pendingInvoiceId },
        data: { status: "DISPENSED", dispensedAt: new Date() },
      });

      for (const prescription of pending.prescriptions) {
        await tx.prescription.update({
          where: { id: prescription.id },
          data: { status: "DISPENSED", dispensedById: activeUser.id, dispensedAt: new Date() },
        });
      }
    });

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

    const itemsRes: any = await prisma.$runCommandRaw({
      find: "PharmacyItem",
      filter: pFilter,
      sort: { name: 1 }
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

// File d'attente du comptoir pharmacie : factures réglées à la caisse (PAID) contenant au moins
// un médicament, pas encore remises. Filtrage en mémoire après lecture (un champ Json ne se
// filtre pas nativement côté Mongo/Prisma sur son contenu) — le volume de factures PAID en
// attente de remise reste faible (pas d'historique à parcourir, seulement le flux courant).
export async function listPharmacyDispenseQueue(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPharmacyCatalogReadRole(activeUser.role);

    const where: any = { status: "PAID" };
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
      orderBy: { paidAt: "desc" },
    });

    const queue = invoices.filter((inv) => Array.isArray(inv.items) && (inv.items as any[]).some((i) => i.type === "PHARMACY"));

    return { success: true, data: queue };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement de la file d'attente pharmacie." };
  }
}

// Créées automatiquement à la clôture d'une consultation, d'une demande labo ou d'un envoi
// d'ordonnance — en attente de règlement à la caisse (cf. src/app/dashboard/clinics/[id]/caisse).
export async function listPendingInvoices(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    if (!CAISSE_READ_ROLES.includes(activeUser.role)) throw new Error("Non autorisé.");

    const where: any = { status: "PENDING" };
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
        medicalRecord: { select: { title: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: invoices };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement des factures en attente." };
  }
}
