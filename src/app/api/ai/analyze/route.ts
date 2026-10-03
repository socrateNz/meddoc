import { NextResponse } from "next/server";
import { AiService } from "@/services/AiService";
import { requireApiUser } from "@/lib/api-auth";
import { verifyPatientAccess } from "@/lib/auth";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";

export async function POST(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 20, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"]);
    if ("response" in auth) return auth.response;

    const { patientId } = await req.json();

    if (!patientId) {
      return NextResponse.json({ error: "patientId requis" }, { status: 400 });
    }

    // Sans ce contrôle, n'importe quel identifiant de patient (d'une autre clinique) était analysé.
    if (!(await verifyPatientAccess(patientId, auth.user))) {
      return NextResponse.json({ error: "Accès IA non autorisé" }, { status: 403 });
    }

    const analysis = await AiService.analyzePatient(patientId);
    return NextResponse.json(analysis, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur" }, { status: 500 });
  }
}
