import { NextResponse } from "next/server";
import { rateLimit } from "@/middlewares/rateLimiter";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  email: z.string().email("Adresse email invalide"),
  subject: z.string().min(3, "Le sujet doit contenir au moins 3 caractères"),
  message: z.string().min(10, "Le message doit contenir au moins 10 caractères"),
});

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const limitCheck = rateLimit(ip, 10, 60000); // 10 soumissions par minute max
    if (!limitCheck.success) {
      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez réessayer plus tard." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validatedData = contactSchema.parse(body);


    return NextResponse.json({
      success: true,
      message: "Votre message a été envoyé avec succès. Notre équipe vous contactera sous peu."
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erreur interne lors de la soumission" },
      { status: 500 }
    );
  }
}
