"use server";

import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function generateAIAnalysis(patientId: string) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        user: true,
        medicalRecords: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        carePlans: {
          include: {
            medications: true,
          },
          where: { status: "ACTIVE" },
        },
      },
    });

    if (!patient) {
      throw new Error("Patient non trouvé.");
    }

    const age = new Date().getFullYear() - patient.dateOfBirth.getFullYear();
    const pathologies = patient.pathologies.join(", ") || "Aucune pathologie déclarée";
    const allergies = patient.allergies.join(", ") || "Aucune allergie déclarée";

    const medicalRecordsSummary = patient.medicalRecords
      .map((r) => `[${r.createdAt.toLocaleDateString()}] ${r.title}: ${r.description}`)
      .join("\n\n");

    const carePlansSummary = patient.carePlans
      .map(
        (p) =>
          `Plan: ${p.title}\nTraitements:\n` +
          p.medications.map((m) => `- ${m.name} (${m.dosage}, ${m.frequency})`).join("\n")
      )
      .join("\n\n");

    const prompt = `
Vous êtes un assistant clinique expert spécialisé dans l'accompagnement et la gestion de soins à domicile.
Analysez le profil du patient suivant pour évaluer son score de risque de santé global, identifier les facteurs de risque clés et proposer des recommandations de soins.

---
PROFIL DU PATIENT :
Nom complet : ${patient.user.lastName} ${patient.user.firstName}
Âge : ${age} ans
Niveau de dépendance : ${patient.dependencyLevel} sur 5
Pathologies : ${pathologies}
Allergies : ${allergies}

RAPPORTS MÉDICAUX RÉCENTS :
${medicalRecordsSummary || "Aucune note médicale récente."}

PLANS DE SOINS ET TRAITEMENTS ACTUELS :
${carePlansSummary || "Aucun plan de soins ou traitement en cours."}
---

Générez votre rapport d'analyse clinique au format JSON strict. Le JSON doit suivre précisément cette structure de type :
{
  "summary": "Résumé de l'état de santé globale et points de vigilance majeurs (en français, environ 100 mots)",
  "riskScore": 75, // Un nombre entier entre 0 et 100 représentant le risque d'incident/détérioration
  "riskFactors": ["Facteur de risque 1", "Facteur de risque 2"], // Liste textuelle des causes principales du risque
  "recommendations": ["Recommandation 1", "Recommandation 2"] // Actions concrètes à mener par l'équipe de soignants à domicile
}
    `;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const response = await model.generateContent(prompt);
    const responseText = response.response.text();
    const parsedData = JSON.parse(responseText);

    // Save the analysis in database
    const analysis = await prisma.aIAnalysis.create({
      data: {
        patientId,
        riskScore: Number(parsedData.riskScore) || 0,
        riskFactors: parsedData.riskFactors || [],
        summary: parsedData.summary || "",
        recommendations: parsedData.recommendations || [],
      },
    });

    revalidatePath(`/dashboard/patients/${patientId}`);
    return { success: true, data: analysis };
  } catch (error: any) {
    console.error("AI Analysis generation error:", error);

    // Surface Gemini 429 quota errors explicitly
    if (error?.status === 429) {
      const retryInfo = error?.errorDetails?.find(
        (d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
      );
      const delayStr: string = retryInfo?.retryDelay ?? "60s";
      const retryAfterSeconds = parseInt(delayStr, 10) || 60;
      return {
        success: false,
        rateLimited: true,
        retryAfterSeconds,
        error: `Quota IA dépassé — réessayez dans ${retryAfterSeconds} secondes.`,
      };
    }

    // Surface Gemini 503 overload errors explicitly
    if (error?.status === 503) {
      return {
        success: false,
        serviceUnavailable: true,
        error: "Le service IA est momentanément surchargé. Veuillez réessayer dans quelques instants.",
      };
    }

    return { success: false, error: error.message || "Impossible de générer l'analyse IA" };
  }
}
