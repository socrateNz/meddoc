import type { Prisma } from "@prisma/client";
import type { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Factorise le filtre de portée organisationnelle dupliqué dans plusieurs pages/actions
// (ex: src/app/dashboard/patients/page.tsx, src/app/dashboard/appointments/page.tsx) :
// HOLDING voit sa propre organisation + toutes ses cliniques filles, CLINIC ne voit que la
// sienne, tout le reste (pas d'organisation) ne voit rien. Les appels existants ne sont pas
// migrés vers ce helper dans cette passe — seul le nouvel endpoint de synchronisation l'utilise.
export function getOrgScopeWhere(user: CurrentUser): Prisma.PatientWhereInput {
  if (user.organization?.type === "HOLDING") {
    return {
      OR: [{ organizationId: user.organizationId }, { organization: { parentId: user.organizationId } }],
    };
  }
  if (user.organization?.type === "CLINIC") {
    return { organizationId: user.organizationId };
  }
  return { organizationId: { in: [] } };
}

// Sous-ensemble de l'utilisateur courant utile au contrôle d'accès (les actions le typent
// diversement, parfois `any`).
type OrgUser = { organizationId?: string | null; organization?: { type?: string | null } | null };

export const ORG_ACCESS_DENIED = "Non autorisé. Cette clinique ne fait pas partie de votre établissement.";

// Même règle partout : on n'agit que sur sa propre organisation, ou — pour une holding — sur l'une
// de ses cliniques filles. Une organisation inconnue/absente n'est jamais accessible.
export async function canAccessOrganization(user: OrgUser, organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId || !user.organizationId) return false;
  if (organizationId === user.organizationId) return true;
  if (user.organization?.type !== "HOLDING") return false;
  const target = await prisma.organization.findUnique({ where: { id: organizationId }, select: { parentId: true } });
  return target?.parentId === user.organizationId;
}

export async function assertOrganizationAccess(user: OrgUser, organizationId: string | null | undefined, message = ORG_ACCESS_DENIED) {
  if (!(await canAccessOrganization(user, organizationId))) throw new Error(message);
}

// Organisation ciblée par une action qui accepte un `organizationId` venu du client : sans
// paramètre, celle de l'utilisateur (comportement historique) ; avec, uniquement si elle lui est
// accessible — jamais un identifiant arbitraire tel quel.
export async function resolveTargetOrgId(user: OrgUser, requestedOrgId?: string | null): Promise<string | null> {
  if (!requestedOrgId || requestedOrgId === user.organizationId) return user.organizationId ?? null;
  await assertOrganizationAccess(user, requestedOrgId);
  return requestedOrgId;
}
