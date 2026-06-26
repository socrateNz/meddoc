import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_for_dev_only";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "super_secret_refresh_key_for_dev_only";

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

export async function getCurrentUser() {
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
        organizationId: true,
        organization: {
          select: { 
            type: true,
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
    }

    return user;
  } catch (error) {
    return null;
  }
}

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
