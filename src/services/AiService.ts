import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/db";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_API_KEY");

export class AiService {
  static async analyzePatient(patientId: string) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        incidents: true,
        carePlans: { include: { medications: true, tasks: true } },
        medicalRecords: true,
      }
    });

    if (!patient) throw new Error("Patient introuvable");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Tu es un assistant médical IA. Analyse ce dossier patient et :
      1. Fais un résumé synthétique.
      2. Identifie les risques (chute, déshydratation, non-observance).
      3. Donne un score de risque global sur 10.
      
      Dossier: ${JSON.stringify(patient, null, 2)}
      
      Réponds au format JSON strict:
      {
        "summary": "Résumé ici",
        "riskScore": 5,
        "riskFactors": ["Risque 1", "Risque 2"],
        "recommendations": ["Recommandation 1"]
      }
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      // Nettoyage markdown json
      if (text.startsWith("\`\`\`json")) {
        text = text.replace("\`\`\`json", "").replace("\`\`\`", "");
      }

      const parsed = JSON.parse(text);

      return prisma.aIAnalysis.create({
        data: {
          patientId,
          riskScore: parsed.riskScore,
          summary: parsed.summary,
          riskFactors: parsed.riskFactors,
          recommendations: parsed.recommendations,
        }
      });
    } catch (e) {
      console.error("Erreur Gemini API:", e);
      throw new Error("L'analyse IA a échoué.");
    }
  }
}
