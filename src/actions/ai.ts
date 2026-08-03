"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Dictée vocale et analyse IA : même rôle que pour clôturer une consultation
// (COORDINATOR/MEDECIN) — l'autorité diagnostique, pas le personnel infirmier.
const CLINICAL_WRITE_ROLES = ["COORDINATOR", "MEDECIN"];

export async function transcribeConsultationAudio(audioBase64: string, mimeType: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    if (!CLINICAL_WRITE_ROLES.includes(activeUser.role)) {
      throw new Error("Non autorisé.");
    }
    if (!audioBase64) throw new Error("Aucun enregistrement audio fourni.");

    const prompt = `Vous êtes un assistant de transcription clinique. Écoutez cet enregistrement audio d'une consultation médicale (probablement en français) et structurez fidèlement ce qui a été dit au format JSON strict suivant :
{
  "symptoms": "Symptômes et observations rapportés, tels qu'entendus",
  "diagnosis": "Diagnostic ou évaluation clinique mentionné, tel qu'entendu",
  "plan": "Plan de traitement, recommandations ou suivi mentionné, tel qu'entendu"
}
Règle impérative : ne retranscrivez QUE ce qui est réellement dit dans l'enregistrement. Si une section n'est pas abordée, renvoyez une chaîne vide "" pour ce champ — n'inventez et ne complétez jamais avec des informations non énoncées.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const response = await model.generateContent([
      { inlineData: { mimeType, data: audioBase64 } },
      { text: prompt },
    ]);

    const parsed = JSON.parse(response.response.text());

    return {
      success: true,
      data: {
        symptoms: typeof parsed.symptoms === "string" ? parsed.symptoms : "",
        diagnosis: typeof parsed.diagnosis === "string" ? parsed.diagnosis : "",
        plan: typeof parsed.plan === "string" ? parsed.plan : "",
      },
    };
  } catch (error: any) {
    console.error("Audio transcription error:", error);

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

    if (error?.status === 503) {
      return {
        success: false,
        serviceUnavailable: true,
        error: "Le service IA est momentanément surchargé. Veuillez réessayer dans quelques instants.",
      };
    }

    return { success: false, error: error.message || "Impossible de transcrire l'enregistrement audio." };
  }
}

export async function generateAIAnalysis(patientId: string) {
  try {
    z.string().min(1, "Patient requis").parse(patientId);
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }
    if (!CLINICAL_WRITE_ROLES.includes(activeUser.role)) {
      throw new Error("Non autorisé.");
    }

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

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
        prescriptions: {
          where: { status: { in: ["ACTIVE", "SENT_TO_PHARMACY", "DISPENSED"] } },
          include: { items: true },
          orderBy: { createdAt: "desc" },
          take: 10,
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

    const prescriptionsSummary = patient.prescriptions
      .map((p) => p.items.map((i) => `- ${i.drugName} (${i.dosage}, ${i.frequency})`).join("\n"))
      .join("\n\n");

    const prompt = `
Vous êtes un assistant clinique expert spécialisé dans la gestion hospitalière et clinique.
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

ORDONNANCES RÉCENTES :
${prescriptionsSummary || "Aucune ordonnance récente."}
---

Générez votre rapport d'analyse clinique au format JSON strict. Le JSON doit suivre précisément cette structure de type :
{
  "summary": "Résumé de l'état de santé globale et points de vigilance majeurs (en français, environ 100 mots)",
  "riskScore": 75, // Un nombre entier entre 0 et 100 représentant le risque d'incident/détérioration
  "riskFactors": ["Facteur de risque 1", "Facteur de risque 2"], // Liste textuelle des causes principales du risque
  "recommendations": ["Recommandation 1", "Recommandation 2"] // Actions concrètes à mener par l'équipe médicale de l'établissement
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
