// Calcul des nuitées d'hospitalisation — fonctions pures (aucun accès base), partagées par les
// actions de lits, de sortie et leurs tests.
//
// Règle retenue : on facture les NUITS PASSÉES — chaque minuit franchi pendant l'occupation d'un
// lit compte une nuitée, au tarif du lit occupé à ce minuit-là — avec un minimum d'une nuitée par
// séjour (entré et sorti le même jour = 1). Les minuits sont ceux du fuseau de la clinique, jamais
// celui du serveur (UTC sur Vercel).

// Fuseau des cliniques (Cameroun, UTC+1 sans heure d'été). Surchargé par CLINIC_TIMEZONE.
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "Africa/Douala";

// Tarif applicable : celui de la chambre s'il est renseigné, sinon celui du service, sinon 0
// (séjour non facturé).
export function resolveNightlyRate(
  ward: { nightlyRate?: number | null } | null | undefined,
  room: { nightlyRate?: number | null } | null | undefined
): number {
  if (room?.nightlyRate != null && room.nightlyRate >= 0) return room.nightlyRate;
  if (ward?.nightlyRate != null && ward.nightlyRate >= 0) return ward.nightlyRate;
  return 0;
}

// Numéro de jour calendaire LOCAL (jours écoulés depuis le 1970-01-01 dans le fuseau donné).
export function localDayNumber(date: Date, timeZone: string = CLINIC_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
}

// Minuits (locaux) franchis entre deux instants.
export function midnightsBetween(start: Date, end: Date, timeZone: string = CLINIC_TIMEZONE): number {
  if (end <= start) return 0;
  return Math.max(0, localDayNumber(end, timeZone) - localDayNumber(start, timeZone));
}

export interface StaySegment {
  id: string;
  bedLabel: string;
  roomName: string;
  wardName: string;
  nightlyRate: number;
  startedAt: Date;
  endedAt: Date | null;
}

// Nuitées dues du séjour à l'instant `now`, dans l'ordre chronologique — une entrée par nuit, au
// tarif du lit occupé à ce minuit-là. Minimum une nuitée dès qu'un lit a été occupé, au tarif du
// dernier lit.
export function stayNightsToDate(segments: StaySegment[], now: Date, timeZone: string = CLINIC_TIMEZONE): StaySegment[] {
  const ordered = [...segments].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const nights: StaySegment[] = [];
  for (const segment of ordered) {
    const end = segment.endedAt ?? now;
    const count = midnightsBetween(segment.startedAt, end, timeZone);
    for (let i = 0; i < count; i++) nights.push(segment);
  }
  if (nights.length === 0 && ordered.length > 0) nights.push(ordered[ordered.length - 1]);
  return nights;
}

export interface StayInvoiceLine {
  type: "SERVICE";
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

// Lignes de facture pour les nuitées pas encore facturées (au-delà de `alreadyBilled`), regroupées
// par lit consécutif. Les lits sans tarif (0 FCFA) ne génèrent aucune ligne.
export function stayInvoiceLines(nights: StaySegment[], alreadyBilled: number): { lines: StayInvoiceLine[]; nightsCovered: number } {
  const toBill = nights.slice(Math.max(0, alreadyBilled));
  const lines: StayInvoiceLine[] = [];
  let current: { segment: StaySegment; quantity: number } | null = null;
  const flush = () => {
    if (!current || current.segment.nightlyRate <= 0) return;
    const { segment, quantity } = current;
    lines.push({
      type: "SERVICE",
      description: `Hospitalisation — ${segment.wardName} / ${segment.roomName} (lit ${segment.bedLabel}) — ${quantity} nuitée${quantity > 1 ? "s" : ""}`,
      quantity,
      unitPrice: segment.nightlyRate,
      amount: segment.nightlyRate * quantity,
    });
  };
  for (const night of toBill) {
    if (current && current.segment.id === night.id) {
      current.quantity += 1;
    } else {
      flush();
      current = { segment: night, quantity: 1 };
    }
  }
  flush();
  return { lines, nightsCovered: toBill.length };
}
