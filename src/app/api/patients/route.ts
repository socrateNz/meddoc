import { NextResponse } from "next/server";
import { PatientService } from "@/services/PatientService";
import { z } from "zod";

const createPatientSchema = z.object({
  userId: z.string().min(1),
  dateOfBirth: z.string().datetime(),
  address: z.string().min(5),
  emergencyContact: z.string().optional(),
  dependencyLevel: z.number().min(1).max(5).optional(),
  pathologies: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
});

export async function GET(req: Request) {
  try {
    const role = req.headers.get("x-user-role");
    
    // RBAC
    if (role === "PATIENT" || role === "FAMILY") {
      return NextResponse.json({ error: "Accès non autorisé à la liste globale" }, { status: 403 });
    }

    const patients = await PatientService.getPatients();
    return NextResponse.json(patients);
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const role = req.headers.get("x-user-role");
    
    // Seuls Admin et Coordinateur peuvent créer un dossier patient
    if (role !== "ADMIN" && role !== "COORDINATOR") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await req.json();
    const data = createPatientSchema.parse(body);

    const newPatient = await PatientService.createPatient(data);
    return NextResponse.json(newPatient, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur lors de la création du patient" }, { status: 500 });
  }
}
