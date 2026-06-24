import { NextRequest, NextResponse } from "next/server";
import { AiRAGService, RateLimitError, ServiceUnavailableError } from "@/services/AiRAGService";
import { prisma } from "@/lib/db";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev_only'
);

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user from cookie token
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    let payload: any;
    try {
      const verified = await jwtVerify(token, JWT_SECRET);
      payload = verified.payload;
    } catch (e) {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }

    const userId = payload.userId;
    const userRole = payload.role;

    // Strict access control: only Admin, Coordinator, Caregiver
    if (!["ADMIN", "COORDINATOR", "CAREGIVER"].includes(userRole)) {
      return NextResponse.json({ error: "Accès interdit aux patients et familles" }, { status: 403 });
    }

    const body = await req.json();
    const { patientId, query, history = [], conversationId } = body;

    if (!patientId || !query) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }

    // 2. Call the RAG service chat function
    const responseText = await AiRAGService.chat(userId, patientId, query, history);

    // 3. Persist conversation and messages in database
    let activeConversationId = conversationId;

    if (!activeConversationId) {
      // Create new AIConversation
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        include: { user: true },
      });
      const patientName = patient ? `${patient.user.lastName} ${patient.user.firstName}` : "Patient";
      
      const newConv = await prisma.aIConversation.create({
        data: {
          userId,
          patientId,
          title: `Discussion médicale - ${patientName}`,
        },
      });
      activeConversationId = newConv.id;
    }

    // Save user query
    await prisma.aIMessage.create({
      data: {
        conversationId: activeConversationId,
        role: "user",
        content: query,
      },
    });

    // Save AI response
    await prisma.aIMessage.create({
      data: {
        conversationId: activeConversationId,
        role: "model",
        content: responseText,
      },
    });

    return NextResponse.json({
      success: true,
      responseText,
      conversationId: activeConversationId,
    });
  } catch (error: any) {
    console.error("AI Chat route error:", error);

    // Surface quota / rate-limit errors with a proper 429 so the UI can guide the user
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          rateLimited: true,
        },
        { status: 429 }
      );
    }

    // Surface 503 overload errors so the UI can show a friendly retry message
    if (error instanceof ServiceUnavailableError) {
      return NextResponse.json(
        { error: error.message, serviceUnavailable: true },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Erreur interne de traitement IA" },
      { status: 500 }
    );
  }
}
