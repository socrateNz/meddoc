import { describe, it, expect } from "vitest";
import { buildDayBuckets, buildWeekBuckets, computeStockStatus, countByBucket, startOfDay, sumByBucket } from "./dashboard-stats";

// Dates construites en heure locale (comme le code testé) pour que ces tests ne dépendent pas du
// fuseau de la machine qui les exécute.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe("buildDayBuckets", () => {
  it("produit N jours consécutifs, du plus ancien au plus récent, sans trou ni chevauchement", () => {
    const buckets = buildDayBuckets(local(2026, 9, 18, 15, 30), 7);

    expect(buckets).toHaveLength(7);
    expect(buckets[0].start).toEqual(local(2026, 9, 18));
    expect(buckets[6].start).toEqual(local(2026, 9, 24));
    for (let i = 0; i < 6; i++) expect(buckets[i].end).toEqual(buckets[i + 1].start);
  });

  it("traverse correctement un changement de mois", () => {
    const buckets = buildDayBuckets(local(2026, 9, 29), 4);

    expect(buckets.map((b) => b.start.getDate())).toEqual([29, 30, 1, 2]);
    expect(buckets[2].start.getMonth()).toBe(9); // octobre
  });
});

describe("buildWeekBuckets", () => {
  it("commence chaque semaine le lundi et finit par la semaine en cours", () => {
    // Jeudi 24 septembre 2026 : sa semaine commence le lundi 21.
    const buckets = buildWeekBuckets(local(2026, 9, 24, 10), 4);

    expect(buckets).toHaveLength(4);
    expect(buckets[3].start).toEqual(local(2026, 9, 21));
    expect(buckets[2].start).toEqual(local(2026, 9, 14));
    expect(buckets[0].start).toEqual(local(2026, 8, 31));
    expect(buckets.every((b) => b.start.getDay() === 1)).toBe(true);
  });

  it("rattache un dimanche à la semaine qui s'est ouverte le lundi précédent (pas à la suivante)", () => {
    // Dimanche 27 septembre 2026 : dernier jour de la semaine ouverte le lundi 21.
    const buckets = buildWeekBuckets(local(2026, 9, 27, 23, 59), 2);

    expect(buckets[1].start).toEqual(local(2026, 9, 21));
    expect(buckets[1].end).toEqual(local(2026, 9, 28));
  });
});

describe("countByBucket", () => {
  const buckets = buildDayBuckets(local(2026, 9, 21), 3);

  it("compte chaque date dans sa tranche, minuit inclus et minuit suivant exclu", () => {
    const counts = countByBucket(
      [
        local(2026, 9, 21, 0, 0), // début du 21 : inclus dans le 21
        local(2026, 9, 21, 23, 59), // fin du 21
        local(2026, 9, 22, 0, 0), // début du 22 : dans le 22, pas le 21
        local(2026, 9, 23, 12, 0),
      ],
      buckets
    );

    expect(counts).toEqual([2, 1, 1]);
  });

  it("ignore les dates hors période, vides ou invalides", () => {
    const counts = countByBucket(
      [local(2026, 9, 20, 23, 59), local(2026, 9, 24, 0, 0), null, undefined, "pas une date"],
      buckets
    );

    expect(counts).toEqual([0, 0, 0]);
  });

  it("accepte les dates au format texte ISO (ce que renvoie un aller-retour JSON)", () => {
    const counts = countByBucket([local(2026, 9, 22, 8, 0).toISOString()], buckets);

    expect(counts).toEqual([0, 1, 0]);
  });
});

describe("sumByBucket", () => {
  it("additionne les montants par jour et ignore ce qui sort de la période", () => {
    const buckets = buildDayBuckets(local(2026, 9, 21), 2);

    const sums = sumByBucket(
      [
        { date: local(2026, 9, 21, 9), value: 1000 },
        { date: local(2026, 9, 21, 17), value: 2500 },
        { date: local(2026, 9, 22, 8), value: 400 },
        { date: local(2026, 9, 23, 8), value: 99999 }, // après la période
        { date: null, value: 5000 }, // sans date
      ],
      buckets
    );

    expect(sums).toEqual([3500, 400]);
  });
});

describe("computeStockStatus", () => {
  const now = local(2026, 9, 24, 12);

  it("classe rupture, stock faible (au seuil inclus) et stock suffisant", () => {
    const status = computeStockStatus(
      [
        { stockQuantity: 0, reorderLevel: 5 },
        { stockQuantity: -2, reorderLevel: 5 }, // stock négatif hérité : compté en rupture
        { stockQuantity: 5, reorderLevel: 5 }, // pile au seuil : faible
        { stockQuantity: 6, reorderLevel: 5 },
        { stockQuantity: 100, reorderLevel: 10 },
      ],
      now
    );

    expect(status).toMatchObject({ out: 2, low: 1, ok: 2, total: 5 });
  });

  it("signale périmé et péremption sous 30 jours, seulement pour les produits en stock", () => {
    const status = computeStockStatus(
      [
        { stockQuantity: 10, reorderLevel: 5, expiryDate: local(2026, 9, 1) }, // périmé
        { stockQuantity: 10, reorderLevel: 5, expiryDate: local(2026, 10, 20) }, // dans 26 jours
        { stockQuantity: 10, reorderLevel: 5, expiryDate: local(2026, 12, 31) }, // loin
        { stockQuantity: 0, reorderLevel: 5, expiryDate: local(2026, 9, 1) }, // périmé mais vide : ignoré
        { stockQuantity: 10, reorderLevel: 5, expiryDate: null },
      ],
      now
    );

    expect(status).toMatchObject({ expired: 1, expiringSoon: 1 });
  });

  it("renvoie des zéros pour un catalogue vide", () => {
    expect(computeStockStatus([], now)).toEqual({ out: 0, low: 0, ok: 0, expired: 0, expiringSoon: 0, total: 0 });
  });
});

describe("startOfDay", () => {
  it("ramène à minuit local sans modifier la date d'origine", () => {
    const original = local(2026, 9, 24, 17, 45);
    const result = startOfDay(original);

    expect(result).toEqual(local(2026, 9, 24));
    expect(original).toEqual(local(2026, 9, 24, 17, 45));
  });
});
