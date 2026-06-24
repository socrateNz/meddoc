import { NextResponse } from "next/server";
import { loginSchema } from "@/validators/auth";
import { AuthService } from "@/services/AuthService";
import { rateLimit } from "@/middlewares/rateLimiter";
import { z } from "zod";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const limitCheck = rateLimit(ip, 5, 60000); // 5 tentatives de login max par minute
    if (!limitCheck.success) {
      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez réessayer dans une minute." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const data = loginSchema.parse(body);

    const result = await AuthService.login(data);

    const response = NextResponse.json({ user: result.user });

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
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
