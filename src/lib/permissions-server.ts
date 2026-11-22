import { prisma } from "./db";
import {
  EDITABLE_CLINIC_ROLES,
  GRANTABLE_PERMISSIONS,
  PERMISSION_KEYS,
  permissionsOf,
  type Permission,
} from "./permissions-catalog";

// Permissions EFFECTIVES d'un membre (serveur uniquement : lit la base).
//
// - Rôle principal : permissions par défaut du catalogue, ou celles fixées par sa clinique quand
//   elle a ajusté ce rôle (ClinicRole avec baseRole). Le coordinateur, l'admin de holding, le
//   super-admin, patients et familles gardent toujours les permissions par défaut.
// - Rôles additionnels (User.extraRoleIds, ClinicRole sans baseRole) : leurs permissions
//   s'AJOUTENT.
// - Ancien réglage « le pharmacien peut tenir la caisse » (Organization.pharmacistCanUseRegister
//   = false) : toujours respecté tant que la clinique n'a pas ajusté le rôle PHARMACIST.
//
// Un rôle de clinique ne donne jamais plus que GRANTABLE_PERMISSIONS (ni plateforme, ni audit
// de holding, ni gestion des rôles).

export type PermissionUser = {
  role: string;
  organizationId?: string | null;
  extraRoleIds?: readonly string[] | null;
  organization?: { type?: string | null; pharmacistCanUseRegister?: boolean | null } | null;
};

const EDITABLE: readonly string[] = EDITABLE_CLINIC_ROLES;
const GRANTABLE: ReadonlySet<string> = new Set(GRANTABLE_PERMISSIONS);

function inCatalogOrder(perms: ReadonlySet<string>): Permission[] {
  return PERMISSION_KEYS.filter((key) => perms.has(key));
}

export async function effectivePermissions(user: PermissionUser): Promise<Permission[]> {
  const defaults = permissionsOf(user.role);
  const extraRoleIds = user.extraRoleIds ?? [];
  const isClinicStaff = user.organization?.type === "CLINIC" && !!user.organizationId;
  const editable = isClinicStaff && EDITABLE.includes(user.role);
  if (!isClinicStaff || (!editable && extraRoleIds.length === 0)) return inCatalogOrder(defaults);

  const roles = await prisma.clinicRole.findMany({
    where: {
      organizationId: user.organizationId!,
      OR: [...(editable ? [{ baseRole: user.role }] : []), ...(extraRoleIds.length ? [{ id: { in: [...extraRoleIds] } }] : [])],
    },
    select: { id: true, baseRole: true, permissions: true },
  });

  const override = editable ? roles.find((r) => r.baseRole === user.role) : undefined;
  let base: Set<string>;
  if (override) {
    base = new Set(override.permissions.filter((p) => GRANTABLE.has(p)));
  } else {
    base = new Set(defaults);
    if (user.role === "PHARMACIST" && user.organization?.pharmacistCanUseRegister === false) {
      base.delete("register.operate");
      base.delete("caisse.access");
    }
  }
  for (const role of roles) {
    if (role.baseRole || !extraRoleIds.includes(role.id)) continue;
    for (const p of role.permissions) if (GRANTABLE.has(p)) base.add(p);
  }
  return inCatalogOrder(base);
}
