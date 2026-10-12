import { describe, it, expect } from "vitest";
import { midnightsBetween, resolveNightlyRate, stayInvoiceLines, stayNightsToDate, type StaySegment } from "./hospital-stay";

const TZ = "Africa/Douala"; // UTC+1

const segment = (id: string, rate: number, start: string, end: string | null): StaySegment => ({
  id,
  bedLabel: id.toUpperCase(),
  roomName: `Chambre ${id}`,
  wardName: "Médecine",
  nightlyRate: rate,
  startedAt: new Date(start),
  endedAt: end ? new Date(end) : null,
});

describe("resolveNightlyRate", () => {
  it("prend le tarif de la chambre, sinon celui du service, sinon 0", () => {
    expect(resolveNightlyRate({ nightlyRate: 10000 }, { nightlyRate: 25000 })).toBe(25000);
    expect(resolveNightlyRate({ nightlyRate: 10000 }, { nightlyRate: null })).toBe(10000);
    expect(resolveNightlyRate({ nightlyRate: null }, {})).toBe(0);
    // Une chambre explicitement gratuite (0) reste gratuite.
    expect(resolveNightlyRate({ nightlyRate: 10000 }, { nightlyRate: 0 })).toBe(0);
  });
});

describe("midnightsBetween (fuseau de la clinique)", () => {
  it("compte les minuits locaux franchis : entré lundi 15h, sorti mercredi 10h = 2", () => {
    expect(midnightsBetween(new Date("2026-10-12T14:00:00Z"), new Date("2026-10-14T09:00:00Z"), TZ)).toBe(2);
  });

  it("utilise le minuit de Douala, pas celui du serveur UTC", () => {
    // 23h30 UTC = 00h30 à Douala : un minuit local est déjà franchi.
    expect(midnightsBetween(new Date("2026-10-12T20:00:00Z"), new Date("2026-10-12T23:30:00Z"), TZ)).toBe(1);
  });
});

describe("stayNightsToDate", () => {
  it("facture au moins une nuitée pour un séjour du jour même", () => {
    const nights = stayNightsToDate([segment("a", 15000, "2026-10-12T08:00:00Z", "2026-10-12T16:00:00Z")], new Date("2026-10-12T17:00:00Z"), TZ);
    expect(nights).toHaveLength(1);
  });

  it("attribue chaque nuit au lit occupé à ce minuit-là lors d'un transfert", () => {
    const segments = [
      segment("a", 10000, "2026-10-10T10:00:00Z", "2026-10-12T09:00:00Z"), // 2 minuits
      segment("b", 25000, "2026-10-12T09:00:00Z", null), // 1 minuit jusqu'à « maintenant »
    ];
    const nights = stayNightsToDate(segments, new Date("2026-10-13T08:00:00Z"), TZ);
    expect(nights.map((n) => n.id)).toEqual(["a", "a", "b"]);
  });

  it("une correction d'affectation de quelques minutes ne coûte rien de plus", () => {
    const segments = [
      segment("erreur", 50000, "2026-10-12T08:00:00Z", "2026-10-12T08:05:00Z"),
      segment("bon", 10000, "2026-10-12T08:05:00Z", null),
    ];
    const nights = stayNightsToDate(segments, new Date("2026-10-14T08:00:00Z"), TZ);
    expect(nights.map((n) => n.id)).toEqual(["bon", "bon"]);
  });
});

describe("stayInvoiceLines", () => {
  const segments = [segment("a", 10000, "2026-10-10T10:00:00Z", "2026-10-12T09:00:00Z"), segment("b", 25000, "2026-10-12T09:00:00Z", null)];
  const nights = stayNightsToDate(segments, new Date("2026-10-13T08:00:00Z"), TZ);

  it("regroupe les nuits par lit, avec quantité, prix unitaire et montant", () => {
    expect(stayInvoiceLines(nights, 0)).toEqual({
      nightsCovered: 3,
      lines: [
        { type: "SERVICE", description: "Hospitalisation — Médecine / Chambre a (lit A) — 2 nuitées", quantity: 2, unitPrice: 10000, amount: 20000 },
        { type: "SERVICE", description: "Hospitalisation — Médecine / Chambre b (lit B) — 1 nuitée", quantity: 1, unitPrice: 25000, amount: 25000 },
      ],
    });
  });

  it("ne refacture jamais les nuits déjà facturées", () => {
    expect(stayInvoiceLines(nights, 2).lines).toEqual([
      expect.objectContaining({ quantity: 1, amount: 25000 }),
    ]);
    expect(stayInvoiceLines(nights, 3)).toEqual({ lines: [], nightsCovered: 0 });
  });

  it("ne crée aucune ligne pour un lit sans tarif, mais compte la nuit comme traitée", () => {
    const free = stayNightsToDate([segment("g", 0, "2026-10-12T08:00:00Z", null)], new Date("2026-10-13T08:00:00Z"), TZ);
    expect(stayInvoiceLines(free, 0)).toEqual({ lines: [], nightsCovered: 1 });
  });
});
