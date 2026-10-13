// Jour calendaire « de la clinique » : les cliniques sont au Cameroun (UTC+1, sans heure d'été),
// le serveur en UTC (Vercel). Tout ce qui se découpe par jour — nuitées d'hospitalisation, tickets
// de passage de l'accueil — doit suivre le minuit de la clinique, jamais celui du serveur.
// Surchargé par la variable d'environnement CLINIC_TIMEZONE.
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "Africa/Douala";

// Date locale de la clinique au format AAAA-MM-JJ.
export function clinicDateKey(date: Date = new Date(), timeZone: string = CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
