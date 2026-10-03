import { NextResponse } from "next/server";
import { PatientService } from "@/services/PatientService";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { requireApiUser } from "@/lib/api-auth";
import { parsePagination } from "@/lib/pagination";
import { getOrgScopeWhere } from "@/lib/org-scope";
import { prisma } from "@/lib/db";
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

const PATIENT_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST"];

export async function GET(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 60, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(PATIENT_READ_ROLES);
    if ("response" in auth) return auth.response;
    const { page, pageSize, skip, take } = parsePagination(new URL(req.url).searchParams);

    const where = getOrgScopeWhere(auth.user);
    const [items, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: { user: true },
        orderBy: { user: { lastName: "asc" } },
        skip,
        take,
      }),
      prisma.patient.count({ where }),
    ]);

    return NextResponse.json({ data: items, total, page, pageSize });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 20, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(["ADMIN", "COORDINATOR"]);
    if ("response" in auth) return auth.response;

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
