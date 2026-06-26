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
  const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
  try {
    const limitCheck = rateLimit(ip, 10, 60000); // 10 soumissions par minute max
    if (!limitCheck.success) {
      // Create a warning notification for coordinators/admins about rate limit hit on contact form
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
            title: `Alerte Système : Spam formulaire de contact`,
            message: `L'adresse IP ${ip} a dépassé la limite autorisée d'envoi de messages de contact.`,
            type: "INFO"
          }))
        });
      } catch (e) {
        console.error("Failed to create contact rate limit alert notification:", e);
      }

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
