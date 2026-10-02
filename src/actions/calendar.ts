"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import type { CalendarItem } from "@/components/calendar/types";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Rôles admis à voir QUELQUE CHOSE sur le calendrier unifié (cf. plan « Calendrier unifié ») —
// élargi par rapport à l'ancien APPOINTMENT_SCHEDULE_ROLES de src/actions/appointments.ts pour
// que PHARMACIST voie l'expiration de stock + ses propres gardes/événements, et que CASHIER voie
// ses propres gardes/événements, même sans jamais voir un rendez-vous patient (cf.
// APPOINTMENT_CARETASK_ROLES plus bas). Garder en phase avec src/middleware.ts
// (restrictedSections.appointments) et src/app/dashboard/sidebar.tsx — les trois doivent changer
// ensemble, sinon le lien apparaît mais redirige silencieusement (ou l'inverse).
const CALENDAR_ACCESS_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER"];
// Lecture org-wide (par opposition à "mien ou non affecté") — même convention que
// CONTRACT_READ_ROLES (ADMIN en lecture seule, jamais en écriture) déjà établie dans contracts.ts.
const ORG_WIDE_READ_ROLES = ["ADMIN", "COORDINATOR"];
// Rendez-vous et tâches de soins ne concernent que le personnel clinique — jamais PHARMACIST/
// CASHIER, qui n'ont de toute façon aucun Caregiver associé (cf. team.ts : seuls MEDECIN et
// CAREGIVER en reçoivent un à la création).
const APPOINTMENT_CARETASK_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
// Mêmes rôles que CONTRACT_READ_ROLES (src/actions/contracts.ts) — une échéance de contrat n'a
// aucun sens pour un rôle qui ne peut déjà pas voir le contrat lui-même.
const CONTRACT_DEADLINE_ROLES = ["ADMIN", "COORDINATOR"];
// Mêmes rôles que l'accès à la page Pharmacie (cf. src/middleware.ts: pharmacie).
const STOCK_EXPIRY_ROLES = ["ADMIN", "COORDINATOR", "PHARMACIST"];
// Seul COORDINATOR planifie le personnel — ADMIN reste en lecture seule ici comme ailleurs
// (contrats, équipe...).
const SHIFT_MANAGE_ROLES = ["COORDINATOR"];

// Trois variantes du même filtre HOLDING/CLINIC/autre, une par modèle cible — cf. le constat de
// l'exploration : getOrgScopeWhere (src/lib/org-scope.ts) est typé Prisma.PatientWhereInput et
// quasi jamais réutilisé ailleurs ; la convention établie dans ce code est de dupliquer ce filtre
// par fichier plutôt que de forcer un type générique commun entre modèles différents.
//
// `clinicId` (passé par la page clinics/[id]/appointments) RESTREINT la requête à cette seule
// clinique PLUTÔT que de se contenter de construire des liens avec — sans lui, un ADMIN/
// COORDINATOR de holding verrait l'agrégat de TOUTES ses cliniques même sur la page d'une
// clinique précise (bug de périmètre, pas de sécurité : src/app/dashboard/clinics/[id]/layout.tsx
// vérifie déjà que ce clinicId appartient bien à l'utilisateur avant que la page ne s'exécute).
// Intersecté (AND) avec le périmètre normal de l'utilisateur plutôt qu'appliqué seul, pour ne
// jamais élargir l'accès au-delà de ce périmètre.
function patientOrgFilter(user: CurrentUser, clinicId?: string): Prisma.PatientWhereInput {
  const base: Prisma.PatientWhereInput =
    user.organization?.type === "HOLDING"
      ? { OR: [{ organizationId: user.organizationId }, { organization: { parentId: user.organizationId } }] }
      : user.organization?.type === "CLINIC"
        ? { organizationId: user.organizationId }
        : { organizationId: { in: [] } };
  return clinicId ? { AND: [base, { organizationId: clinicId }] } : base;
}

function userOrgFilter(user: CurrentUser, clinicId?: string): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput =
    user.organization?.type === "HOLDING"
      ? { OR: [{ organizationId: user.organizationId }, { organization: { parentId: user.organizationId } }] }
      : user.organization?.type === "CLINIC"
        ? { organizationId: user.organizationId }
        : { organizationId: { in: [] } };
  return clinicId ? { AND: [base, { organizationId: clinicId }] } : base;
}

function stockPurchaseOrgFilter(user: CurrentUser, clinicId?: string): Prisma.StockPurchaseWhereInput {
  const base: Prisma.StockPurchaseWhereInput =
    user.organization?.type === "HOLDING"
      ? { OR: [{ organizationId: user.organizationId }, { organization: { parentId: user.organizationId } }] }
      : user.organization?.type === "CLINIC"
        ? { organizationId: user.organizationId }
        : { organizationId: { in: [] } };
  return clinicId ? { AND: [base, { organizationId: clinicId }] } : base;
}

