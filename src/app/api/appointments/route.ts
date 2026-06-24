import { NextResponse } from "next/server";
import { AppointmentService } from "@/services/AppointmentService";
import { z } from "zod";

const createApptSchema = z.object({
  patientId: z.string().min(1),
  caregiverId: z.string().optional(),
  title: z.string().min(3),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().min(15),
  type: z.enum(["VISIT", "CONSULTATION", "TELECONSULTATION"]),
});

export async function GET(req: Request) {
  try {
    const userId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");
    
    if (!userId || !role) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const appointments = await AppointmentService.getAppointmentsForUser(userId, role);
    return NextResponse.json(appointments);
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const role = req.headers.get("x-user-role");
    
    // Seuls Admin, Coordinateur et Soignant peuvent créer un rendez-vous
    if (role === "PATIENT" || role === "FAMILY") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await req.json();
    const data = createApptSchema.parse(body);

    const newAppt = await AppointmentService.createAppointment(data);
    return NextResponse.json(newAppt, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }
}
