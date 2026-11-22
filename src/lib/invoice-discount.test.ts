import { describe, it, expect } from "vitest";
import { applyItemDiscounts, totalDiscount, withDiscount } from "./invoice-discount";

const exam = { type: "LAB", description: "NFS", quantity: 1, unitPrice: 10000, amount: 10000 };
const boss = { role: "COORDINATOR" };
const cashier = { role: "CASHIER" };

describe("withDiscount", () => {
  it("recalcule le montant net depuis le prix et garde le motif", () => {
    expect(withDiscount(exam, 2500, "patient indigent")).toEqual({ ...exam, amount: 7500, discount: 2500, discountReason: "patient indigent" });
  });

  it("exige un motif et refuse une réduction supérieure au prix", () => {
    expect(() => withDiscount(exam, 1000, "  ")).toThrow(/motif/);
    expect(() => withDiscount(exam, 10001, "x")).toThrow(/dépasse/);
  });

  it("retirer la réduction rétablit le prix", () => {
    const reduced = withDiscount(exam, 4000, "geste");
    expect(withDiscount(reduced, 0)).toEqual(exam);
  });

  it("une gratuité totale donne une ligne à 0", () => {
    expect(withDiscount(exam, 10000, "offert").amount).toBe(0);
  });
});

describe("applyItemDiscounts", () => {
  it("le responsable accorde une réduction ; le montant transmis est ignoré", () => {
    const [line] = applyItemDiscounts(boss, [{ ...exam, amount: 1, discount: 3000, discountReason: "personnel" }]);
    expect(line.amount).toBe(7000);
    expect(totalDiscount([line])).toBe(3000);
  });

  it("le caissier ne peut ni créer ni augmenter une réduction", () => {
    expect(() => applyItemDiscounts(cashier, [{ ...exam, discount: 1000, discountReason: "x" }])).toThrow(/responsable/);
    const previous = [withDiscount(exam, 2000, "accordée par le coordinateur")];
    expect(() => applyItemDiscounts(cashier, [{ ...previous[0], discount: 3000 }], previous)).toThrow(/responsable/);
  });

  it("le caissier encaisse tel quel un ticket déjà réduit", () => {
    const previous = [withDiscount(exam, 2000, "accordée par le coordinateur")];
    const [line] = applyItemDiscounts(cashier, previous, previous);
    expect(line).toEqual(previous[0]);
  });

  it("une ligne sans réduction reste inchangée", () => {
    const odd = { type: "SERVICE", description: "Nuitées", quantity: 3, unitPrice: 0, amount: 45000 };
    expect(applyItemDiscounts(cashier, [odd])).toEqual([odd]);
  });
});