function clinicPath(clinicId: string | undefined, suffix: string) {
  return clinicId ? `/dashboard/clinics/${clinicId}${suffix}` : `/dashboard${suffix}`;
}

type AppointmentRow = Prisma.AppointmentGetPayload<{
  include: { patient: { include: { user: true } }; caregiver: { include: { user: true } } };
}>;
type ShiftRow = Prisma.ShiftGetPayload<{ include: { user: true } }>;
type CalendarEventRow = Prisma.CalendarEventGetPayload<Record<string, never>>;
type CareTaskRow = Prisma.CareTaskGetPayload<{
  include: { carePlan: { include: { patient: { include: { user: true } } } }; caregiver: { include: { user: true } } };
}>;
type ContractRow = Prisma.ContractGetPayload<{
  include: { patient: { include: { user: true } }; caregiver: { include: { user: true } } };
}>;
type StockPurchaseRow = Prisma.StockPurchaseGetPayload<{ include: { pharmacyItem: true } }>;

function mapAppointment(a: AppointmentRow, canEdit: boolean): CalendarItem {
  const start = new Date(a.scheduledAt);
  const end = new Date(start.getTime() + a.durationMinutes * 60000);
  return {
    id: a.id,
    kind: "APPOINTMENT",
    title: a.title,
    start,
    end,
    allDay: false,
    subtitle: `${a.patient.user.lastName} ${a.patient.user.firstName}`,
    status: a.status,
    canEdit,
    raw: a,
  };
}

function mapShift(s: ShiftRow, canEdit: boolean): CalendarItem {
  return {
    id: s.id,
    kind: "SHIFT",
    title: s.title,
    start: new Date(s.startAt),
    end: new Date(s.endAt),
    allDay: false,
    subtitle: `${s.user.lastName} ${s.user.firstName}`,
    canEdit,
    raw: s,
  };
}

function mapEvent(e: CalendarEventRow): CalendarItem {
  const start = new Date(e.startAt);
  return {
    id: e.id,
    kind: "EVENT",
    title: e.title,
    start,
    end: e.endAt ? new Date(e.endAt) : start,
    allDay: e.allDay,
    subtitle: e.description || undefined,
    canEdit: true,
    raw: e,
  };
}

function mapCareTask(t: CareTaskRow, clinicId: string | undefined): CalendarItem {
  const start = new Date(t.scheduledFor);
  return {
    id: t.id,
    kind: "CARE_TASK",
    title: t.title,
    start,
    end: new Date(start.getTime() + 30 * 60000),
    allDay: false,
    subtitle: `${t.carePlan.patient.user.lastName} ${t.carePlan.patient.user.firstName}`,
    status: t.status,
    canEdit: false,
    href: clinicPath(clinicId, `/patients/${t.carePlan.patientId}`),
    raw: t,
  };
}

function mapContract(c: ContractRow, clinicId: string | undefined): CalendarItem {
  const end = new Date(c.endDate!);
  return {
    id: c.id,
    kind: "CONTRACT_DEADLINE",
    title: `Fin de contrat : ${c.title}`,
    start: end,
    end,
    allDay: true,
    subtitle: `${c.patient.user.lastName} ${c.patient.user.firstName}${c.caregiver ? ` — ${c.caregiver.user.lastName} ${c.caregiver.user.firstName}` : ""}`,
    status: c.status,
    canEdit: false,
    href: clinicPath(clinicId, "/contracts"),
    raw: c,
  };
}

function mapStockLot(l: StockPurchaseRow, clinicId: string | undefined): CalendarItem {
  const end = new Date(l.expiryDate!);
  return {
    id: l.id,
    kind: "STOCK_EXPIRY",
    title: `Expiration : ${l.pharmacyItem.name}`,
    start: end,
    end,
    allDay: true,
    subtitle: `${l.remainingQuantity} unité(s) restante(s)${l.batchNumber ? ` — lot ${l.batchNumber}` : ""}`,
    canEdit: false,
    href: clinicPath(clinicId, "/pharmacie"),
    raw: l,
  };
}

