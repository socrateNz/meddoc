"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { resolvePage } from "@/lib/pagination";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";

const ALL_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.COORDINATOR, Role.MEDECIN, Role.CAREGIVER, Role.PHARMACIST, Role.CASHIER, Role.FAMILY, Role.PATIENT];

function assertAdmin(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (activeUser.role !== "ADMIN") {
    throw new Error("Non autorisé. Réservé aux administrateurs.");
  }
}

export async function listPermissions(options?: { page?: number; pageSize?: number }) {
  try {
    const activeUser = await getCurrentUser();
    assertAdmin(activeUser);

    const { page, pageSize, skip, take } = resolvePage(options);
    const [permissions, total] = await Promise.all([
      prisma.permission.findMany({ orderBy: { name: "asc" }, skip, take }),
      prisma.permission.count(),
    ]);
    return { success: true as const, data: permissions, total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des permissions.") };
  }
}

export async function togglePermissionRole(permissionId: string, role: string) {
  try {
    z.string().min(1).parse(permissionId);
    if (!ALL_ROLES.includes(role as Role)) {
      throw new Error("Rôle invalide.");
    }

    const activeUser = await getCurrentUser();
    assertAdmin(activeUser);

    const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) throw new Error("Permission introuvable.");

    const hasRole = permission.roles.includes(role as Role);
    const updatedRoles = hasRole
      ? permission.roles.filter((r) => r !== role)
      : [...permission.roles, role as Role];

    const updated = await prisma.permission.update({
      where: { id: permissionId },
      data: { roles: updatedRoles },
    });

    await logAuditAction(activeUser!.id, "UPDATE_PERMISSION", "Permission", permissionId, {
      role,
      granted: !hasRole,
    });

    revalidatePath("/dashboard/permissions");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour de la permission.") };
  }
}
