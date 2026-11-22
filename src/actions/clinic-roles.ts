"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { logAuditAction } from "@/middlewares/auditLogger";
import {
  EDITABLE_CLINIC_ROLES,
  GRANTABLE_PERMISSIONS,
  PERMISSION_KEYS,
  can,
  permissionsOf,
  type Permission,
} from "@/lib/permissions-catalog";

// Rôles de la clinique (cf. modèle ClinicRole et src/lib/permissions-server.ts) : le coordinateur
// ajuste les permissions des rôles intégrés, crée des rôles propres à sa clinique et les attribue
// en plus du rôle principal d'un membre. Coordinateur de la clinique uniquement (« roles.manage »).

const GRANTABLE: ReadonlySet<string> = new Set(GRANTABLE_PERMISSIONS);
const EDITABLE: readonly string[] = EDITABLE_CLINIC_ROLES;
// Nom (unique par clinique) de l'ajustement d'un rôle intégré : jamais montré, ne peut pas entrer
// en collision avec un rôle créé (un nom créé ne peut pas commencer par « @ »).
const builtInName = (role: string) => `@${role}`;

async function requireRoleManager(clinicId: string) {
  const user = await getCurrentUser();
  if (!user || user.organizationId !== clinicId || user.organization?.type !== "CLINIC" || !can(user, "roles.manage")) {
    throw new Error("Non autorisé. Seul le coordinateur de la clinique gère les rôles.");
  }
  return user;
}

// Permissions reçues du navigateur : seulement celles qu'un rôle de clinique peut avoir, dans
// l'ordre du catalogue, sans doublon.
function cleanPermissions(input: readonly string[]): Permission[] {
  const wanted = new Set(input);
  return PERMISSION_KEYS.filter((key) => wanted.has(key) && GRANTABLE.has(key));
}

const permissionsSchema = z.array(z.string().max(80)).max(PERMISSION_KEYS.length + 10);
const roleNameSchema = z
  .string()
  .trim()
  .min(2, "Nom trop court.")
  .max(60, "Nom trop long.")
  .refine((v) => !v.startsWith("@"), "Le nom ne peut pas commencer par « @ ».");

export type ClinicRolesData = {
  builtIn: { role: string; permissions: Permission[]; defaults: Permission[]; customized: boolean; memberCount: number }[];
  custom: { id: string; name: string; description: string | null; permissions: Permission[]; memberCount: number }[];
};

export async function listClinicRoles(clinicId: string) {
  try {
    await requireRoleManager(clinicId);
    const [roles, members] = await Promise.all([
      prisma.clinicRole.findMany({ where: { organizationId: clinicId }, orderBy: { name: "asc" } }),
      prisma.user.findMany({ where: { organizationId: clinicId, isActive: true }, select: { role: true, extraRoleIds: true } }),
    ]);
    const data: ClinicRolesData = {
      builtIn: EDITABLE.map((role) => {
        const override = roles.find((r) => r.baseRole === role);
        const defaults = PERMISSION_KEYS.filter((key) => permissionsOf(role).has(key));
        return {
          role,
          defaults,
          permissions: override ? cleanPermissions(override.permissions) : defaults,
          customized: !!override,
          memberCount: members.filter((m) => m.role === role).length,
        };
      }),
      custom: roles
        .filter((r) => !r.baseRole)
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          permissions: cleanPermissions(r.permissions),
          memberCount: members.filter((m) => m.extraRoleIds.includes(r.id)).length,
        })),
    };
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des rôles.") };
  }
}

export async function saveBuiltInRole(clinicId: string, role: string, permissions: string[]) {
  try {
    const user = await requireRoleManager(clinicId);
    if (!EDITABLE.includes(role)) throw new Error("Ce rôle n'est pas modifiable.");
    const perms = cleanPermissions(permissionsSchema.parse(permissions));
    await prisma.clinicRole.upsert({
      where: { organizationId_name: { organizationId: clinicId, name: builtInName(role) } },
      create: { organizationId: clinicId, name: builtInName(role), baseRole: role, permissions: perms },
      update: { permissions: perms, baseRole: role },
    });
    await logAuditAction(user.id, "UPDATE_CLINIC_ROLE", "Organization", clinicId, { role, permissions: perms });
    revalidatePath(`/dashboard/clinics/${clinicId}`, "layout");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement du rôle.") };
  }
}

// Revenir aux permissions par défaut du rôle intégré.
export async function resetBuiltInRole(clinicId: string, role: string) {
  try {
    const user = await requireRoleManager(clinicId);
    if (!EDITABLE.includes(role)) throw new Error("Ce rôle n'est pas modifiable.");
    await prisma.clinicRole.deleteMany({ where: { organizationId: clinicId, baseRole: role } });
    await logAuditAction(user.id, "RESET_CLINIC_ROLE", "Organization", clinicId, { role });
    revalidatePath(`/dashboard/clinics/${clinicId}`, "layout");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la réinitialisation du rôle.") };
  }
}

