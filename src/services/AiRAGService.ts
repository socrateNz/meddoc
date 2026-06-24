import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logAuditAction } from "@/middlewares/auditLogger";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/** Thrown when the Gemini API returns a 429 Too Many Requests. */
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(
      `Quota IA dépassé — le service sera disponible dans ${retryAfterSeconds} secondes. Veuillez patienter.`
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Thrown when the Gemini API returns a 503 Service Unavailable (overloaded). */
export class ServiceUnavailableError extends Error {
  constructor() {
    super("Le service IA est momentanément surchargé. Veuillez réessayer dans quelques instants.");
    this.name = "ServiceUnavailableError";
  }
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export class AiRAGService {
  // 1. Check quotas per user (max 50 requests per day)
  static async checkUserQuota(userId: string): Promise<boolean> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await prisma.auditLog.count({
      where: {
        userId,
        action: "AI_QUERY",
        createdAt: { gte: oneDayAgo },
      },
    });
    return count < 50;
  }

  // 2. Retrieve patient clinical context (Retriever)
  static async retrievePatientContext(patientId: string) {
    return prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        medicalRecords: { orderBy: { createdAt: "desc" }, take: 5 },
        carePlans: {
          where: { status: "ACTIVE" },
          include: { medications: true, tasks: true },
        },
        incidents: { orderBy: { createdAt: "desc" }, take: 5 },
        aiAnalyses: { orderBy: { createdAt: "desc" }, take: 2 },
      },
    });
  }

  // 3. Conversational chat handler (Assistant interactif)
  static async chat(userId: string, patientId: string, query: string, history: ChatMessage[] = []) {
    // Check user quota
    const withinQuota = await this.checkUserQuota(userId);
    if (!withinQuota) {
      throw new Error("Quota journalier de requêtes IA dépassé (50 max par 24h).");
    }

    const patient = await this.retrievePatientContext(patientId);
    if (!patient) {
      throw new Error("Patient introuvable pour construire le contexte clinique.");
    }

    // Build context prompt (Context Builder)
    const age = new Date().getFullYear() - patient.dateOfBirth.getFullYear();
    const pathologies = patient.pathologies.join(", ") || "Aucune pathologie déclarée";
    const allergies = patient.allergies.join(", ") || "Aucune allergie déclarée";

    const medicalRecordsSummary = patient.medicalRecords
      .map((r) => `[Fichier médical - ${r.createdAt.toLocaleDateString()}] ${r.title}: ${r.description}`)
      .join("\n");

    const carePlansSummary = patient.carePlans
      .map(
        (p) =>
          `Plan: ${p.title}\nMédicaments:\n` +
          p.medications.map((m) => `- ${m.name} (${m.dosage}, ${m.frequency})`).join("\n") +
          `\nTâches:\n` +
          p.tasks.map((t) => `- [${t.status}] ${t.title} (${t.scheduledFor.toLocaleDateString()})`).join("\n")
      )
      .join("\n\n");

    const incidentsSummary = patient.incidents
      .map((i) => `[Incident - ${i.createdAt.toLocaleDateString()}] [${i.priority}] ${i.title}: ${i.description} (Statut: ${i.status})`)
      .join("\n");

    // Construct prompt
    const systemPrompt = `
Vous êtes un assistant clinique virtuel expert en soins à domicile pour MedDoc. Votre rôle est d'aider les soignants et coordinateurs médicaux à analyser le dossier d'un patient et de répondre de façon claire, précise, professionnelle et sécurisée, en français.

---
DOSSIER CLINIQUE DE CONTEXTE :
Patient : ${patient.user.lastName} ${patient.user.firstName}
Âge : ${age} ans
Niveau de dépendance : ${patient.dependencyLevel}/5
Pathologies : ${pathologies}
Allergies : ${allergies}

RAPPORTS MÉDICAUX RÉCENTS :
${medicalRecordsSummary || "Aucune note médicale récente."}

PLANS DE SOINS ET MÉDICAMENTS ACTUELS :
${carePlansSummary || "Aucun plan de soins actif."}

INCIDENTS RÉCENTS SIGNALÉS :
${incidentsSummary || "Aucun incident signalé récemment."}
---

Consignes strictes :
1. Fondez vos réponses EXCLUSIVEMENT sur le dossier clinique fourni ci-dessus.
2. Si la question n'a pas de rapport avec le patient ou la pratique médicale, refusez poliment d'y répondre.
3. Donnez des recommandations pratiques et axées sur la sécurité.
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Format chat history
    const geminiHistory = [
      { role: "user", parts: [{ text: systemPrompt + "\nInitialisez l'assistant." }] },
      { role: "model", parts: [{ text: "Compris. Je suis prêt à analyser le dossier de ce patient et à répondre à vos questions cliniques." }] },
      ...history.map((h) => ({
        role: h.role,
        parts: [{ text: h.content }],
      })),
    ];

    const chatSession = model.startChat({
      history: geminiHistory,
    });

    try {
      const result = await chatSession.sendMessage(query);
      const responseText = result.response.text();

      // Log the AI Query to audit logs (counts towards daily quota)
      await logAuditAction(userId, "AI_QUERY", "Patient", patientId, { query });

      return responseText;
    } catch (err: any) {
      // Surface Gemini 429 quota errors with retry info
      if (err?.status === 429) {
        const retryInfo = err?.errorDetails?.find(
          (d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
        );
        const delayStr: string = retryInfo?.retryDelay ?? "60s";
        const seconds = parseInt(delayStr, 10) || 60;
        throw new RateLimitError(seconds);
      }
      // Surface Gemini 503 overload errors
      if (err?.status === 503) {
        throw new ServiceUnavailableError();
      }
      throw err;
    }
  }
}
