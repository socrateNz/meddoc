import type { Prisma } from "@prisma/client";
import type { getCurrentUser } from "@/lib/auth";

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
