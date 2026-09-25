import { describe, it, expect } from "vitest";
import {
  dayEnd,
  dayStart,
  formatPeriodLabel,
  isValidDateKey,
  parsePeriodSearchParams,
  periodCreatedAtFilter,
  periodIncludesToday,
  periodToSearchString,
  resolvePeriod,
  todayCreatedAtFilter,
} from "./finance-period";

// Vendredi 25 septembre 2026, 14h00 UTC.
const NOW = Date.UTC(2026, 8, 25, 14, 0, 0);

describe("resolvePeriod — préréglages", () => {
  it("'Tout' : aucune borne", () => {
    expect(resolvePeriod({}, NOW)).toMatchObject({ preset: "all", from: null, to: null, today: "2026-09-25" });
    expect(resolvePeriod({ preset: "all" }, NOW)).toMatchObject({ from: null, to: null });
  });

  it("aujourd'hui, 7 et 30 derniers jours (aujourd'hui compris)", () => {
    expect(resolvePeriod({ preset: "today" }, NOW)).toMatchObject({ from: "2026-09-25", to: "2026-09-25" });
    expect(resolvePeriod({ preset: "7d" }, NOW)).toMatchObject({ from: "2026-09-19", to: "2026-09-25" });
    expect(resolvePeriod({ preset: "30d" }, NOW)).toMatchObject({ from: "2026-08-27", to: "2026-09-25" });
  });

  it("ce mois-ci, mois dernier, cette année", () => {
    expect(resolvePeriod({ preset: "month" }, NOW)).toMatchObject({ from: "2026-09-01", to: "2026-09-25" });
    expect(resolvePeriod({ preset: "lastMonth" }, NOW)).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
    expect(resolvePeriod({ preset: "year" }, NOW)).toMatchObject({ from: "2026-01-01", to: "2026-09-25" });
  });

  it("mois dernier en janvier : décembre de l'année précédente", () => {
    const janvier = Date.UTC(2027, 0, 10, 12);
    expect(resolvePeriod({ preset: "lastMonth" }, janvier)).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("mois dernier après un mois de 30 jours ou en février bissextile", () => {
    expect(resolvePeriod({ preset: "lastMonth" }, Date.UTC(2026, 4, 15))).toMatchObject({ from: "2026-04-01", to: "2026-04-30" });
    expect(resolvePeriod({ preset: "lastMonth" }, Date.UTC(2028, 2, 5))).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("un préréglage inconnu retombe sur 'Tout'", () => {
    expect(resolvePeriod({ preset: "n'importe quoi" }, NOW)).toMatchObject({ preset: "all", from: null, to: null });
  });
});

describe("resolvePeriod — dates futures désactivées", () => {
  it("ramène une date de fin future au jour courant", () => {
    expect(resolvePeriod({ preset: "custom", from: "2026-09-01", to: "2026-12-31" }, NOW)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-25",
    });
  });

  it("ramène une date de début future au jour courant", () => {
    expect(resolvePeriod({ preset: "custom", from: "2027-01-01", to: "2027-02-01" }, NOW)).toMatchObject({
      from: "2026-09-25",
      to: "2026-09-25",
    });
  });

  it("remet dans l'ordre des bornes inversées", () => {
    expect(resolvePeriod({ preset: "custom", from: "2026-09-20", to: "2026-09-10" }, NOW)).toMatchObject({
      from: "2026-09-10",
      to: "2026-09-20",
    });
  });

  it("ignore une date invalide (31 février, texte)", () => {
    expect(resolvePeriod({ preset: "custom", from: "2026-02-31", to: "2026-09-10" }, NOW)).toMatchObject({ from: null, to: "2026-09-10" });
    expect(resolvePeriod({ preset: "custom", from: "hier", to: "demain" }, NOW)).toMatchObject({ from: null, to: null });
  });

  it("des dates sans préréglage valent une période personnalisée", () => {
    expect(resolvePeriod({ from: "2026-09-01", to: "2026-09-05" }, NOW)).toMatchObject({ preset: "custom", from: "2026-09-01", to: "2026-09-05" });
  });

  it("accepte une borne ouverte (depuis / jusqu'à)", () => {
    expect(resolvePeriod({ preset: "custom", from: "2026-09-01" }, NOW)).toMatchObject({ from: "2026-09-01", to: null });
    expect(resolvePeriod({ preset: "custom", to: "2026-09-01" }, NOW)).toMatchObject({ from: null, to: "2026-09-01" });
  });
});

describe("fuseau horaire de l'utilisateur", () => {
  // UTC+1 (Cameroun) : Date.getTimezoneOffset() vaut -60.
  const TZ = -60;

  it("le jour courant est celui de l'utilisateur, pas celui du serveur (UTC)", () => {
    // 25/09 23h30 UTC = 26/09 00h30 à UTC+1.
    const lateEvening = Date.UTC(2026, 8, 25, 23, 30);
    expect(resolvePeriod({ preset: "today" }, lateEvening).today).toBe("2026-09-25");
    expect(resolvePeriod({ preset: "today", tzOffsetMinutes: TZ }, lateEvening)).toMatchObject({
      today: "2026-09-26",
      from: "2026-09-26",
      to: "2026-09-26",
    });
  });

  it("les bornes de jour sont minuit-minuit heure locale, exprimées en instants absolus", () => {
    expect(dayStart("2026-09-25", TZ).toISOString()).toBe("2026-09-24T23:00:00.000Z");
    expect(dayEnd("2026-09-25", TZ).toISOString()).toBe("2026-09-25T22:59:59.999Z");
    expect(dayStart("2026-09-25", 0).toISOString()).toBe("2026-09-25T00:00:00.000Z");
    // À l'ouest de UTC (ex. UTC-5, offset +300).
    expect(dayStart("2026-09-25", 300).toISOString()).toBe("2026-09-25T05:00:00.000Z");
  });

  it("une vente à 00h30 heure locale entre dans le bon jour", () => {
    const sale = new Date("2026-09-24T23:30:00.000Z"); // 25/09 00h30 à UTC+1
    const filter = periodCreatedAtFilter(resolvePeriod({ preset: "custom", from: "2026-09-25", to: "2026-09-25", tzOffsetMinutes: TZ }, NOW))!;
    expect(sale >= filter.gte! && sale <= filter.lte!).toBe(true);
    const sameDayInUtc = periodCreatedAtFilter(resolvePeriod({ preset: "custom", from: "2026-09-25", to: "2026-09-25" }, NOW))!;
    expect(sale >= sameDayInUtc.gte! && sale <= sameDayInUtc.lte!).toBe(false);
  });

  it("un décalage absurde est ignoré", () => {
    expect(resolvePeriod({ preset: "today", tzOffsetMinutes: 99999 }, NOW).tzOffsetMinutes).toBe(0);
    expect(resolvePeriod({ preset: "today", tzOffsetMinutes: NaN }, NOW).tzOffsetMinutes).toBe(0);
  });
});

describe("filtres de requête", () => {
  it("'Tout' ne produit aucun filtre de date", () => {
    expect(periodCreatedAtFilter(resolvePeriod({}, NOW))).toBeUndefined();
  });

  it("une période produit gte/lte sur createdAt", () => {
    const filter = periodCreatedAtFilter(resolvePeriod({ preset: "custom", from: "2026-09-01", to: "2026-09-05" }, NOW))!;
    expect(filter.gte!.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(filter.lte!.toISOString()).toBe("2026-09-05T23:59:59.999Z");
  });

  it("'aujourd'hui' est intersecté avec la période : vide si la période s'arrête avant", () => {
    const includesToday = todayCreatedAtFilter(resolvePeriod({ preset: "month" }, NOW));
    expect(includesToday.gte.toISOString()).toBe("2026-09-25T00:00:00.000Z");

    const endedBefore = resolvePeriod({ preset: "lastMonth" }, NOW);
    const t = todayCreatedAtFilter(endedBefore);
    // Début d'aujourd'hui APRÈS la fin de la période : aucun document ne peut correspondre.
    expect(t.gte.getTime()).toBeGreaterThan(t.lte!.getTime());
    expect(periodIncludesToday(endedBefore)).toBe(false);
    expect(periodIncludesToday(resolvePeriod({ preset: "month" }, NOW))).toBe(true);
    expect(periodIncludesToday(resolvePeriod({}, NOW))).toBe(true);
  });
});

describe("paramètres d'URL", () => {
  it("lit p, from, to et tz (première valeur si répétés)", () => {
    expect(parsePeriodSearchParams({ p: "custom", from: "2026-09-01", to: ["2026-09-05", "x"], tz: "-60" })).toEqual({
      preset: "custom",
      from: "2026-09-01",
      to: "2026-09-05",
      tzOffsetMinutes: -60,
    });
    expect(parsePeriodSearchParams({})).toEqual({ preset: undefined, from: undefined, to: undefined, tzOffsetMinutes: undefined });
  });

  it("fabrique la chaîne de requête du filtre ; 'Tout' n'ajoute rien à l'URL", () => {
    expect(periodToSearchString({ preset: "all" }, -60)).toBe("");
    expect(periodToSearchString({ preset: "7d" }, -60)).toBe("p=7d&tz=-60");
    expect(periodToSearchString({ preset: "custom", from: "2026-09-01", to: "2026-09-05" }, 0)).toBe(
      "p=custom&from=2026-09-01&to=2026-09-05&tz=0"
    );
  });

  it("aller-retour URL → période", () => {
    const qs = periodToSearchString({ preset: "custom", from: "2026-09-01", to: "2026-09-05" }, -60);
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(resolvePeriod(parsePeriodSearchParams(sp), NOW)).toMatchObject({ preset: "custom", from: "2026-09-01", to: "2026-09-05", tzOffsetMinutes: -60 });
  });
});

describe("formatPeriodLabel / isValidDateKey", () => {
  it("libellés en français", () => {
    expect(formatPeriodLabel(resolvePeriod({}, NOW))).toBe("Toute la période");
    expect(formatPeriodLabel(resolvePeriod({ preset: "today" }, NOW))).toMatch(/^Le 25 sept\.? 2026$/);
    expect(formatPeriodLabel(resolvePeriod({ preset: "month" }, NOW))).toMatch(/^Du 1 sept\.? au 25 sept\.? 2026$/);
    expect(formatPeriodLabel(resolvePeriod({ preset: "year" }, NOW))).toMatch(/^Du 1 janv\.? au 25 sept\.? 2026$/);
    expect(formatPeriodLabel(resolvePeriod({ preset: "custom", from: "2026-09-01" }, NOW))).toMatch(/^Depuis le 1 sept\.? 2026$/);
    expect(formatPeriodLabel(resolvePeriod({ preset: "custom", to: "2026-09-01" }, NOW))).toMatch(/^Jusqu'au 1 sept\.? 2026$/);
  });

  it("valide les dates AAAA-MM-JJ réelles", () => {
    expect(isValidDateKey("2026-09-25")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("25/09/2026")).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
  });
});
