import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import DischargePDFDocument, { type DischargeBulletin } from "./discharge-pdf";

// Test de fumée : le bulletin de sortie se rend réellement en PDF, hospitalisation comme
// ambulatoire, avec ou sans reste à payer.
describe("DischargePDFDocument", () => {
  const base: DischargeBulletin = {
    patient: {
      ipp: "IPP-2026-000042",
      dateOfBirth: "1990-03-04",
      sex: "F",
      user: { firstName: "Awa", lastName: "Ndiaye" },
      organization: { name: "Clinique Le Bien-être", logoUrl: null },
    },
    dischargeSummary: "Évolution favorable. Contrôle dans 15 jours.",
    dischargedAt: "2026-10-12T10:00:00.000Z",
    dischargedBy: "Jean Mballa",
    stay: { admittedAt: "2026-10-10T10:00:00.000Z", nightsBilled: 2, beds: [{ wardName: "Médecine", roomName: "Chambre 3", bedLabel: "A" }] },
    outstanding: 30000,
    overrideReason: "Prise en charge assurance",
  };
  const render = (bulletin: DischargeBulletin) =>
    renderToBuffer(createElement(DischargePDFDocument, { bulletin }) as unknown as ReactElement<DocumentProps>);

  it("génère le bulletin d'une hospitalisation sortie avec un reste à payer", async () => {
    const buffer = await render(base);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("génère le bulletin d'un suivi ambulatoire soldé", async () => {
    const buffer = await render({ ...base, stay: null, outstanding: 0, overrideReason: null });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
