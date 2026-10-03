import { NextResponse } from "next/server";
import { AppointmentService } from "@/services/AppointmentService";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { requireApiUser } from "@/lib/api-auth";
import { parsePagination } from "@/lib/pagination";
import { getOrgScopeWhere } from "@/lib/org-scope";
import { verifyPatientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const createApptSchema = z.object({
  patientId: z.string().min(1),
  caregiverId: z.string().optional(),
  title: z.string().min(3),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().min(15),
  type: z.enum(["VISIT", "CONSULTATION", "TELECONSULTATION"]),
});

const APPOINTMENT_WRITE_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER"];

export async function GET(req: Request) {
  try {
    const limited = await rateLimitOrResponse(req, 60, 60000);
    if (limited) return limited;

    const auth = await requireApiUser();
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const { page, pageSize, skip, take } = parsePagination(new URL(req.url).searchParams);

    let where: Prisma.AppointmentWhereInput;
    if (user.role === "CAREGIVER" || user.role === "MEDECIN") {
      const caregiver = await prisma.caregiver.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!caregiver) return NextResponse.json({ data: [], total: 0, page, pageSize });
      where = { caregiverId: caregiver.id, patient: getOrgScopeWhere(user) };
    } else if (user.role === "PATIENT") {
      const patient = await prisma.patient.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!patient) return NextResponse.json({ data: [], total: 0, page, pageSize });
      where = { patientId: patient.id };
    } else if (user.role === "FAMILY") {
      const family = await prisma.familyMember.findUnique({ where: { userId: user.id }, select: { patientId: true } });
      if (!family) return NextResponse.json({ data: [], total: 0, page, pageSize });
      where = { patientId: family.patientId };
    } else {
      where = { patient: getOrgScopeWhere(user) };
    }

    const [items, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          patient: { include: { user: true } },
          caregiver: { include: { user: true } },
        },
        orderBy: { scheduledAt: "asc" },
        skip,
        take,
      }),
      prisma.appointment.count({ where }),
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

    const auth = await requireApiUser(APPOINTMENT_WRITE_ROLES);
    if ("response" in auth) return auth.response;

    const body = await req.json();
    const data = createApptSchema.parse(body);

    if (!(await verifyPatientAccess(data.patientId, auth.user))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const newAppt = await AppointmentService.createAppointment(data);
    return NextResponse.json(newAppt, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }
}
