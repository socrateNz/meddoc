import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { canSeePatientService, restrictedServiceIds } from "./service-access";
import { effectivePermissions, type PermissionUser } from "./permissions-server";
import { encodePermissions } from "./permissions-catalog";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}. Voir .env.example.`);
  }
  return value;
}

const JWT_SECRET = requireEnv("JWT_SECRET");
const REFRESH_SECRET = requireEnv("JWT_REFRESH_SECRET");

export function signJwt(payload: any, options: jwt.SignOptions = { expiresIn: "15m" }) {
  return jwt.sign(payload, JWT_SECRET, options);
}

export function signRefreshToken(payload: any, options: jwt.SignOptions = { expiresIn: "7d" }) {
  return jwt.sign(payload, REFRESH_SECRET, options);
}

// Contenu des jetons de session. `pb` : permissions effectives encodées (cf. encodePermissions),
// lues par le middleware (Edge, sans base) pour ouvrir ou non une page.
export function sessionPayload(
  user: { id: string; email: string; role: string; organizationId?: string | null; organization?: { type?: string | null } | null },
  permissions: Iterable<string>
) {
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    organizationType: user.organization?.type,
    pb: encodePermissions(permissions),
  };
}

const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

// Les permissions d'un membre ont changé depuis l'émission de son jeton (rôle ajusté par le
// coordinateur, rôle additionnel attribué ou retiré...) : ré-émet ses deux jetons avec les
// permissions à jour. Appelée par le battement de présence (cf. heartbeat), donc dans une action
// serveur — seul endroit, avec les routes, où les cookies sont modifiables. Renvoie vrai si les
// jetons ont été ré-émis (la page doit alors se rafraîchir).
export async function syncSessionPermissions(user: Parameters<typeof sessionPayload>[0] & { permissions: readonly string[] }): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return false;
  const current = verifyJwt(token) as { pb?: string } | null;
  const payload = sessionPayload(user, user.permissions);
  if (!current || current.pb === payload.pb) return false;
  cookieStore.set({ name: "token", value: signJwt(payload, { expiresIn: "15m" }), maxAge: 60 * 15, ...cookieBase });
  cookieStore.set({ name: "refreshToken", value: signRefreshToken(payload, { expiresIn: "7d" }), maxAge: 60 * 60 * 24 * 7, ...cookieBase });
  return true;
}

export function verifyJwt(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token: string) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch (error) {
    return null;
  }
}

// Mémoïsé par requête (React cache()) : de nombreuses pages appellent getCurrentUser()
// à la fois dans le layout et dans la page elle-même, et chaque action serveur invoquée
// pendant le rendu (verifyPatientAccess, listX...) le rappelle aussi en interne. Sans ce
// cache, chaque appel déclenche un aller-retour MongoDB Atlas distinct — sur une page qui
// enchaîne plusieurs de ces actions séquentiellement, cela peut multiplier la latence par
// un facteur important, même avec un jeu de données de test minuscule (le coût vient du
// nombre d'allers-retours réseau, pas du volume de données).
export const getCurrentUser = cache(async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;

    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string };
    if (!payload || !payload.userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        avatarUrl: true,
        requiresPasswordChange: true,
        mutedNotificationTypes: true,
        // Services de rattachement (cloisonnement des dossiers, cf. src/lib/service-access.ts).
        serviceIds: true,
        // Rôles additionnels attribués par la clinique (cf. src/lib/permissions-server.ts).
        extraRoleIds: true,
        organizationId: true,
        organization: {
          select: {
            type: true,
            isActive: true,
            logoUrl: true,
            subscriptionStatus: true,
            licenseExpiresAt: true,
            // Modules de la licence (cf. src/lib/modules.ts) : portés par la holding.
            disabledModules: true,
            // Ancien réglage « le pharmacien peut tenir la caisse », encore lu par
            // effectivePermissions tant que la clinique n'a pas ajusté le rôle PHARMACIST.
            pharmacistCanUseRegister: true,
            parent: {
              select: {
                subscriptionStatus: true,
                licenseExpiresAt: true,
                disabledModules: true,
              }
            }
          }
        }
      },
    });

    if (user?.organization) {
      const holding = user.organization.type === "HOLDING" ? user.organization : user.organization.parent;
      if (holding) {
        if (holding.subscriptionStatus === "INACTIVE" || holding.subscriptionStatus === "CANCELLED") {
          return null;
        }
        if (holding.licenseExpiresAt && new Date(holding.licenseExpiresAt) < new Date()) {
          return null;
        }
      }
      // Une clinique suspendue par l'admin de sa holding bloque l'accès de tout son personnel.
      if (user.organization.type === "CLINIC" && user.organization.isActive === false) {
        return null;
      }
    }

    if (!user) return null;
    // Permissions effectives (rôle ajusté par la clinique, rôles additionnels) : lues par can()
    // dans toutes les actions, pages et API (cf. src/lib/permissions-catalog.ts).
    const permissions: string[] = await effectivePermissions(user as PermissionUser);
    return { ...user, permissions };
  } catch (error) {
    return null;
  }
});

export async function verifyPatientAccess(patientId: string, currentUser?: any) {
  if (!currentUser) {
    currentUser = await getCurrentUser();
  }
  
  if (!currentUser) return false;

  // Super Admins do not have access to patient medical data
  if (currentUser.role === "SUPER_ADMIN") return false;

  const orgFilter: any = {};
  if (currentUser.organization?.type === "HOLDING") {
    orgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } }
    ];
  } else if (currentUser.organization?.type === "CLINIC") {
    orgFilter.organizationId = currentUser.organizationId;
  } else {
    return false;
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      ...orgFilter
    },
    select: { id: true, serviceId: true },
  });
  if (!patient) return false;

  // Cloisonnement par service : un médecin/infirmier rattaché à des services n'accède qu'aux
  // dossiers de ses services (cf. src/lib/service-access.ts). Toutes les actions sur un patient
  // passent par ici.
  return canSeePatientService(await restrictedServiceIds(currentUser), patient.serviceId);
}
