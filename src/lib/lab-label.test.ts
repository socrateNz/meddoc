import { describe, it, expect } from "vitest";
import { buildTubeLabelData, labOrderReference } from "./lab-label";

describe("labOrderReference", () => {
  it("reprend le numéro du compte-rendu (8 derniers caractères de l'identifiant)", () => {
    expect(labOrderReference("6a9b0704b96d96aeda3cf69b")).toBe("LAB-DA3CF69B");
  });
});

describe("buildTubeLabelData", () => {
  it("rassemble l'identité du patient (IPP compris), l'échantillon et les analyses", () => {
    const label = buildTubeLabelData({
      id: "6a9b0704b96d96aeda3cf69b",
      tests: ["NFS", "Glycémie à jeun"],
      sampleType: "BLOOD",
      sampleCollectedAt: new Date(2026, 9, 12, 8, 5),
      priority: "URGENT",
      patient: { ipp: "IPP-2026-001248", dateOfBirth: new Date(1990, 2, 4), sex: "F", user: { firstName: "Awa", lastName: "Ndiaye" } },
    });
    expect(label).toEqual({
      reference: "LAB-DA3CF69B",
      patientName: "NDIAYE Awa",
      ipp: "IPP-2026-001248",
      birthDate: "04/03/1990",
      sex: "F",
      sampleType: "Sang",
      tests: "NFS, Glycémie à jeun",
      collectedAt: "12/10/26 08:05",
      priority: "URGENT",
    });
  });

  it("reste imprimable avec un dossier incomplet (ancien patient sans IPP)", () => {
    const label = buildTubeLabelData({ id: "abc", patient: { user: { lastName: "Mbarga" } } });
    expect(label).toMatchObject({ patientName: "MBARGA", ipp: null, sampleType: "Échantillon", priority: "ROUTINE", collectedAt: null });
  });
});
