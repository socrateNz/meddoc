// Calculs purs derrière les graphiques des tableaux de bord — volontairement séparés des pages
// (composants serveur, donc non testables directement) pour pouvoir les vérifier par des tests
// unitaires : un regroupement par jour ou par semaine qui décale d'un jour se voit à l'écran mais
// jamais dans une base de tests par mocks. Le découpage se fait dans le fuseau du serveur, comme
// "Recettes du jour" (startOfToday) partout ailleurs dans l'application.

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface TimeBucket {
  label: string;
  start: Date;
  end: Date; // exclu
}

// `days` jours consécutifs à partir de `firstDay` (inclus), du plus ancien au plus récent.
export function buildDayBuckets(firstDay: Date, days: number, locale = "fr-FR"): TimeBucket[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" });
  const first = startOfDay(firstDay);
  return Array.from({ length: days }, (_, i) => {
    const start = new Date(first);
    start.setDate(first.getDate() + i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { label: format.format(start), start, end };
  });
}

// `weeks` semaines (lundi -> lundi suivant) se terminant par la semaine de `now`, de la plus
// ancienne à la plus récente. Le libellé est le jour de début de semaine ("15 sept.").
export function buildWeekBuckets(now: Date, weeks: number, locale = "fr-FR"): TimeBucket[] {
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const today = startOfDay(now);
  const daysSinceMonday = (today.getDay() + 6) % 7; // dimanche (0) -> 6, lundi (1) -> 0
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - daysSinceMonday);

  return Array.from({ length: weeks }, (_, i) => {
    const start = new Date(currentWeekStart);
    start.setDate(currentWeekStart.getDate() - (weeks - 1 - i) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { label: format.format(start), start, end };
  });
}

// Somme de `value` par tranche ([start, end[) : chaque entrée est rattachée à la tranche qui
// contient sa date. Les entrées hors de toutes les tranches, sans date ou à date invalide sont
// simplement ignorées.
export function sumByBucket(
  entries: Array<{ date: Date | string | null | undefined; value: number }>,
  buckets: TimeBucket[]
): number[] {
  const sums = buckets.map(() => 0);
  for (const { date, value } of entries) {
    if (!date) continue;
    const time = new Date(date).getTime();
    if (Number.isNaN(time)) continue;
    const index = buckets.findIndex((b) => time >= b.start.getTime() && time < b.end.getTime());
    if (index >= 0) sums[index] += value;
  }
  return sums;
}

// Nombre de dates tombant dans chaque tranche — cas particulier de sumByBucket (valeur 1).
export function countByBucket(dates: Array<Date | string | null | undefined>, buckets: TimeBucket[]): number[] {
  return sumByBucket(dates.map((date) => ({ date, value: 1 })), buckets);
}

export interface StockStatusInput {
  stockQuantity: number;
  reorderLevel: number;
  expiryDate?: Date | string | null;
}

const MS_PER_DAY = 1000 * 3600 * 24;

// Même lecture que l'onglet Stock de la pharmacie : rupture = stock <= 0, stock faible = au seuil
// de réapprovisionnement ou en dessous (sans être en rupture), sinon suffisant. Les alertes de
// péremption ne portent que sur les produits EN STOCK (un produit à 0 périmé n'appelle aucune
// action) : périmé = date dépassée, "bientôt" = dans les 30 jours.
export function computeStockStatus(items: StockStatusInput[], now: Date = new Date()) {
  let out = 0;
  let low = 0;
  let ok = 0;
  let expired = 0;
  let expiringSoon = 0;

  for (const item of items) {
    if (item.stockQuantity <= 0) out++;
    else if (item.stockQuantity <= item.reorderLevel) low++;
    else ok++;

    if (item.expiryDate && item.stockQuantity > 0) {
      const days = Math.ceil((new Date(item.expiryDate).getTime() - now.getTime()) / MS_PER_DAY);
      if (days < 0) expired++;
      else if (days <= 30) expiringSoon++;
    }
  }

  return { out, low, ok, expired, expiringSoon, total: items.length };
}
