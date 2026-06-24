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
      },
    });

    return user;
  } catch (error) {
    return null;
  }
}
