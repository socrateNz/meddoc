"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createOrUpdateSupplierSchema } from "@/validators/suppliers";
import { assertStockRead, assertStockWrite } from "@/actions/stock";

export async function createOrUpdateSupplier(data: {
  id?: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  organizationId?: string;
}) {
  try {
    createOrUpdateSupplierSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const targetOrgId = data.organizationId || activeUser!.organizationId;

    let supplier;
    if (data.id) {
      supplier = await prisma.supplier.update({
        where: { id: data.id },
        data: {
          name: data.name,
          contactName: data.contactName || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          notes: data.notes || null,
        },
      });
    } else {
      supplier = await prisma.supplier.create({
        data: {
          name: data.name,
          contactName: data.contactName || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          notes: data.notes || null,
          organizationId: targetOrgId || null,
        },
      });
    }

    await logAuditAction(activeUser!.id, data.id ? "UPDATE_SUPPLIER" : "CREATE_SUPPLIER", "Supplier", supplier.id, { name: data.name });
    revalidatePath("/dashboard/finance");

    return { success: true, data: supplier };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement du fournisseur.") };
  }
}

export async function listSuppliers(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const targetOrgId = organizationId || activeUser!.organizationId;
    const where: any = { isActive: true };
    if (targetOrgId) where.organizationId = targetOrgId;

    const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: "asc" } });

    return { success: true, data: suppliers };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des fournisseurs.") };
  }
}

export async function deactivateSupplier(id: string) {
  try {
    z.string().min(1).parse(id);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);

    const supplier = await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    await logAuditAction(activeUser!.id, "DEACTIVATE_SUPPLIER", "Supplier", id);
    revalidatePath("/dashboard/finance");

    return { success: true, data: supplier };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la désactivation du fournisseur.") };
  }
}

export async function getSupplierOrderHistory(supplierId: string) {
  try {
    z.string().min(1).parse(supplierId);
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const orders = await prisma.purchaseOrder.findMany({
      where: { supplierId },
      include: { lines: true, createdBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return { success: true, data: orders };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de l'historique des commandes.") };
  }
}
