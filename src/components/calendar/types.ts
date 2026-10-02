export interface AppointmentPatient {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
  };
}

export interface AppointmentCaregiver {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  };
}

export interface CalendarAppointment {
  id: string;
  patientId: string;
  caregiverId: string | null;
  title: string;
  scheduledAt: Date | string;
  durationMinutes: number;
  type: string;
  status: string; // SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
  patient: AppointmentPatient;
  caregiver: AppointmentCaregiver | null;
}

export type CalendarViewMode = "day" | "workWeek" | "week" | "month" | "agenda";

export interface CaregiverColorMeta {
  id: string;
  name: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
  colorBadge: string;
  colorDot: string;
}

// Outlook palette for caregivers & categories
export const CAREGIVER_COLORS = [
  {
    bg: "bg-blue-500/10 hover:bg-blue-500/15 text-blue-700 dark:text-blue-300 dark:bg-blue-500/20",
    border: "border-l-blue-600 dark:border-l-blue-400",
    pill: "bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-600",
    badge: "border-blue-300 text-blue-700 dark:text-blue-300",
  },
  {
    bg: "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/20",
    border: "border-l-emerald-600 dark:border-l-emerald-400",
    pill: "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-600",
    badge: "border-emerald-300 text-emerald-700 dark:text-emerald-300",
  },
  {
    bg: "bg-purple-500/10 hover:bg-purple-500/15 text-purple-700 dark:text-purple-300 dark:bg-purple-500/20",
    border: "border-l-purple-600 dark:border-l-purple-400",
    pill: "bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-300",
    dot: "bg-purple-600",
    badge: "border-purple-300 text-purple-700 dark:text-purple-300",
  },
  {
    bg: "bg-amber-500/10 hover:bg-amber-500/15 text-amber-700 dark:text-amber-300 dark:bg-amber-500/20",
    border: "border-l-amber-600 dark:border-l-amber-400",
    pill: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-600",
    badge: "border-amber-300 text-amber-700 dark:text-amber-300",
  },
  {
    bg: "bg-teal-500/10 hover:bg-teal-500/15 text-teal-700 dark:text-teal-300 dark:bg-teal-500/20",
    border: "border-l-teal-600 dark:border-l-teal-400",
    pill: "bg-teal-500/15 border-teal-500/30 text-teal-700 dark:text-teal-300",
    dot: "bg-teal-600",
    badge: "border-teal-300 text-teal-700 dark:text-teal-300",
  },
  {
    bg: "bg-rose-500/10 hover:bg-rose-500/15 text-rose-700 dark:text-rose-300 dark:bg-rose-500/20",
    border: "border-l-rose-600 dark:border-l-rose-400",
    pill: "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-600",
    badge: "border-rose-300 text-rose-700 dark:text-rose-300",
  },
  {
    bg: "bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 dark:bg-indigo-500/20",
    border: "border-l-indigo-600 dark:border-l-indigo-400",
    pill: "bg-indigo-500/15 border-indigo-500/30 text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-600",
    badge: "border-indigo-300 text-indigo-700 dark:text-indigo-300",
  },
];

// Calendrier unifié : chaque source agrégée par getCalendarItems (src/actions/calendar.ts) est
// normalisée vers cette forme générique avant d'atteindre les composants de rendu — seul
// "APPOINTMENT" garde son rendu riche d'origine via `raw` (CalendarAppointment), les autres
// types n'ont besoin que de title/subtitle/couleur par type, pas d'un hash par soignant.
export type CalendarItemKind = "APPOINTMENT" | "SHIFT" | "EVENT" | "CARE_TASK" | "CONTRACT_DEADLINE" | "STOCK_EXPIRY";

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  subtitle?: string;
  status?: string;
  // false pour les échéances agrégées en lecture seule (CARE_TASK/CONTRACT_DEADLINE/STOCK_EXPIRY,
  // déjà gérées ailleurs) et pour SHIFT vu par son simple affecté (seul COORDINATOR peut modifier
  // une garde, cf. src/actions/shifts.ts) — ne jamais déduire canEdit de `userId === moi`.
  canEdit: boolean;
  // Pour les échéances en lecture seule : où aller pour agir (fiche patient / contrats /
  // pharmacie) plutôt que d'ouvrir un dialogue d'édition ici, qui dupliquerait une UI existante.
  href?: string;
  raw: unknown;
}

