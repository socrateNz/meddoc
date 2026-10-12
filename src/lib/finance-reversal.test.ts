import { describe, it, expect } from "vitest";
import { countsInKpi } from "./finance-reversal";

describe("countsInKpi", () => {
  it("exclut des recettes/dépenses le règlement contrepassé et son écriture d'annulation", () => {
    expect(countsInKpi({ category: "PHARMACY_SALE", reversedAt: null })).toBe(true);
    // Document antérieur à la contrepassation : champ absent.
    expect(countsInKpi({ category: "PHARMACY_SALE" })).toBe(true);
    expect(countsInKpi({ category: "PHARMACY_SALE", reversedAt: new Date() })).toBe(false);
    expect(countsInKpi({ category: "REVERSAL", reversedAt: null })).toBe(false);
  });
});
