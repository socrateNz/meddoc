import { NextResponse } from "next/server";
import { loginSchema } from "@/validators/auth";
import { AuthService } from "@/services/AuthService";
import { rateLimit } from "@/middlewares/rateLimiter";
import { z } from "zod";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  try {
    const limitCheck = rateLimit(ip, 5, 60000);
    if (!limitCheck.success) {
      // Create a warning notification for coordinators/admins about rate limit hit on this IP
      try {
        const { prisma } = await import("@/lib/db");
        const { Role } = await import("@prisma/client");
        
        const staff = await prisma.user.findMany({
          where: {
            role: { in: [Role.COORDINATOR, Role.ADMIN] },
            isActive: true
          }
        });
        
        await prisma.notification.createMany({
          data: staff.map(user => ({
            userId: user.id,
            title: `Alerte Sécurité : Limite de connexion atteinte`,
            message: `L'adresse IP ${ip} a dépassé la limite de tentatives de connexion (5 requêtes/min).`,
            type: "INCIDENT"
          }))
        });
      } catch (e) {
        console.error("Failed to create rate limit alert notification:", e);
      }

      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez réessayer dans une minute." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const data = loginSchema.parse(body);

    const result = await AuthService.login(data);

    const response = NextResponse.json({ user: result.user });

    // Write Audit Log for successful login
    try {
      const { logAuditAction } = await import("@/middlewares/auditLogger");
      await logAuditAction(
        result.user.id,
        "LOGIN_SUCCESS",
        "User",
        result.user.id,
        { ip }
      );
    } catch (auditError) {
      console.error("Failed to write login audit log:", auditError);
    }

    // Set HTTP-only cookie for the short-lived access token (15 mins)
    response.cookies.set({
      name: "token",
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 15,
      path: "/",
    });

    // Set HTTP-only cookie for the long-lived refresh token (7 days)
    if (result.refreshToken) {
      response.cookies.set({
        name: "refreshToken",
        value: result.refreshToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Erreur interne";

    // Write audit log for login failure if we can find the user email
    try {
      const body = await req.clone().json().catch(() => null);
      if (body && body.email) {
        const { prisma } = await import("@/lib/db");
        const { logAuditAction } = await import("@/middlewares/auditLogger");
        const user = await prisma.user.findUnique({ where: { email: body.email } });
        if (user) {
          await logAuditAction(
            user.id,
            "LOGIN_FAILURE",
            "User",
            user.id,
            { ip, error: message }
          );
        }
      }
    } catch (auditError) {
      console.error("Failed to write failed login audit log:", auditError);
    }

    return NextResponse.json({ error: message }, { status: 401 });
  }
}
