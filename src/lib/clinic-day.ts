// Jour calendaire « de la clinique » : les cliniques sont au Cameroun (UTC+1, sans heure d'été),
// le serveur en UTC (Vercel). Tout ce qui se découpe par jour — nuitées d'hospitalisation, tickets
// de passage de l'accueil — doit suivre le minuit de la clinique, jamais celui du serveur.
// Surchargé par la variable d'environnement CLINIC_TIMEZONE.
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "Africa/Douala";

// Date locale de la clinique au format AAAA-MM-JJ.
export function clinicDateKey(date: Date = new Date(), timeZone: string = CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Décalage (ms) du fuseau de la clinique par rapport à UTC à un instant donné.
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Date + heure saisies à l'heure de la clinique (« 2026-10-13 », « 08:30 ») → instant UTC.
export function clinicDateTimeToUtc(dateKey: string, time: string, timeZone: string = CLINIC_TIMEZONE): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - timeZoneOffsetMs(new Date(guess), timeZone));
}

// Heure locale de la clinique au format HH:MM.
export function clinicTimeLabel(date: Date | string, timeZone: string = CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(date));
}
