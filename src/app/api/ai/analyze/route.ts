import { NextResponse } from "next/server";
import { AiService } from "@/services/AiService";

export async function POST(req: Request) {
  try {
    const role = req.headers.get("x-user-role");
    
    // Seulement Admin, Coordinateur et Soignant (selon permissions)
    if (role === "PATIENT" || role === "FAMILY") {
      return NextResponse.json({ error: "Accès IA non autorisé" }, { status: 403 });
    }

    const { patientId } = await req.json();

    if (!patientId) {
      return NextResponse.json({ error: "patientId requis" }, { status: 400 });
    }

    const analysis = await AiService.analyzePatient(patientId);
    return NextResponse.json(analysis, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erreur serveur" }, { status: 500 });
  }
}
