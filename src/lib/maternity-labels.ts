// Libellés de la consultation prénatale (CPN), partagés par le formulaire de visite et le suivi
// de maternité (cf. PrenatalVisit dans schema.prisma, src/validators/maternity.ts).

export const URINE_DIPSTICK_OPTIONS = [
  { value: "NEG", label: "Négatif" },
  { value: "TRACES", label: "Traces" },
  { value: "+", label: "+" },
  { value: "++", label: "++" },
  { value: "+++", label: "+++" },
] as const;

export const FETAL_PRESENTATION_LABELS: Record<string, string> = {
  CEPHALIC: "Céphalique",
  BREECH: "Siège",
  TRANSVERSE: "Transverse",
};

export const PREVENTIVE_TREATMENT_LABELS: Record<string, string> = {
  IPTP_SP: "TPI / SP (paludisme)",
  TT_VACCINE: "VAT (antitétanique)",
  IRON_FOLIC: "Fer + acide folique",
  DEWORMING: "Déparasitage",
  LLIN: "Moustiquaire imprégnée",
};

// Examens du bilan prénatal habituel : la demande d'examens depuis une visite propose de cocher
// d'un coup ceux du catalogue de la clinique dont le nom contient l'un de ces mots-clés.
export const PRENATAL_LAB_KEYWORDS = [
  "nfs",
  "groupe",
  "rhésus",
  "rhesus",
  "glycémie",
  "glycemie",
  "vih",
  "hiv",
  "syphilis",
  "tpha",
  "vdrl",
  "toxoplasm",
  "rubéole",
  "rubeole",
  "aghbs",
  "hépatite b",
  "hepatite b",
  "albumin",
  "sucre",
  "ecbu",
  "électrophorèse",
  "electrophorese",
];

export function isPrenatalLabTest(name: string): boolean {
  const n = name.toLowerCase();
  return PRENATAL_LAB_KEYWORDS.some((k) => n.includes(k));
}

// --- Suivi des CPN (page Maternité de la clinique) ---

export type PrenatalFollowUpStatus = "TERM_PASSED" | "OVERDUE" | "NO_VISIT" | "DUE_SOON" | "NO_APPOINTMENT" | "SCHEDULED";

export const PRENATAL_FOLLOW_UP_LABELS: Record<PrenatalFollowUpStatus, string> = {
  TERM_PASSED: "Terme dépassé",
  OVERDUE: "CPN en retard",
  NO_VISIT: "Aucune CPN",
  DUE_SOON: "CPN cette semaine",
  NO_APPOINTMENT: "Pas de prochain RDV",
  SCHEDULED: "RDV prévu",
};

// Statuts à relancer (appel de la patiente) : terme dépassé sans accouchement enregistré, rendez-vous
// manqué, grossesse déclarée sans aucune visite.
export const PRENATAL_TO_CALL: PrenatalFollowUpStatus[] = ["TERM_PASSED", "OVERDUE", "NO_VISIT"];

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Situation d'une grossesse en cours à la date `today` : statut, retard en jours (rendez-vous manqué
// ou terme dépassé) et âge gestationnel actuel d'après la DDR.
export function prenatalFollowUp(
  pregnancy: { lastMenstrualPeriod: Date | string; expectedDueDate: Date | string; lastVisit?: { visitDate: Date | string; nextVisitDate?: Date | string | null } | null },
  today: Date = new Date()
): { status: PrenatalFollowUpStatus; daysLate: number; gestationalWeeks: number } {
  const t = startOfDay(today).getTime();
  const gestationalWeeks = Math.max(0, Math.floor((t - startOfDay(new Date(pregnancy.lastMenstrualPeriod)).getTime()) / (7 * DAY)));
  const due = startOfDay(new Date(pregnancy.expectedDueDate)).getTime();
  if (due < t) return { status: "TERM_PASSED", daysLate: Math.round((t - due) / DAY), gestationalWeeks };
  if (!pregnancy.lastVisit) return { status: "NO_VISIT", daysLate: 0, gestationalWeeks };
  const next = pregnancy.lastVisit.nextVisitDate ? startOfDay(new Date(pregnancy.lastVisit.nextVisitDate)).getTime() : null;
  if (next == null) return { status: "NO_APPOINTMENT", daysLate: 0, gestationalWeeks };
  if (next < t) return { status: "OVERDUE", daysLate: Math.round((t - next) / DAY), gestationalWeeks };
  if (next - t <= 7 * DAY) return { status: "DUE_SOON", daysLate: 0, gestationalWeeks };
  return { status: "SCHEDULED", daysLate: 0, gestationalWeeks };
}

const STATUS_ORDER: PrenatalFollowUpStatus[] = ["TERM_PASSED", "OVERDUE", "NO_VISIT", "DUE_SOON", "NO_APPOINTMENT", "SCHEDULED"];

// Tri : les plus urgentes d'abord, puis le plus gros retard.
export function comparePrenatalFollowUp(a: { status: PrenatalFollowUpStatus; daysLate: number }, b: { status: PrenatalFollowUpStatus; daysLate: number }) {
  return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.daysLate - a.daysLate;
}
