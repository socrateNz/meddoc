// Ronde médicale : constantes et règles partagées par le serveur et l'interface (ce module n'est pas
// un module serveur : il peut être importé par les composants et par les actions).

// Qui fait la ronde : l'équipe médicale au chevet des patients (médecin, soignant, coordinateur).
export const ROUND_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"] as const;

// Décision prise à l'issue de la visite d'un patient.
export const ROUND_DECISIONS = ["CONTINUE", "ADJUST", "EXAMS", "DISCHARGE_PLANNED", "TRANSFER", "OTHER"] as const;
export type RoundDecision = (typeof ROUND_DECISIONS)[number];

export const ROUND_DECISION_LABELS: Record<RoundDecision, string> = {
  CONTINUE: "Poursuivre le traitement",
  ADJUST: "Adapter le traitement",
  EXAMS: "Examens complémentaires",
  DISCHARGE_PLANNED: "Sortie envisagée",
  TRANSFER: "Transfert",
  OTHER: "Autre",
};

export const ROUND_MAX_TEXT_LENGTH = 2000;

// Fuseau de l'établissement : le jour de la ronde est celui de la clinique, pas celui du serveur.
export const CLINIC_TIME_ZONE = "Africa/Douala";

export function canRunRound(role: string): boolean {
  return (ROUND_ROLES as readonly string[]).includes(role);
}

export function isRoundDecision(value: unknown): value is RoundDecision {
  return typeof value === "string" && (ROUND_DECISIONS as readonly string[]).includes(value);
}

// Jour de la ronde au format AAAA-MM-JJ, dans le fuseau de la clinique.
export function clinicDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function isValidRoundDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T00:00:00Z`).getTime());
}

export function ageFrom(dateOfBirth: Date | string, now: Date = new Date()): number {
  const birth = new Date(dateOfBirth);
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// Texte saisi pendant la ronde : espaces retirés, vide = absent, longueur bornée.
export function cleanRoundText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, ROUND_MAX_TEXT_LENGTH);
}