// Agrège les 6 sources du calendrier unifié en un seul appel, selon la matrice de visibilité du
// plan : COORDINATOR/ADMIN voient tout l'org, les autres rôles ne voient que ce qui leur est
// propre (ou non affecté, pour rendez-vous/tâches) — sauf CalendarEvent, qui reste TOUJOURS
// strictement privé au créateur, y compris pour COORDINATOR (un rappel personnel reste
// personnel, cf. plan). `clinicId` sert uniquement à construire les liens vers les pages où les
// échéances en lecture seule sont réellement gérées (fiche patient / contrats / pharmacie).
export async function getCalendarItems(options?: { clinicId?: string }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");
    if (!CALENDAR_ACCESS_ROLES.includes(user.role)) {
      return { success: true, data: [] as CalendarItem[] };
    }

    const isOrgWideReader = ORG_WIDE_READ_ROLES.includes(user.role);
    const canSeeAppointmentsAndTasks = APPOINTMENT_CARETASK_ROLES.includes(user.role);
    const canManageShifts = SHIFT_MANAGE_ROLES.includes(user.role);
    const clinicId = options?.clinicId;

    const myCaregiver = await prisma.caregiver.findUnique({ where: { userId: user.id }, select: { id: true } });
    const myCaregiverId = myCaregiver?.id ?? null;
    // Deux variables distinctes (plutôt qu'une seule partagée) : bien que le littéral soit
    // identique, Prisma a besoin du type XWhereInput exact de chaque modèle cible pour inférer
    // correctement la forme du résultat de findMany plus bas (include compris).
    const mineOrUnassignedAppointment: Prisma.AppointmentWhereInput = {
      OR: [{ caregiverId: myCaregiverId }, { caregiverId: null }],
    };
    const mineOrUnassignedCareTask: Prisma.CareTaskWhereInput = {
      OR: [{ caregiverId: myCaregiverId }, { caregiverId: null }],
    };

    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [appointments, shifts, events, careTasks, contracts, stockLots] = await Promise.all([
      canSeeAppointmentsAndTasks
        ? prisma.appointment.findMany({
            where: { patient: patientOrgFilter(user, clinicId), ...(isOrgWideReader ? {} : mineOrUnassignedAppointment) },
            include: { patient: { include: { user: true } }, caregiver: { include: { user: true } } },
            orderBy: { scheduledAt: "asc" },
            take: 500,
          })
        : Promise.resolve([] as AppointmentRow[]),

      prisma.shift.findMany({
        where: { user: userOrgFilter(user, clinicId), ...(isOrgWideReader ? {} : { userId: user.id }) },
        include: { user: true },
        orderBy: { startAt: "asc" },
        take: 500,
      }),

      // Toujours restreint au créateur, quel que soit le rôle — jamais d'exception COORDINATOR.
      // Pas de filtre clinicId ici non plus : un événement personnel n'appartient à aucune
      // clinique en particulier, il suit son créateur partout où il navigue.
      prisma.calendarEvent.findMany({
        where: { userId: user.id },
        orderBy: { startAt: "asc" },
        take: 500,
      }),

      canSeeAppointmentsAndTasks
        ? prisma.careTask.findMany({
            where: {
              status: "PENDING",
              carePlan: { patient: patientOrgFilter(user, clinicId) },
              ...(isOrgWideReader ? {} : mineOrUnassignedCareTask),
            },
            include: {
              carePlan: { include: { patient: { include: { user: true } } } },
              caregiver: { include: { user: true } },
            },
            orderBy: { scheduledFor: "asc" },
            take: 500,
          })
        : Promise.resolve([] as CareTaskRow[]),

      CONTRACT_DEADLINE_ROLES.includes(user.role)
        ? prisma.contract.findMany({
            where: { patient: patientOrgFilter(user, clinicId), endDate: { not: null } },
            include: { patient: { include: { user: true } }, caregiver: { include: { user: true } } },
            orderBy: { endDate: "asc" },
            take: 300,
          })
        : Promise.resolve([] as ContractRow[]),

      // Fenêtre large (90j) volontairement différente du seuil d'alerte de scheduler.ts (30j) :
      // vue de planification, pas un flux d'urgence. Pas de dédoublonnage par article — chaque
      // lot avec une échéance distincte est une ligne de calendrier séparée (cf. plan).
      STOCK_EXPIRY_ROLES.includes(user.role)
        ? prisma.stockPurchase.findMany({
            where: { ...stockPurchaseOrgFilter(user, clinicId), remainingQuantity: { gt: 0 }, expiryDate: { gte: now, lte: in90Days } },
            include: { pharmacyItem: true },
            orderBy: { expiryDate: "asc" },
            take: 300,
          })
        : Promise.resolve([] as StockPurchaseRow[]),
    ]);

    const canEditAppointment = canSeeAppointmentsAndTasks && user.role !== "ADMIN";

    const items: CalendarItem[] = [
      ...appointments.map((a) => mapAppointment(a, canEditAppointment)),
      ...shifts.map((s) => mapShift(s, canManageShifts)),
      ...events.map((e) => mapEvent(e)),
      ...careTasks.map((t) => mapCareTask(t, clinicId)),
      ...contracts.map((c) => mapContract(c, clinicId)),
      ...stockLots.map((l) => mapStockLot(l, clinicId)),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());

    return { success: true, data: items };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement du calendrier.") };
  }
}
