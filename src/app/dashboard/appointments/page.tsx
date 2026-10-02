import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import CacheWriter from "@/components/cache-writer";
import OutlookCalendar from "@/components/calendar/outlook-calendar";
import { getCalendarItems } from "@/actions/calendar";
import type { CalendarAppointment } from "@/components/calendar/types";

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
  // ne voit que ses propres données (cf. src/app/dashboard/page.tsx:82-91). Ne sert plus qu'aux
  // listes patients/soignants des dialogues (rendez-vous/garde) — les rendez-vous eux-mêmes
  // viennent maintenant de getCalendarItems (cf. src/actions/calendar.ts), qui applique sa
  // propre matrice de visibilité par rôle (mien ou non affecté / org-wide selon le rôle).
  // Deux variables distinctes (plutôt qu'un seul `any` partagé comme avant) : le même filtre
  // HOLDING/CLINIC/autre s'applique directement sur Patient, mais sur Caregiver il doit être
  // imbriqué sous `user` — deux types Prisma différents (cf. même correctif dans
  // src/actions/calendar.ts).
  const patientOrgFilter: Prisma.PatientWhereInput = {};
  const userOrgFilter: Prisma.UserWhereInput = {};
  if (currentUser.organization?.type === "HOLDING") {
    patientOrgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } },
    ];
    userOrgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } },
    ];
  } else if (currentUser.organization?.type === "CLINIC") {
    patientOrgFilter.organizationId = currentUser.organizationId;
    userOrgFilter.organizationId = currentUser.organizationId;
  } else {
    // Tableau `in` vide : ne matche jamais, sans faire planter Prisma sur un ObjectId invalide.
    patientOrgFilter.organizationId = { in: [] };
    userOrgFilter.organizationId = { in: [] };
  }

  const [calendarRes, patients, caregivers] = await Promise.all([
    getCalendarItems(),
    prisma.patient.findMany({
      where: patientOrgFilter,
      include: { user: true },
      orderBy: {
        user: {
          lastName: "asc",
        },
      },
    }),
    prisma.caregiver.findMany({
      where: { user: userOrgFilter },
      include: { user: true },
      orderBy: {
        user: {
          lastName: "asc",
        },
      },
    }),
  ]);

  const items = calendarRes.success ? calendarRes.data! : [];
  // Étape transitoire (cf. plan « Calendrier unifié ») : OutlookCalendar ne comprend encore que
  // CalendarAppointment — on dérive la liste d'origine depuis item.raw plutôt que de refaire une
  // requête Appointment séparée. La vue se généralisera à CalendarItem[] à l'étape suivante.
  const appointments = items
    .filter((i) => i.kind === "APPOINTMENT")
    .map((i) => i.raw as AppointmentWithRelations);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Calendrier</h1>
        <p className="text-muted-foreground text-sm">
          Planifiez, organisez et suivez les consultations et interventions médicales en vue calendrier Outlook.
        </p>
      </div>

      <OutlookCalendar
        initialAppointments={appointments as unknown as CalendarAppointment[]}
        patients={patients}
        caregivers={caregivers}
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
