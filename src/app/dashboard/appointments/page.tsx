import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
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

export default async function AppointmentsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  // Utilisé par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ».
  const cachedAt = new Date().toISOString();

  // Filtrage par organisation : une holding voit ses cliniques, une clinique
  // ne voit que ses propres données (cf. src/app/dashboard/page.tsx:82-91).
  const orgFilter: any = {};
  if (currentUser.organization?.type === "HOLDING") {
    orgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } },
    ];
  } else if (currentUser.organization?.type === "CLINIC") {
    orgFilter.organizationId = currentUser.organizationId;
  } else {
    // Tableau `in` vide : ne matche jamais, sans faire planter Prisma sur un ObjectId invalide.
    orgFilter.organizationId = { in: [] };
  }

  const [appointments, patients, caregivers] = await Promise.all([
    prisma.appointment.findMany({
      where: { patient: orgFilter },
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
      where: orgFilter,
      include: { user: true },
      orderBy: {
        user: {
          lastName: "asc",
        },
      },
    }),
    prisma.caregiver.findMany({
      where: { user: orgFilter },
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
          Planifiez, organisez et suivez les consultations et interventions médicales en vue calendrier Outlook.
        </p>
      </div>

      <OutlookCalendar
        initialAppointments={appointments as any}
        patients={patients as any}
        caregivers={caregivers as any}
      />

      <CacheWriter
        cacheKey={`appointments:${currentUser.organizationId ?? "none"}`}
        updatedAt={cachedAt}
        routeFamily="appointments"
        contextHint={{ organizationId: currentUser.organizationId ?? "none" }}
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
