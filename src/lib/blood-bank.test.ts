import { describe, it, expect } from "vitest";
import { bedsideChecks, checkCompatibility, expiresSoon, isExpired, nextTransfusionStatus, parseBloodType, requiresCrossmatch, type AboGroup, type Rhesus } from "./blood-bank";

const g = (abo: AboGroup, rh: Rhesus = "POS") => ({ abo, rh });

describe("checkCompatibility — globules rouges", () => {
  it("applique les règles ABO du receveur", () => {
    expect(checkCompatibility("RBC", g("O"), g("AB")).compatible).toBe(true);
    expect(checkCompatibility("RBC", g("O"), g("A")).compatible).toBe(true);
    expect(checkCompatibility("RBC", g("A"), g("O")).compatible).toBe(false);
    expect(checkCompatibility("RBC", g("A"), g("B")).compatible).toBe(false);
    expect(checkCompatibility("RBC", g("AB"), g("A")).compatible).toBe(false);
  });

  it("refuse une poche RhD+ pour un patient RhD-", () => {
    expect(checkCompatibility("RBC", g("O", "POS"), g("O", "NEG"))).toEqual({ compatible: false, reason: expect.stringMatching(/RhD/) });
    expect(checkCompatibility("RBC", g("O", "NEG"), g("O", "POS")).compatible).toBe(true);
  });

  it("exige le même groupe ABO pour le sang total", () => {
    expect(checkCompatibility("WHOLE_BLOOD", g("O"), g("A")).compatible).toBe(false);
    expect(checkCompatibility("WHOLE_BLOOD", g("A"), g("A")).compatible).toBe(true);
  });
});

describe("checkCompatibility — plasma et plaquettes", () => {
  it("inverse la règle pour le plasma (AB donneur universel)", () => {
    expect(checkCompatibility("PLASMA", g("AB"), g("O")).compatible).toBe(true);
    expect(checkCompatibility("PLASMA", g("O"), g("A")).compatible).toBe(false);
    expect(checkCompatibility("PLASMA", g("A", "POS"), g("A", "NEG")).compatible).toBe(true);
  });

  it("n'oppose aux plaquettes qu'un avertissement", () => {
    const res = checkCompatibility("PLATELETS", g("O", "POS"), g("A", "NEG"));
    expect(res.compatible).toBe(true);
    expect(res.warning).toMatch(/anti-D/);
    expect(checkCompatibility("PLATELETS", g("A"), g("A")).warning).toBeUndefined();
  });
});

describe("règles annexes", () => {
  it("lit les groupes sanguins saisis librement", () => {
    expect(parseBloodType("O+")).toEqual({ abo: "O", rh: "POS" });
    expect(parseBloodType(" ab - ")).toEqual({ abo: "AB", rh: "NEG" });
    expect(parseBloodType("A pos")).toEqual({ abo: "A", rh: "POS" });
    expect(parseBloodType("inconnu")).toBeNull();
    expect(parseBloodType(null)).toBeNull();
  });

  it("gère péremption, cross-match, contrôle au lit et transitions", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(isExpired("2026-10-13T11:59:00Z", now)).toBe(true);
    expect(expiresSoon("2026-10-15T12:00:00Z", now)).toBe(true);
    expect(expiresSoon("2026-10-20T12:00:00Z", now)).toBe(false);
    expect(requiresCrossmatch("RBC")).toBe(true);
    expect(requiresCrossmatch("PLASMA")).toBe(false);
    expect(bedsideChecks("RBC").map((c) => c.key)).toContain("abo_card");
    expect(bedsideChecks("PLASMA").map((c) => c.key)).not.toContain("abo_card");
    expect(nextTransfusionStatus("RESERVED", "START")).toBe("IN_PROGRESS");
    expect(nextTransfusionStatus("IN_PROGRESS", "CANCEL")).toBeNull();
  });
});
