import { describe, it, expect } from "vitest";
import { applyItemDiscounts, spreadDiscount, totalDiscount, withDiscount, type DiscountableItem } from "./invoice-discount";

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

describe("auteur de la réduction", () => {
  it("enregistre qui l'a accordée ; un encaissement ultérieur la conserve", () => {
    const [line] = applyItemDiscounts<DiscountableItem>({ id: "boss1", role: "COORDINATOR" }, [{ ...exam, discount: 2000, discountReason: "personnel" }]);
    expect(line.discountById).toBe("boss1");
    expect(typeof line.discountAt).toBe("string");
    const [paid] = applyItemDiscounts<DiscountableItem>({ id: "cash1", role: "CASHIER" }, [{ ...exam, discount: 2000, discountReason: "personnel" }], [line]);
    expect(paid.discountById).toBe("boss1");
    expect(paid.discountAt).toBe(line.discountAt);
  });

  it("ignore un auteur transmis par le navigateur", () => {
    const [line] = applyItemDiscounts({ id: "boss1", role: "COORDINATOR" }, [{ ...exam, discount: 1000, discountReason: "x", discountById: "pirate" }]);
    expect(line.discountById).toBe("boss1");
  });
});

describe("spreadDiscount", () => {
  it("répartit la réduction du ticket au prorata, au franc près", () => {
    expect(spreadDiscount([13000, 5000], 3000)).toEqual([2167, 833]);
    expect(spreadDiscount([13000, 5000], 18000)).toEqual([13000, 5000]);
    expect(spreadDiscount([13000, 5000], 99999)).toEqual([13000, 5000]);
    expect(spreadDiscount([1000, 1000, 1000], 1000).reduce((s, n) => s + n, 0)).toBe(1000);
    expect(spreadDiscount([0, 0], 500)).toEqual([0, 0]);
  });
});
