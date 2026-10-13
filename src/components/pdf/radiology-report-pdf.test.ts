import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import RadiologyReportPDFDocument, { type RadiologyReportData } from "./radiology-report-pdf";
import { RADIOLOGY_MODALITY_LABELS } from "@/lib/radiology";

// Test de fumée : le compte-rendu d'imagerie se rend réellement en PDF, validé ou non.
describe("RadiologyReportPDFDocument", () => {
  const base: RadiologyReportData = {
    reference: "IMG-A8B9C0D1",
    organization: { name: "Clinique Le Bien-être", logoUrl: null },
    patient: { ipp: "IPP-2026-000042", dateOfBirth: "1990-03-04", sex: "F", user: { firstName: "Awa", lastName: "Ndiaye" } },
    exams: [{ name: "Radio thorax face", modality: "XRAY" }],
    modalityLabels: RADIOLOGY_MODALITY_LABELS,
    clinicalIndication: "Toux fébrile depuis 10 jours.",
    orderedByName: "Jean Mballa",
    createdAt: "2026-10-12T08:00:00.000Z",
    performedAt: "2026-10-12T09:00:00.000Z",
    report: "Opacité alvéolaire basale droite.\nPas d'épanchement pleural.",
    conclusion: "Aspect de pneumopathie basale droite.",
    reportedByName: "Jean Mballa",
    validatedByName: "Paul Etoa",
    validatedAt: "2026-10-12T11:00:00.000Z",
  };
  const render = (data: RadiologyReportData) =>
    renderToBuffer(createElement(RadiologyReportPDFDocument, { data }) as unknown as ReactElement<DocumentProps>);

  it("génère un compte-rendu validé", async () => {
    expect((await render(base)).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("génère un compte-rendu non encore validé, sans indication", async () => {
    const buffer = await render({ ...base, clinicalIndication: null, validatedByName: null, validatedAt: null });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
