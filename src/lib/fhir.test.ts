import { describe, it, expect } from "vitest";
import { fhirBundle, IPP_SYSTEM, labResultObservation, radiologyDiagnosticReport, toFhirPatient, vitalSignObservations } from "./fhir";
import { extractIntegrationKey, generateIntegrationKey, hashIntegrationKey } from "./integration-keys";
import { computeLabOrderStatus, isCriticalValue } from "./lab-rules";

describe("ressources FHIR", () => {
  it("convertit un patient avec son IPP", () => {
    const p = toFhirPatient({ id: "p1", ipp: "IPP-2026-000042", sex: "F", dateOfBirth: "1990-03-04T00:00:00Z", address: "Douala", user: { firstName: "Awa", lastName: "Ndiaye", phone: "+237600000000" } });
    expect(p).toMatchObject({
      resourceType: "Patient",
      id: "p1",
      identifier: [{ system: IPP_SYSTEM, value: "IPP-2026-000042" }],
      name: [{ family: "Ndiaye", given: ["Awa"] }],
      gender: "female",
      birthDate: "1990-03-04",
      telecom: [{ system: "phone", value: "+237600000000" }],
    });
  });

  it("éclate un relevé de constantes en Observations LOINC", () => {
    const obs = vitalSignObservations({ id: "v1", patientId: "p1", createdAt: "2026-10-13T08:00:00Z", temperature: 38.2, bloodPressure: "130/85", heartRate: 92, oxygenSaturation: null, bloodSugar: null, weight: null, painScore: null });
    expect(obs.map((o) => o.id)).toEqual(["v1-temp", "v1-hr", "v1-bp"]);
    const bp = obs.find((o) => o.id === "v1-bp") as unknown as { component: { valueQuantity: { value: number } }[] };
    expect(bp.component.map((c) => c.valueQuantity.value)).toEqual([130, 85]);
  });

  it("type la valeur d'un résultat de laboratoire", () => {
    const base = { id: "r1", patientId: "p1", testName: "Hémoglobine", unit: "g/dL", referenceRange: "12-16", isAbnormal: true, notes: null, validatedAt: "2026-10-13T09:00:00Z" };
    expect(labResultObservation({ ...base, value: "6,2" })).toMatchObject({ valueQuantity: { value: 6.2, unit: "g/dL" }, interpretation: [{ coding: [{ code: "A" }] }] });
    expect(labResultObservation({ ...base, value: "Négatif", isAbnormal: false })).toMatchObject({ valueString: "Négatif" });
  });

  it("joint le compte-rendu d'imagerie en base64 et assemble un Bundle", () => {
    const report = radiologyDiagnosticReport({ id: "o1", patientId: "p1", exams: [{ name: "Radio thorax" }], performedAt: null, validatedAt: "2026-10-13T09:00:00Z", report: "Normal", conclusion: "RAS" });
    expect(report).toMatchObject({ conclusion: "RAS", presentedForm: [{ data: Buffer.from("Normal").toString("base64") }] });
    const bundle = fhirBundle("searchset", [report], "https://x/api/fhir") as { total: number; entry: { fullUrl: string }[] };
    expect(bundle.total).toBe(1);
    expect(bundle.entry[0].fullUrl).toBe("https://x/api/fhir/DiagnosticReport/o1");
  });
});

describe("clés d'API", () => {
  it("génère une clé dont seule l'empreinte est stockée", () => {
    const { key, prefix, hash } = generateIntegrationKey();
    expect(key.startsWith(`mdk_${prefix}_`)).toBe(true);
    expect(hash).toBe(hashIntegrationKey(key));
    expect(hash).not.toContain(key);
  });

  it("lit la clé dans Authorization ou X-Api-Key, et rejette une valeur mal formée", () => {
    const { key } = generateIntegrationKey();
    expect(extractIntegrationKey(new Headers({ Authorization: `Bearer ${key}` }))).toBe(key);
    expect(extractIntegrationKey(new Headers({ "X-Api-Key": key }))).toBe(key);
    expect(extractIntegrationKey(new Headers({ Authorization: "Bearer n'importe-quoi" }))).toBeNull();
    expect(extractIntegrationKey(new Headers())).toBeNull();
  });
});

describe("règles du laboratoire partagées", () => {
  it("détecte une valeur critique", () => {
    const test = { criticalLow: 7, criticalHigh: 18 };
    expect(isCriticalValue(test, "6.2")).toBe(true);
    expect(isCriticalValue(test, "12")).toBe(false);
    expect(isCriticalValue(test, "positif")).toBe(false);
    expect(isCriticalValue(null, "1")).toBe(false);
  });

  it("fait avancer le statut d'une demande sans jamais reculer", () => {
    const results = [{ testName: "NFS", validatedAt: null }];
    expect(computeLabOrderStatus({ status: "RECEIVED_AT_LAB", tests: ["NFS", "CRP"], results })).toBe("IN_ANALYSIS");
    expect(computeLabOrderStatus({ status: "IN_ANALYSIS", tests: ["NFS"], results })).toBe("TO_VALIDATE");
    expect(computeLabOrderStatus({ status: "TO_VALIDATE", tests: ["NFS"], results: [{ testName: "NFS", validatedAt: new Date() }] })).toBe("VALIDATED");
    expect(computeLabOrderStatus({ status: "CANCELLED", tests: ["NFS"], results })).toBe("CANCELLED");
  });
});
