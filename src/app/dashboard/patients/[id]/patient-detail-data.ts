// Logique de données partagée par les DEUX pages de dossier patient — /dashboard/patients/[id] et
// /dashboard/clinics/[id]/patients/[patientId] (même dossier, deux points d'entrée : l'un pour un
// utilisateur déjà scopé à sa clinique, l'autre pour un admin holding qui choisit la clinique).
// Avant ce fichier, chaque page.tsx redéfinissait sa propre requête Prisma et son propre Promise.all
// de lectures associées : elles avaient fini par diverger (ex: le lit/chambre du patient n'était
// chargé que côté /dashboard/patients, pas côté clinique) sans que personne ne le décide — un seul
// endroit maintenant, utilisé par les deux pages (cf. patient-detail-view.tsx, même principe).
//
// Module volontairement SANS directive "use server"/"use client" : simples fonctions serveur
// (Prisma, lectures), importées uniquement par des Server Components.

import { prisma } from "@/lib/db";
import { getPatientVitalSigns } from "@/actions/vitals";
import { listPrescriptions } from "@/actions/prescriptions";
import { listLabOrders } from "@/actions/lab";
import { listPregnancies } from "@/actions/maternity";
import { MAX_PAGE_SIZE } from "@/lib/pagination";

// Inclusion Prisma complète du dossier : utilisée telle quelle par les deux page.tsx pour que leurs
// arbres de données ne puissent plus diverger.
export const PATIENT_DETAIL_INCLUDE = {
  user: true,
  medicalRecords: {
    include: {
      appointment: { select: { id: true, title: true, scheduledAt: true } },
    },
    orderBy: { createdAt: "desc" as const },
  },
  carePlans: {
    include: {
      medications: true,
      tasks: { orderBy: { scheduledFor: "asc" as const } },
    },
    orderBy: { startDate: "desc" as const },
  },
  appointments: {
    include: { caregiver: { include: { user: true } } },
    orderBy: { scheduledAt: "desc" as const },
  },
  incidents: { orderBy: { createdAt: "desc" as const } },
  aiAnalyses: { orderBy: { createdAt: "desc" as const } },
  bed: { include: { room: { include: { ward: true } } } },
  organization: { select: { name: true, logoUrl: true } },
} as const;

// Les 5 lectures associées (constantes, ordonnances, labo, grossesses, soignants) sont indépendantes
// les unes des autres — lancées en parallèle, chacune défensive (une erreur individuelle retombe
// sur un tableau vide plutôt que de faire échouer toute la page).
export async function fetchPatientRelatedData(
  patientId: string,
  options: {
    isPharmacist: boolean;
    organizationIdForCaregivers: string | null | undefined;
    // Pages demandées (?rxPage / ?labPage) : chaque liste ne charge jamais plus de 20 éléments.
    rxPage?: number;
    labPage?: number;
    vitalPage?: number;
    pregnancyPage?: number;
  }
) {
  const { isPharmacist, organizationIdForCaregivers, rxPage = 1, labPage = 1, vitalPage = 1, pregnancyPage = 1 } = options;

  const EMPTY_PAGE = { data: [] as any[], total: 0, page: 1, pageSize: MAX_PAGE_SIZE };
  const [vitalsPage, prescriptionsPage, labOrdersPage, pregnanciesPage, caregivers] = await Promise.all([
    // Une page de 20 relevés (graphique et tableau) ; le total reste exact pour la navigation.
    getPatientVitalSigns(patientId, { page: vitalPage })
      .then((r) => (r.success ? { data: r.data as any[], total: r.total, page: r.page, pageSize: r.pageSize } : EMPTY_PAGE))
      .catch(() => EMPTY_PAGE),
    isPharmacist
      ? Promise.resolve(EMPTY_PAGE)
      : listPrescriptions({ patientId, page: rxPage })
          .then((r) => (r.success ? { data: r.data || [], total: r.total, page: r.page, pageSize: r.pageSize } : EMPTY_PAGE))
          .catch(() => EMPTY_PAGE),
    isPharmacist
      ? Promise.resolve(EMPTY_PAGE)
      : listLabOrders({ patientId, page: labPage })
          .then((r) => (r.success ? { data: r.data || [], total: r.total, page: r.page, pageSize: r.pageSize } : EMPTY_PAGE))
          .catch(() => EMPTY_PAGE),
    isPharmacist
      ? Promise.resolve(EMPTY_PAGE)
      : listPregnancies(patientId, { page: pregnancyPage })
          .then((r) => (r.success ? { data: r.data || [], total: r.total, page: r.page, pageSize: r.pageSize } : EMPTY_PAGE))
          .catch(() => EMPTY_PAGE),
    isPharmacist || !organizationIdForCaregivers
      ? Promise.resolve([])
      : prisma.caregiver.findMany({
          where: { user: { organizationId: organizationIdForCaregivers } },
          include: { user: true },
          orderBy: { user: { lastName: "asc" } },
        }),
  ]);

  return {
    vitalSigns: vitalsPage.data,
    vitalSignsPage: { page: vitalsPage.page, pageSize: vitalsPage.pageSize, total: vitalsPage.total },
    prescriptions: prescriptionsPage.data,
    prescriptionsPage: { page: prescriptionsPage.page, pageSize: prescriptionsPage.pageSize, total: prescriptionsPage.total },
    labOrders: labOrdersPage.data,
    labOrdersPage: { page: labOrdersPage.page, pageSize: labOrdersPage.pageSize, total: labOrdersPage.total },
    pregnancies: pregnanciesPage.data,
    pregnanciesPage: { page: pregnanciesPage.page, pageSize: pregnanciesPage.pageSize, total: pregnanciesPage.total },
    caregivers,
  };
}

