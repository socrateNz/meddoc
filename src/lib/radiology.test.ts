import { describe, it, expect } from "vitest";
import { nextRadiologyStatus, radiologyReference, snapshotExams } from "./radiology";

describe("snapshotExams", () => {
  it("fige les tarifs et ne facture pas les examens gratuits", () => {
    const { snapshot, items } = snapshotExams([
      { id: "e1", name: "Radio thorax", modality: "XRAY", basePrice: 15000 },
      { id: "e2", name: "ECG de contrôle", modality: "ECG", basePrice: 0 },
    ]);
    expect(snapshot).toEqual([
      { examId: "e1", name: "Radio thorax", modality: "XRAY", price: 15000 },
      { examId: "e2", name: "ECG de contrôle", modality: "ECG", price: 0 },
    ]);
    expect(items).toEqual([{ type: "SERVICE", description: "Imagerie : Radio thorax", quantity: 1, unitPrice: 15000, amount: 15000 }]);
  });

  it("ramène un tarif négatif à zéro", () => {
    expect(snapshotExams([{ id: "e1", name: "X", modality: "OTHER", basePrice: -5 }]).items).toEqual([]);
  });
});

describe("nextRadiologyStatus", () => {
  it("suit le circuit prescrit → réalisé → compte-rendu → validé", () => {
    expect(nextRadiologyStatus("PRESCRIBED", "PERFORM")).toBe("PERFORMED");
    expect(nextRadiologyStatus("PERFORMED", "REPORT")).toBe("REPORTED");
    expect(nextRadiologyStatus("REPORTED", "REPORT")).toBe("REPORTED");
    expect(nextRadiologyStatus("REPORTED", "VALIDATE")).toBe("VALIDATED");
  });

  it("refuse les sauts d'étape et toute modification après validation", () => {
    expect(nextRadiologyStatus("PRESCRIBED", "REPORT")).toBeNull();
    expect(nextRadiologyStatus("PERFORMED", "VALIDATE")).toBeNull();
    expect(nextRadiologyStatus("VALIDATED", "REPORT")).toBeNull();
    expect(nextRadiologyStatus("PERFORMED", "CANCEL")).toBeNull();
    expect(nextRadiologyStatus("PRESCRIBED", "CANCEL")).toBe("CANCELLED");
  });

  it("forme la référence IMG-", () => {
    expect(radiologyReference("65f1a2b3c4d5e6f7a8b9c0d1")).toBe("IMG-A8B9C0D1");
  });
});
