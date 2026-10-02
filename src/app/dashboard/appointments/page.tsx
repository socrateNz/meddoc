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

  const [calendarRes, patients, caregivers, staffUsers] = await Promise.all([
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
    // Plus large que `caregivers` : le sélecteur d'affecté du dialogue de garde (Shift.userId)
    // couvre n'importe quel rôle de staff, pas seulement MEDECIN/CAREGIVER.
    prisma.user.findMany({
      where: { ...userOrgFilter, isActive: true, role: { in: ["COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER"] } },
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
          Rendez-vous, gardes, tâches de soins et échéances en un seul calendrier.
        </p>
      </div>

      <OutlookCalendar
        initialItems={items}
        patients={patients}
        caregivers={caregivers}
        staffUsers={staffUsers}
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
