"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";

const ALL_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.COORDINATOR, Role.CAREGIVER, Role.FAMILY, Role.PATIENT];

function assertAdmin(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (activeUser.role !== "ADMIN") {
    throw new Error("Non autorisé. Réservé aux administrateurs.");
  }
}

export async function listPermissions() {
  try {
    const activeUser = await getCurrentUser();
    assertAdmin(activeUser);

    const permissions = await prisma.permission.findMany({ orderBy: { name: "asc" } });
    return { success: true, data: permissions };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des permissions.") };
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
