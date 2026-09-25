// Période du filtre global de la page Finance (recettes, dépenses, bénéfice, journal, sessions de
// caisse). Module PUR et partagé : le navigateur l'utilise pour afficher/valider la période choisie,
// le serveur pour la convertir en bornes de requête — une seule définition des préréglages, des
// bornes de jour et du refus des dates futures.
//
// Fuseau horaire : les jours sont ceux de l'UTILISATEUR, pas ceux du serveur (Vercel tourne en UTC :
// une vente à 00h30 heure locale tomberait sinon dans la veille). Le navigateur envoie son décalage
// (`Date.getTimezoneOffset()`, en minutes, négatif à l'est de UTC : -60 pour UTC+1) et toutes les
// bornes en sont déduites. Sans décalage transmis (chargement par défaut de la page), on retombe sur
// UTC — comportement identique à l'ancien calcul "aujourd'hui" côté serveur.

export type PeriodPreset = "all" | "today" | "7d" | "30d" | "month" | "lastMonth" | "year" | "custom";

export const PERIOD_PRESETS: { key: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "7d", label: "7 derniers jours" },
  { key: "30d", label: "30 derniers jours" },
  { key: "month", label: "Ce mois-ci" },
  { key: "lastMonth", label: "Mois dernier" },
  { key: "year", label: "Cette année" },
  { key: "all", label: "Tout" },
];

// Ce qui arrive de l'URL / des paramètres d'une action : rien n'est de confiance.
export interface PeriodInput {
  preset?: string;
  from?: string;
  to?: string;
  tzOffsetMinutes?: number;
}

export interface ResolvedPeriod {
  preset: PeriodPreset;
  // Jours au format AAAA-MM-JJ dans le fuseau de l'utilisateur ; null = pas de borne.
  from: string | null;
  to: string | null;
  tzOffsetMinutes: number;
  // Jour courant dans le fuseau de l'utilisateur : plafond de toute date (jamais de futur).
  today: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PRESET_KEYS = new Set<string>(PERIOD_PRESETS.map((p) => p.key));

function keyToUtcMs(key: string): number {
  const [, y, m, d] = KEY_RE.exec(key)!;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function utcMsToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !KEY_RE.test(value)) return false;
  // Refuse 2026-02-31 & co : le calendrier doit redonner exactement la même date.
  return utcMsToKey(keyToUtcMs(value)) === value;
}

function normalizeTz(tz: unknown): number {
  const n = Number(tz);
  // -840 (UTC+14) à +720 (UTC-12) : les extrêmes réels des fuseaux horaires.
  return Number.isFinite(n) && Math.abs(n) <= 840 ? Math.round(n) : 0;
}

export function dateKeyInTz(nowMs: number, tzOffsetMinutes: number): string {
  return utcMsToKey(nowMs - tzOffsetMinutes * 60_000);
}

function addDays(key: string, days: number): string {
  return utcMsToKey(keyToUtcMs(key) + days * DAY_MS);
}

function firstOfMonth(key: string, monthDelta = 0): string {
  const d = new Date(keyToUtcMs(key));
  return utcMsToKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthDelta, 1));
}

// Début (00:00:00.000) du jour `key` dans le fuseau de l'utilisateur, en instant absolu.
export function dayStart(key: string, tzOffsetMinutes = 0): Date {
  return new Date(keyToUtcMs(key) + tzOffsetMinutes * 60_000);
}

// Fin (23:59:59.999) du jour `key` dans le fuseau de l'utilisateur.
export function dayEnd(key: string, tzOffsetMinutes = 0): Date {
  return new Date(keyToUtcMs(key) + DAY_MS - 1 + tzOffsetMinutes * 60_000);
}