interface KindColorMeta {
  bg: string;
  border: string;
  pill: string;
  dot: string;
  badge: string;
}

const KIND_COLORS: Record<Exclude<CalendarItemKind, "APPOINTMENT">, KindColorMeta> = {
  SHIFT: {
    bg: "bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 dark:bg-indigo-500/20",
    border: "border-l-indigo-600 dark:border-l-indigo-400",
    pill: "bg-indigo-500/15 border-indigo-500/30 text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-600",
    badge: "border-indigo-300 text-indigo-700 dark:text-indigo-300",
  },
  EVENT: {
    bg: "bg-slate-500/10 hover:bg-slate-500/15 text-slate-700 dark:text-slate-300 dark:bg-slate-500/20",
    border: "border-l-slate-500 dark:border-l-slate-400",
    pill: "bg-slate-500/15 border-slate-400/40 text-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
    badge: "border-slate-300 text-slate-700 dark:text-slate-300",
  },
  CARE_TASK: {
    bg: "bg-teal-500/10 hover:bg-teal-500/15 text-teal-700 dark:text-teal-300 dark:bg-teal-500/20",
    border: "border-l-teal-600 dark:border-l-teal-400",
    pill: "bg-teal-500/15 border-teal-500/30 text-teal-700 dark:text-teal-300",
    dot: "bg-teal-600",
    badge: "border-teal-300 text-teal-700 dark:text-teal-300",
  },
  CONTRACT_DEADLINE: {
    bg: "bg-amber-500/10 hover:bg-amber-500/15 text-amber-700 dark:text-amber-300 dark:bg-amber-500/20",
    border: "border-l-amber-600 dark:border-l-amber-400",
    pill: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-600",
    badge: "border-amber-300 text-amber-700 dark:text-amber-300",
  },
  STOCK_EXPIRY: {
    bg: "bg-rose-500/10 hover:bg-rose-500/15 text-rose-700 dark:text-rose-300 dark:bg-rose-500/20",
    border: "border-l-rose-600 dark:border-l-rose-400",
    pill: "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-600",
    badge: "border-rose-300 text-rose-700 dark:text-rose-300",
  },
};

// Couleur plate par type (pas un hash par soignant comme getCaregiverColor) : SHIFT/EVENT/
// CARE_TASK/CONTRACT_DEADLINE/STOCK_EXPIRY ne varient jamais, seul APPOINTMENT garde la
// coloration par soignant existante (cf. getCaregiverColor ci-dessous).
export function getKindColor(kind: CalendarItemKind) {
  if (kind === "APPOINTMENT") return null;
  return KIND_COLORS[kind];
}

export function getCaregiverColor(caregiverId?: string | null, index = 0) {
  if (!caregiverId) {
    return {
      bg: "bg-slate-500/10 hover:bg-slate-500/15 text-slate-700 dark:text-slate-300 dark:bg-slate-500/20",
      border: "border-l-slate-400 dark:border-l-slate-500",
      pill: "bg-slate-500/15 border-slate-400/40 text-slate-700 dark:text-slate-300",
      dot: "bg-slate-400",
      badge: "border-slate-300 text-slate-700 dark:text-slate-300",
    };
  }
  // Deterministic color selection based on id characters
  let hash = 0;
  for (let i = 0; i < caregiverId.length; i++) {
    hash = (hash << 5) - hash + caregiverId.charCodeAt(i);
    hash |= 0;
  }
  const colorIndex = Math.abs(hash + index) % CAREGIVER_COLORS.length;
  return CAREGIVER_COLORS[colorIndex];
}
