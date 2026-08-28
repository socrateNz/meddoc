import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";

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
        organizationId: true,
        organization: {
          select: {
            type: true,
            isActive: true,
            subscriptionStatus: true,
            licenseExpiresAt: true,
            parent: {
              select: {
                subscriptionStatus: true,
                licenseExpiresAt: true,
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

    return user;
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
    }
  });

  return !!patient;
}
