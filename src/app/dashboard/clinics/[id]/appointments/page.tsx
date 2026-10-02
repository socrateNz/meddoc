import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import CacheWriter from "@/components/cache-writer";
import OutlookCalendar from "@/components/calendar/outlook-calendar";
import { getCalendarItems } from "@/actions/calendar";

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

  // clinics/[id]/layout.tsx a déjà vérifié que clinicId appartient bien à l'utilisateur courant
  // avant que cette page ne s'exécute — ce qui suit n'est donc pas un contrôle d'accès, juste la
  // résolution de l'utilisateur nécessaire à getCalendarItems() pour appliquer sa matrice de
  // visibilité par rôle (mien ou non affecté / org-wide).
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  // Utilisé par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ».
  const cachedAt = new Date().toISOString();

  const [calendarRes, patients, caregivers, staffUsers] = await Promise.all([
    getCalendarItems({ clinicId }),
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
    prisma.user.findMany({
      where: { organizationId: clinicId, isActive: true, role: { in: ["COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER"] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { lastName: "asc" },
    }),
  ]);

  const items = calendarRes.success ? calendarRes.data! : [];
  // Conservé pour CacheWriter ci-dessous (aperçu instantané), dérivé depuis item.raw plutôt que
  // de refaire une requête Appointment séparée (cf. src/actions/calendar.ts).
  const appointments = items
    .filter((i) => i.kind === "APPOINTMENT")
    .map((i) => i.raw as AppointmentWithRelations);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Calendrier</h1>
        <p className="text-muted-foreground text-sm">
          Rendez-vous, gardes, tâches de soins et échéances pour cet établissement.
        </p>
      </div>

      <OutlookCalendar
        initialItems={items}
        patients={patients}
        caregivers={caregivers}
        staffUsers={staffUsers}
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
