"use server";

import { prisma } from "@/lib/db";
import { resolveTargetOrgId } from "@/lib/org-scope";
import { MAX_PAGE_SIZE, resolvePage } from "@/lib/pagination";
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

    const targetOrgId = await resolveTargetOrgId(activeUser!, data.organizationId);

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

const importSuppliersSchema = z.object({
  organizationId: z.string().optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        contactName: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(40).optional(),
        email: z.string().trim().max(120).optional(),
        address: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(500).optional(),
      })
    )
    .min(1, "Aucune ligne à importer")
    .max(2000),
});

// Import CSV des fournisseurs : un fournisseur de même nom (insensible à la casse) est mis à jour
// (seules les cellules remplies remplacent les valeurs existantes).
export async function importSuppliers(data: z.input<typeof importSuppliersSchema>) {
  try {
    const input = importSuppliersSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertStockWrite(activeUser);
    const targetOrgId = await resolveTargetOrgId(activeUser!, input.organizationId);

    const existing = await prisma.supplier.findMany({ where: { organizationId: targetOrgId || null }, select: { id: true, name: true } });
    const idByName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const seen = new Set<string>();
    const failures: { name: string; error: string }[] = [];
    let created = 0;
    let updated = 0;
    for (const item of input.items) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) {
        failures.push({ name: item.name, error: "En double dans le fichier : seule la première ligne est prise en compte." });
        continue;
      }
      seen.add(key);
      const fields = {
        name: item.name,
        ...(item.contactName ? { contactName: item.contactName } : {}),
        ...(item.phone ? { phone: item.phone } : {}),
        ...(item.email ? { email: item.email } : {}),
        ...(item.address ? { address: item.address } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
      };
      try {
        const id = idByName.get(key);
        if (id) {
          await prisma.supplier.update({ where: { id }, data: { ...fields, isActive: true } });
          updated++;
        } else {
          await prisma.supplier.create({ data: { ...fields, organizationId: targetOrgId || null } });
          created++;
        }
      } catch (error) {
        failures.push({ name: item.name, error: toErrorMessage(error, "Erreur inconnue") });
      }
    }
    await logAuditAction(activeUser!.id, "IMPORT_SUPPLIERS_CSV", "Supplier", "bulk", { created, updated, failures: failures.length });
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard/pharmacie");
    if (targetOrgId) revalidatePath(`/dashboard/clinics/${targetOrgId}/pharmacie`);
    return { success: true as const, data: { created, updated, failures } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'import des fournisseurs.") };
  }
}

export async function listSuppliers(organizationId?: string, options?: { page?: number; pageSize?: number }) {
  try {
    const activeUser = await getCurrentUser();
    await assertStockRead(activeUser);

    const targetOrgId = await resolveTargetOrgId(activeUser!, organizationId);
    const where: any = { isActive: true };
    if (targetOrgId) where.organizationId = targetOrgId;

    // Sans option de page : liste complète (sélecteur). Avec une page : pagination (écran de liste).
    const paged = options !== undefined;
    const { page, pageSize, skip, take } = resolvePage(options);
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({ where, orderBy: { name: "asc" }, ...(paged ? { skip, take } : {}) }),
      prisma.supplier.count({ where }),
    ]);

    return { success: true as const, data: suppliers, total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des fournisseurs.") };
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
      take: MAX_PAGE_SIZE,
    });

    return { success: true, data: orders };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de l'historique des commandes.") };
  }
}
