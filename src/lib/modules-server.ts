import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MODULE_DISABLED_MESSAGE, MODULE_KEYS, enabledModulesFrom, type ModuleKey } from "@/lib/modules";

// Contrôle des modules de la licence côté serveur (cf. src/lib/modules.ts). Le contrôle qui protège
// réellement est celui des actions serveur et des routes API ; le menu et les gardes de pages ne
// font que masquer.

type OrgWithModules = {
  type?: string | null;
  disabledModules?: string[] | null;
  parent?: { disabledModules?: string[] | null } | null;
} | null | undefined;

// Modules actifs d'un utilisateur, d'après sa holding (déjà chargée par getCurrentUser). Le
// SUPER_ADMIN, hors de toute holding, voit tout.
export function modulesOfUser(user: { role?: string; organization?: OrgWithModules } | null | undefined): ModuleKey[] {
  if (!user) return [];
  if (user.role === "SUPER_ADMIN" || !user.organization) return [...MODULE_KEYS];
  const org = user.organization;
  const holding = org.type === "HOLDING" ? org : org.parent ?? org;
  return enabledModulesFrom(holding.disabledModules);
}

export class ModuleDisabledError extends Error {
  constructor(public module: ModuleKey) {
    super(MODULE_DISABLED_MESSAGE(module));
  }
}

// À appeler dans chaque action serveur d'un module, une fois l'utilisateur chargé.
export function assertUserModule(user: Parameters<typeof modulesOfUser>[0], key: ModuleKey): void {
  if (!modulesOfUser(user).includes(key)) throw new ModuleDisabledError(key);
}

// Modules actifs d'un établissement (clinique ou holding) — pour les accès sans utilisateur
// (clés d'API, tâches planifiées). Mis en cache le temps de la requête.
export const getOrganizationModules = cache(async (organizationId: string | null | undefined): Promise<ModuleKey[]> => {
  if (!organizationId) return [...MODULE_KEYS];
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { type: true, disabledModules: true, parent: { select: { disabledModules: true } } },
  });
  if (!org) return [];
  const holding = org.type === "HOLDING" ? org : org.parent ?? org;
  return enabledModulesFrom(holding.disabledModules);
});

export async function assertOrganizationModule(organizationId: string | null | undefined, key: ModuleKey): Promise<void> {
  if (!(await getOrganizationModules(organizationId)).includes(key)) throw new ModuleDisabledError(key);
}

// Garde de page (layout.tsx du dossier d'un module) : le module est-il actif pour l'utilisateur ?
// Les layouts affichent un message plutôt que de rediriger : sous le loading.tsx de la clinique, un
// redirect() arriverait en plein streaming et forcerait un rechargement complet côté navigateur
// (erreur React #310 dans le routeur de Next, cf. src/middleware.ts).
export async function isModulePageAllowed(key: ModuleKey): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && modulesOfUser(user).includes(key);
}
