import { NextResponse } from "next/server";
import { IncidentService } from "@/services/IncidentService";
import { z } from "zod";
import { Priority } from "@prisma/client";

const createIncidentSchema = z.object({
  patientId: z.string().min(1),
  title: z.string().min(5),
  description: z.string().min(10),
  priority: z.nativeEnum(Priority).optional(),
});

export async function GET(req: Request) {
  try {
    const role = req.headers.get("x-user-role");
    
    // Seulement Admin, Coordinateur et Soignant
    if (role === "PATIENT" || role === "FAMILY") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const incidents = await IncidentService.getIncidents();
    return NextResponse.json(incidents);
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");
    
    if (!userId || role === "PATIENT" || role === "FAMILY") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await req.json();
    const data = createIncidentSchema.parse(body);

    const newIncident = await IncidentService.createIncident(data, userId);
    return NextResponse.json(newIncident, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur lors de la déclaration" }, { status: 500 });
  }
}
