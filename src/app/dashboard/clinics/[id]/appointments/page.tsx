import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import CacheWriter from "@/components/cache-writer";
import OutlookCalendar from "@/components/calendar/outlook-calendar";

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: {
    patient: {
      include: { user: true };
    };
    caregiver: {
      include: { user: true };
    };
  };
}>;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicAppointmentsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

  // Utilisé par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ».
  const cachedAt = new Date().toISOString();

  const [appointments, patients, caregivers] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        patient: {
          organizationId: clinicId,
        },
      },
      include: {
        patient: {
          include: { user: true },
        },
        caregiver: {
          include: { user: true },
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
      take: 500,
    }),
    prisma.patient.findMany({
      where: {
        organizationId: clinicId,
      },
      include: { user: true },
      orderBy: {
        user: {
          lastName: "asc",
        },
      },
    }),
    prisma.caregiver.findMany({
      where: {
        user: {
          organizationId: clinicId,
        },
      },
      include: { user: true },
      orderBy: {
        user: {
          lastName: "asc",
        },
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Rendez-vous</h1>
        <p className="text-muted-foreground text-sm">
          Calendrier et gestion des consultations cliniques pour cet établissement.
        </p>
      </div>

      <OutlookCalendar
        initialAppointments={appointments as any}
        patients={patients as any}
        caregivers={caregivers as any}
      />

      <CacheWriter
        cacheKey={`appointments:${clinicId}`}
        updatedAt={cachedAt}
        data={{
          totalCount: appointments.length,
          appointments: appointments.slice(0, 20).map((apt: AppointmentWithRelations) => ({
            id: apt.id,
            title: apt.title,
            status: apt.status,
            type: apt.type,
            scheduledAt: apt.scheduledAt.toISOString(),
            durationMinutes: apt.durationMinutes,
            patientName: `${apt.patient.user.lastName} ${apt.patient.user.firstName}`,
            caregiverName: apt.caregiver ? apt.caregiver.user.lastName : null,
          })),
        }}
      />
    </div>
  );
}
