import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import OperativeReportPDFDocument, { type OperativeReportData } from "./operative-report-pdf";

// Test de fumée : le compte-rendu opératoire se rend réellement en PDF.
describe("OperativeReportPDFDocument", () => {
  const base: OperativeReportData = {
    reference: "BLOC-A8B9C0D1",
    organization: { name: "Clinique Le Bien-être", logoUrl: null },
    patient: { ipp: "IPP-2026-000042", dateOfBirth: "1990-03-04", sex: "F", bloodType: "O+", user: { firstName: "Awa", lastName: "Ndiaye" } },
    procedure: "Appendicectomie par laparoscopie",
    lateralityLabel: null,
    anesthesiaLabel: "Anesthésie générale",
    indication: "Appendicite aiguë",
    roomName: "Salle 1",
    surgeonName: "Jean Mballa",
    anesthetistName: "Paul Etoa",
    scrubNurseName: "Marie Ngo",
    actualStart: "2026-10-13T07:05:00.000Z",
    actualEnd: "2026-10-13T08:10:00.000Z",
    operativeReport: "Installation en décubitus dorsal. Open coelioscopie ombilicale.\nAppendice inflammatoire, sans perforation. Appendicectomie.",
    complications: null,
    postOpInstructions: "Surveillance des constantes, antalgie palier 1, reprise alimentaire J1.",
    reportedByName: "Jean Mballa",
    reportedAt: "2026-10-13T08:20:00.000Z",
    checklist: [
      { label: "Avant l'induction anesthésique", checkedByName: "Marie Ngo", checkedAt: "2026-10-13T06:50:00.000Z" },
      { label: "Avant l'incision", checkedByName: "Marie Ngo", checkedAt: "2026-10-13T07:00:00.000Z" },
      { label: "Avant la sortie de salle", checkedByName: "Marie Ngo", checkedAt: "2026-10-13T08:05:00.000Z" },
    ],
  };
  const render = (data: OperativeReportData) => renderToBuffer(createElement(OperativeReportPDFDocument, { data }) as unknown as ReactElement<DocumentProps>);

  it("génère le compte-rendu complet", async () => {
    expect((await render(base)).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("génère un compte-rendu sans check-list ni équipe complète", async () => {
    const buffer = await render({ ...base, checklist: [], anesthetistName: null, scrubNurseName: null, lateralityLabel: "Droit(e)" });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