export function calculatePatientAge(birthDate: Date | string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function formatPatientDate(date: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(date));
}

export function formatPatientDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

// Prochain rendez-vous à venir : le plus proche dans le futur parmi ceux encore planifiés (jamais
// un rendez-vous déjà passé ou annulé) — `appointments` peut être trié dans n'importe quel ordre.
export function findNextAppointment<T extends { status: string; scheduledAt: Date | string }>(
  appointments: T[],
  now: Date = new Date()
): T | null {
  const upcoming = appointments.filter((a) => a.status === "SCHEDULED" && new Date(a.scheduledAt) >= now);
  if (upcoming.length === 0) return null;
  return upcoming.reduce((soonest, a) => (new Date(a.scheduledAt) < new Date(soonest.scheduledAt) ? a : soonest));
}

export type ActivityCategory = "record" | "prescription" | "lab" | "appointment" | "incident";

export interface ActivityEntry {
  key: string;
  category: ActivityCategory;
  date: Date;
  title: string;
  meta?: string;
  // Navigation réelle si une consultation précise est connue (dossier/ordonnance rattaché à un
  // rendez-vous, demande de labo, rendez-vous lui-même) — sinon repli sur `tab`, l'onglet du
  // dossier patient à activer. patient-detail-view.tsx rend un <Link> dans le premier cas, un
  // bouton qui change d'onglet dans le second ; cette fonction reste pure (pas de JSX ici).
  href?: string;
  tab?: string;
}

interface LinkedAppointment {
  id: string;
}

// Fusionne dossier médical, ordonnances, labo, rendez-vous et incidents en un seul fil
// chronologique — l'onglet « Aperçu » du dossier patient en affiche les N plus récents, chacun
// cliquable vers son propre onglet/sa propre page. Fonction pure (testable sans rendu React) ;
// patient-detail-view.tsx se charge de l'affichage (icône, couleur) par catégorie.
export function buildPatientActivityTimeline(data: {
  medicalRecords: Array<{ id: string; title: string; createdAt: Date | string; appointment?: LinkedAppointment | null }>;
  prescriptions: Array<{
    id: string;
    createdAt: Date | string;
    prescribedBy?: { firstName: string; lastName: string } | null;
    appointment?: LinkedAppointment | null;
  }>;
  labOrders: Array<{ id: string; tests: string[]; createdAt: Date | string }>;
  appointments: Array<{ id: string; title: string; status: string; scheduledAt: Date | string }>;
  incidents: Array<{ id: string; title: string; priority: string; createdAt: Date | string }>;
  limit?: number;
}): ActivityEntry[] {
  const consultationHref = (appointmentId: string) => `/dashboard/appointments/${appointmentId}/consultation`;

  const entries: ActivityEntry[] = [
    ...data.medicalRecords.map((r) => ({
      key: `record-${r.id}`,
      category: "record" as const,
      date: new Date(r.createdAt),
      title: r.title,
      tab: "records",
      href: r.appointment ? consultationHref(r.appointment.id) : undefined,
    })),
    ...data.prescriptions.map((p) => ({
      key: `prescription-${p.id}`,
      category: "prescription" as const,
      date: new Date(p.createdAt),
      title: `Ordonnance du ${formatPatientDate(p.createdAt)}`,
      meta: p.prescribedBy ? `Par ${p.prescribedBy.firstName} ${p.prescribedBy.lastName}` : undefined,
      tab: "prescriptions",
      href: p.appointment ? consultationHref(p.appointment.id) : undefined,
    })),
    ...data.labOrders.map((o) => ({
      key: `lab-${o.id}`,
      category: "lab" as const,
      date: new Date(o.createdAt),
      title: o.tests.join(", ") || "Demande d'analyse",
      href: `/dashboard/lab/${o.id}`,
    })),
    ...data.appointments.map((a) => ({
      key: `appointment-${a.id}`,
      category: "appointment" as const,
      date: new Date(a.scheduledAt),
      title: a.title,
      meta: a.status === "COMPLETED" ? "Terminé" : a.status === "CANCELLED" ? "Annulé" : "Planifié",
      href: consultationHref(a.id),
    })),
    ...data.incidents.map((i) => ({
      key: `incident-${i.id}`,
      category: "incident" as const,
      date: new Date(i.createdAt),
      title: i.title,
      meta: i.priority,
      tab: "incidents",
    })),
  ];

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries.slice(0, data.limit ?? 8);
}
