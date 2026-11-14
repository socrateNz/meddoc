import { describe, it, expect } from "vitest";
import { AccountingError, allocate, depreciationCumul, formatEntryNumber, isLocked, prepareLines, vatFromHt, vatFromTtc } from "./rules";

describe("TVA", () => {
  it("prix TTC : 11 925 à 19,25 % → TVA 1 925, HT 10 000 (test de référence)", () => {
    expect(vatFromTtc(11925, 0.1925)).toEqual({ ht: 10000, vat: 1925, ttc: 11925 });
  });
  it("prix HT : 10 000 à 19,25 % → TVA 1 925, TTC 11 925", () => {
    expect(vatFromHt(10000, 0.1925)).toEqual({ ht: 10000, vat: 1925, ttc: 11925 });
  });
  it("taux 0 (actes médicaux exonérés) : pas de TVA", () => {
    expect(vatFromTtc(10000, 0)).toEqual({ ht: 10000, vat: 0, ttc: 10000 });
  });
});

describe("allocate", () => {
  it("10 000 en trois parts égales → 3 334 / 3 333 / 3 333, somme exacte (test de référence)", () => {
    const parts = allocate(10000, { a: 1, b: 1, c: 1 });
    expect(parts).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(parts.a + parts.b + parts.c).toBe(10000);
  });
  it("l'écart d'arrondi va au poids le plus lourd", () => {
    const parts = allocate(100, { petit: 1, gros: 2 });
    expect(parts.petit + parts.gros).toBe(100);
    expect(parts.gros).toBe(67);
  });
  it("les poids nuls ne reçoivent rien", () => {
    expect(allocate(5000, { a: 0, b: 3 })).toEqual({ a: 0, b: 5000 });
  });
});

describe("prepareLines", () => {
  it("arrondit, met le libellé par défaut et retire les lignes à 0", () => {
    const lines = prepareLines(
      [
        { account: "571", debit: 3000.4 },
        { account: "4111", debit: 7000 },
        { account: "7061", credit: 10000.4 },
        { account: "4432", credit: 0 },
      ],
      "Consultation"
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ account: "571", debit: 3000, credit: 0, label: "Consultation" });
  });
  const expectCode = (fn: () => unknown, code: string) => {
    try {
      fn();
      throw new Error("aucune erreur");
    } catch (e) {
      expect(e).toBeInstanceOf(AccountingError);
      expect((e as AccountingError).code).toBe(code);
    }
  };
  it("refuse une écriture déséquilibrée", () => {
    expectCode(() => prepareLines([{ account: "571", debit: 100 }, { account: "7061", credit: 90 }], "x"), "UNBALANCED");
  });
  it("refuse moins de deux lignes, un compte invalide, un montant négatif, débit et crédit ensemble", () => {
    expectCode(() => prepareLines([{ account: "571", debit: 100 }], "x"), "INVALID_LINES");
    expectCode(() => prepareLines([{ account: "9", debit: 100 }, { account: "7061", credit: 100 }], "x"), "INVALID_LINES");
    expectCode(() => prepareLines([{ account: "571", debit: -100 }, { account: "7061", credit: -100 }], "x"), "INVALID_LINES");
    expectCode(() => prepareLines([{ account: "571", debit: 100, credit: 100 }, { account: "7061", credit: 0, debit: 0 }, { account: "706", credit: 1 }], "x"), "INVALID_LINES");
  });
});

describe("numérotation et verrou", () => {
  it("format JOURNAL-AAAA-NNNNN", () => {
    expect(formatEntryNumber("TR", 2026, 42)).toBe("TR-2026-00042");
  });
  it("le jour du verrou est lui-même verrouillé", () => {
    expect(isLocked("2026-12-31", "2026-12-31")).toBe(true);
    expect(isLocked("2027-01-01", "2026-12-31")).toBe(false);
    expect(isLocked("2026-01-01", null)).toBe(false);
  });
});

describe("amortissement linéaire au prorata des jours", () => {
  it("échographe 1 200 000 / 60 mois, mis en service le 01/07/2026, au 31/12/2026 → 120 986 (test de référence)", () => {
    expect(depreciationCumul(1200000, 60, "2026-07-01", "2026-12-31")).toBe(120986);
  });
  it("0 avant la mise en service ou sans durée ; le coût complet en fin de durée", () => {
    expect(depreciationCumul(1200000, 60, "2026-07-01", "2026-06-30")).toBe(0);
    expect(depreciationCumul(500000, 0, "2026-01-01", "2026-12-31")).toBe(0);
    expect(depreciationCumul(1200000, 60, "2026-07-01", "2031-07-01")).toBe(1200000);
  });
});
