import { NextResponse } from "next/server";
import { IncidentService } from "@/services/IncidentService";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { requireApiUser } from "@/lib/api-auth";
import { parsePagination } from "@/lib/pagination";
import { getOrgScopeWhere } from "@/lib/org-scope";
import { verifyPatientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { Priority } from "@prisma/client";

const createIncidentSchema = z.object({
  patientId: z.string().min(1),
  title: z.string().min(5),
  description: z.string().min(10),
  priority: z.nativeEnum(Priority).optional(),
});

const INCIDENT_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER"];

export async function GET(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 60, 60000);
    if (limited) return limited;

    const auth = await requireApiUser(INCIDENT_ROLES);
    if ("response" in auth) return auth.response;
    const { page, pageSize, skip, take } = parsePagination(new URL(req.url).searchParams);

    const where = { patient: getOrgScopeWhere(auth.user) };
    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: { patient: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.incident.count({ where }),
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

    const auth = await requireApiUser(INCIDENT_ROLES);
    if ("response" in auth) return auth.response;

    const body = await req.json();
    const data = createIncidentSchema.parse(body);

    if (!(await verifyPatientAccess(data.patientId, auth.user))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const newIncident = await IncidentService.createIncident(data, auth.user.id);
    return NextResponse.json(newIncident, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur lors de la déclaration" }, { status: 500 });
  }
}