const customRoleSchema = z.object({
  name: roleNameSchema,
  description: z.string().trim().max(300).optional().nullable(),
  permissions: permissionsSchema,
});

export async function createCustomRole(clinicId: string, input: { name: string; description?: string | null; permissions: string[] }) {
  try {
    const user = await requireRoleManager(clinicId);
    const data = customRoleSchema.parse(input);
    const exists = await prisma.clinicRole.findFirst({ where: { organizationId: clinicId, name: data.name }, select: { id: true } });
    if (exists) throw new Error("Un rôle porte déjà ce nom.");
    const role = await prisma.clinicRole.create({
      data: { organizationId: clinicId, name: data.name, description: data.description || null, permissions: cleanPermissions(data.permissions) },
    });
    await logAuditAction(user.id, "CREATE_CLINIC_ROLE", "ClinicRole", role.id, { name: role.name, permissions: role.permissions });
    revalidatePath(`/dashboard/clinics/${clinicId}`, "layout");
    return { success: true as const, id: role.id };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la création du rôle.") };
  }
}

async function findCustomRole(clinicId: string, roleId: string) {
  const role = await prisma.clinicRole.findFirst({ where: { id: roleId, organizationId: clinicId } });
  if (!role || role.baseRole) throw new Error("Rôle introuvable.");
  return role;
}

export async function updateCustomRole(clinicId: string, roleId: string, input: { name: string; description?: string | null; permissions: string[] }) {
  try {
    const user = await requireRoleManager(clinicId);
    z.string().min(1).parse(roleId);
    const data = customRoleSchema.parse(input);
    await findCustomRole(clinicId, roleId);
    const clash = await prisma.clinicRole.findFirst({ where: { organizationId: clinicId, name: data.name, NOT: { id: roleId } }, select: { id: true } });
    if (clash) throw new Error("Un rôle porte déjà ce nom.");
    const perms = cleanPermissions(data.permissions);
    await prisma.clinicRole.update({ where: { id: roleId }, data: { name: data.name, description: data.description || null, permissions: perms } });
    await logAuditAction(user.id, "UPDATE_CLINIC_ROLE", "ClinicRole", roleId, { name: data.name, permissions: perms });
    revalidatePath(`/dashboard/clinics/${clinicId}`, "layout");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement du rôle.") };
  }
}

export async function deleteCustomRole(clinicId: string, roleId: string) {
  try {
    const user = await requireRoleManager(clinicId);
    z.string().min(1).parse(roleId);
    const role = await findCustomRole(clinicId, roleId);
    // Retiré d'abord aux membres qui l'avaient, puis supprimé.
    const holders = await prisma.user.findMany({ where: { organizationId: clinicId, extraRoleIds: { has: roleId } }, select: { id: true, extraRoleIds: true } });
    await prisma.$transaction([
      ...holders.map((h) => prisma.user.update({ where: { id: h.id }, data: { extraRoleIds: h.extraRoleIds.filter((id) => id !== roleId) } })),
      prisma.clinicRole.delete({ where: { id: roleId } }),
    ]);
    await logAuditAction(user.id, "DELETE_CLINIC_ROLE", "ClinicRole", roleId, { name: role.name, members: holders.length });
    revalidatePath(`/dashboard/clinics/${clinicId}`, "layout");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la suppression du rôle.") };
  }
}

// Rôles additionnels d'un membre de la clinique (remplace toute la liste).
export async function setMemberExtraRoles(clinicId: string, memberId: string, roleIds: string[]) {
  try {
    const user = await requireRoleManager(clinicId);
    z.object({ memberId: z.string().min(1), roleIds: z.array(z.string().min(1)).max(20) }).parse({ memberId, roleIds });
    const member = await prisma.user.findFirst({ where: { id: memberId, organizationId: clinicId }, select: { id: true, role: true } });
    if (!member || ["PATIENT", "FAMILY", "ADMIN", "SUPER_ADMIN"].includes(member.role)) throw new Error("Membre introuvable.");
    const ids = [...new Set(roleIds)];
    const valid = await prisma.clinicRole.findMany({ where: { id: { in: ids }, organizationId: clinicId }, select: { id: true, baseRole: true } });
    if (valid.length !== ids.length || valid.some((r) => r.baseRole)) throw new Error("Rôle introuvable.");
    await prisma.user.update({ where: { id: memberId }, data: { extraRoleIds: ids } });
    await logAuditAction(user.id, "SET_MEMBER_ROLES", "User", memberId, { roleIds: ids });
    revalidatePath(`/dashboard/clinics/${clinicId}/team`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'attribution des rôles.") };
  }
}
