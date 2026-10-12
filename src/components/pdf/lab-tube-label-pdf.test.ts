import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { toBuffer } from "bwip-js/node";
import LabTubeLabelPDFDocument from "./lab-tube-label-pdf";
import { buildTubeLabelData } from "@/lib/lab-label";

// Test de fumée : l'étiquette se rend réellement en PDF avec un vrai code-barres Code 128 (même
// paramètres que pdf-download-button.tsx, en version Node).
describe("LabTubeLabelPDFDocument", () => {
  it("génère une page par étiquette demandée", async () => {
    const label = buildTubeLabelData({
      id: "6a9b0704b96d96aeda3cf69b",
      tests: ["NFS", "Glycémie à jeun", "Ionogramme sanguin complet", "Créatininémie", "CRP"],
      sampleType: "BLOOD",
      sampleCollectedAt: new Date("2026-10-12T08:05:00.000Z"),
      priority: "URGENT",
      patient: { ipp: "IPP-2026-001248", dateOfBirth: "1990-03-04", sex: "F", user: { firstName: "Awa", lastName: "Ndiaye" } },
    });
    const png = await toBuffer({ bcid: "code128", text: label.reference, scale: 3, height: 10, includetext: false });

    const buffer = await renderToBuffer(
      createElement(LabTubeLabelPDFDocument, {
        label,
        barcodeDataUrl: `data:image/png;base64,${png.toString("base64")}`,
        copies: 3,
      }) as unknown as ReactElement<DocumentProps>
    );

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(3);
  });
});
