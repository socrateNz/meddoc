import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

// Petit cache mémoire courte durée pour éviter une requête Permission à chaque
// appel de Server Action. Le contrôle grossier par route reste dans
// src/middleware.ts (Edge runtime, sans accès Prisma) ; cette couche ne sert
// que les vérifications fines côté Server Actions/Components (runtime Node).
let cache: { data: Record<string, Role[]>; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

async function loadPermissionMap(): Promise<Record<string, Role[]>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const permissions = await prisma.permission.findMany();
  const map: Record<string, Role[]> = {};
  for (const permission of permissions) {
    map[permission.name] = permission.roles;
  }

  cache = { data: map, expiresAt: Date.now() + CACHE_TTL_MS };
  return map;
}

export async function hasPermission(role: Role, permissionName: string): Promise<boolean> {
  const map = await loadPermissionMap();
  const roles = map[permissionName];
  // Si la permission n'est pas encore seedée en base, on ne bloque pas : ce
  // système est une couche de restriction additionnelle, pas la seule source
  // de vérité, pour éviter de verrouiller l'application si le seed n'a pas
  // encore tourné.
  if (!roles) return true;
  return roles.includes(role);
}

export async function requirePermission(role: Role, permissionName: string): Promise<void> {
  const allowed = await hasPermission(role, permissionName);
  if (!allowed) {
    throw new Error("Non autorisé : votre rôle ne dispose pas de cette permission.");
  }
}