export function resolvePeriod(input: PeriodInput = {}, nowMs: number = Date.now()): ResolvedPeriod {
  const tzOffsetMinutes = normalizeTz(input.tzOffsetMinutes);
  const today = dateKeyInTz(nowMs, tzOffsetMinutes);

  const hasCustomDates = isValidDateKey(input.from) || isValidDateKey(input.to);
  const requested = input.preset;
  const preset: PeriodPreset =
    requested === "custom" || (!requested && hasCustomDates)
      ? "custom"
      : requested && PRESET_KEYS.has(requested)
        ? (requested as PeriodPreset)
        : "all";

  const make = (from: string | null, to: string | null): ResolvedPeriod => ({ preset, from, to, tzOffsetMinutes, today });

  switch (preset) {
    case "today":
      return make(today, today);
    case "7d":
      return make(addDays(today, -6), today);
    case "30d":
      return make(addDays(today, -29), today);
    case "month":
      return make(firstOfMonth(today), today);
    case "lastMonth": {
      const first = firstOfMonth(today, -1);
      return make(first, addDays(firstOfMonth(today), -1));
    }
    case "year":
      return make(`${today.slice(0, 4)}-01-01`, today);
    case "custom": {
      let from = isValidDateKey(input.from) ? input.from : null;
      let to = isValidDateKey(input.to) ? input.to : null;
      // Jamais de date future : on ramène au jour courant (même si l'URL est bricolée à la main).
      if (to && to > today) to = today;
      if (from && from > today) from = today;
      // Bornes inversées : on les remet dans l'ordre plutôt que de renvoyer une période vide.
      if (from && to && from > to) [from, to] = [to, from];
      return make(from, to);
    }
    default:
      return make(null, null);
  }
}

// Bornes de requête (instants absolus) de la période.
export function periodRange(period: ResolvedPeriod): { start?: Date; end?: Date } {
  return {
    start: period.from ? dayStart(period.from, period.tzOffsetMinutes) : undefined,
    end: period.to ? dayEnd(period.to, period.tzOffsetMinutes) : undefined,
  };
}

// Filtre Prisma `createdAt` de la période (undefined = pas de borne, tout l'historique).
export function periodCreatedAtFilter(period: ResolvedPeriod): { gte?: Date; lte?: Date } | undefined {
  const { start, end } = periodRange(period);
  if (!start && !end) return undefined;
  return { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
}

// Filtre `createdAt` de "aujourd'hui" INTERSECTÉ avec la période : si la période s'arrête avant
// aujourd'hui, l'intersection est vide et les requêtes "aujourd'hui" ne renvoient rien.
export function todayCreatedAtFilter(period: ResolvedPeriod): { gte: Date; lte?: Date } {
  const startOfToday = dayStart(period.today, period.tzOffsetMinutes);
  const { start, end } = periodRange(period);
  return { gte: start && start > startOfToday ? start : startOfToday, ...(end ? { lte: end } : {}) };
}

export function periodIncludesToday(period: ResolvedPeriod): boolean {
  return !period.to || period.to >= period.today;
}

function formatKey(key: string, withYear: boolean): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(keyToUtcMs(key) + 12 * 60 * 60 * 1000));
}

export function formatPeriodLabel(period: ResolvedPeriod): string {
  const { from, to } = period;
  if (!from && !to) return "Toute la période";
  if (from && to && from === to) return `Le ${formatKey(from, true)}`;
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `Du ${formatKey(from, !sameYear)} au ${formatKey(to, true)}`;
  }
  if (from) return `Depuis le ${formatKey(from, true)}`;
  return `Jusqu'au ${formatKey(to!, true)}`;
}

type SearchParamValue = string | string[] | undefined;

// Paramètres d'URL de la page Finance : ?p=7d  ou  ?p=custom&from=AAAA-MM-JJ&to=AAAA-MM-JJ, plus
// `tz` (décalage du navigateur) posé par le filtre dès qu'une période est choisie.
export function parsePeriodSearchParams(searchParams: Record<string, SearchParamValue> = {}): PeriodInput {
  const first = (v: SearchParamValue) => (Array.isArray(v) ? v[0] : v);
  const tz = first(searchParams.tz);
  return {
    preset: first(searchParams.p),
    from: first(searchParams.from),
    to: first(searchParams.to),
    tzOffsetMinutes: tz !== undefined && tz !== "" ? Number(tz) : undefined,
  };
}

// Inverse : la chaîne de requête (sans "?") qui représente une période choisie dans le filtre.
export function periodToSearchString(
  selection: { preset: PeriodPreset; from?: string | null; to?: string | null },
  tzOffsetMinutes: number
): string {
  if (selection.preset === "all") return "";
  const params = new URLSearchParams();
  params.set("p", selection.preset);
  if (selection.preset === "custom") {
    if (selection.from) params.set("from", selection.from);
    if (selection.to) params.set("to", selection.to);
  }
  params.set("tz", String(tzOffsetMinutes));
  return params.toString();
}
