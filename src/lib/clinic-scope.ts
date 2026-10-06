import { prisma } from "@/lib/db";

// Cette clinique doit être la propre clinique de l'utilisateur, ou une clinique rattachée à la
// holding dont il est administrateur. Même contrôle multi-tenant que wards.ts / registers.ts (ces
// fichiers gardent leur copie locale ; celui-ci sert aux nouvelles listes paginées).
export async function assertClinicScope(clinicId: string, activeUser: { organizationId: string | null; organization?: { type?: string } | null }) {
  const isOwnClinic = activeUser.organizationId === clinicId;
  const isChildOfHolding =
    activeUser.organization?.type === "HOLDING" &&
    (await prisma.organization.findFirst({ where: { id: clinicId, parentId: activeUser.organizationId } })) !== null;
  if (!isOwnClinic && !isChildOfHolding) {
    throw new Error("Non autorisé. Cette clinique ne fait pas partie de votre établissement.");
  }
}
