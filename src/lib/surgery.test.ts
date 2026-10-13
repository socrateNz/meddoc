import { describe, it, expect } from "vitest";
import { CHECKLIST, intervalsOverlap, phaseBlocker, surgeryReference, surgeryTransition, validatePhaseAnswers, type ChecklistRecord } from "./surgery";
import { clinicDateTimeToUtc, clinicTimeLabel } from "./clinic-day";

const allYes = (phase: keyof typeof CHECKLIST) => Object.fromEntries(CHECKLIST[phase].items.map((i) => [i.key, "YES"]));
const signed = { answers: {}, notes: null, checkedById: "u1", checkedAt: "2026-10-13T08:00:00Z" };

describe("check-list de sécurité", () => {
  it("exige chaque point confirmé, « N/A » seulement quand c'est prévu", () => {
    expect(validatePhaseAnswers("SIGN_IN", allYes("SIGN_IN"))).toBeNull();
    expect(validatePhaseAnswers("SIGN_IN", { ...allYes("SIGN_IN"), site_marked: "NA" })).toBeNull();
    expect(validatePhaseAnswers("SIGN_IN", { ...allYes("SIGN_IN"), consent: "NA" })).toMatch(/Consentement/);
    const missing = Object.fromEntries(Object.entries(allYes("SIGN_IN")).filter(([k]) => k !== "identity"));
    expect(validatePhaseAnswers("SIGN_IN", missing)).toMatch(/Identité/);
    expect(validatePhaseAnswers("SIGN_IN", { ...allYes("SIGN_IN"), extra: "YES" })).toMatch(/inconnue/);
  });

  it("impose l'ordre des étapes et interdit de resigner", () => {
    expect(phaseBlocker("SIGN_IN", "SCHEDULED", {})).toBeNull();
    expect(phaseBlocker("TIME_OUT", "SCHEDULED", {})).toMatch(/avant induction/);
    expect(phaseBlocker("TIME_OUT", "SCHEDULED", { SIGN_IN: signed })).toBeNull();
    expect(phaseBlocker("SIGN_IN", "SCHEDULED", { SIGN_IN: signed })).toMatch(/déjà signée/);
    expect(phaseBlocker("SIGN_OUT", "SCHEDULED", {})).toMatch(/pendant l'intervention/);
    expect(phaseBlocker("SIGN_OUT", "IN_PROGRESS", {})).toBeNull();
    expect(phaseBlocker("SIGN_IN", "IN_PROGRESS", {})).not.toBeNull();
  });
});

describe("surgeryTransition", () => {
  const before: ChecklistRecord = { SIGN_IN: signed, TIME_OUT: signed };
  it("ne commence qu'avec les deux premières étapes signées", () => {
    expect(surgeryTransition("SCHEDULED", "START", { SIGN_IN: signed })).toHaveProperty("error");
    expect(surgeryTransition("SCHEDULED", "START", before)).toEqual({ next: "IN_PROGRESS" });
  });

  it("ne termine qu'avec l'étape de sortie signée, et n'annule qu'avant le début", () => {
    expect(surgeryTransition("IN_PROGRESS", "COMPLETE", before)).toHaveProperty("error");
    expect(surgeryTransition("IN_PROGRESS", "COMPLETE", { ...before, SIGN_OUT: signed })).toEqual({ next: "COMPLETED" });
    expect(surgeryTransition("IN_PROGRESS", "CANCEL", before)).toHaveProperty("error");
    expect(surgeryTransition("SCHEDULED", "CANCEL", {})).toEqual({ next: "CANCELLED" });
  });
});

describe("créneaux", () => {
  const d = (s: string) => new Date(s);
  it("détecte un chevauchement, pas des créneaux qui se suivent", () => {
    expect(intervalsOverlap(d("2026-10-13T08:00Z"), d("2026-10-13T09:00Z"), d("2026-10-13T08:30Z"), d("2026-10-13T10:00Z"))).toBe(true);
    expect(intervalsOverlap(d("2026-10-13T08:00Z"), d("2026-10-13T09:00Z"), d("2026-10-13T09:00Z"), d("2026-10-13T10:00Z"))).toBe(false);
  });

  it("convertit l'heure de la clinique (Douala, UTC+1) en UTC et inversement", () => {
    expect(clinicDateTimeToUtc("2026-10-13", "08:30").toISOString()).toBe("2026-10-13T07:30:00.000Z");
    expect(clinicDateTimeToUtc("2026-10-13", "00:00").toISOString()).toBe("2026-10-12T23:00:00.000Z");
    expect(clinicTimeLabel("2026-10-13T07:30:00.000Z")).toBe("08:30");
    expect(surgeryReference("65f1a2b3c4d5e6f7a8b9c0d1")).toBe("BLOC-A8B9C0D1");
  });
});
