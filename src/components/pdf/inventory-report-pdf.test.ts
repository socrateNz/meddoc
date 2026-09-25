import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import fs from "node:fs";
import InventoryReportPDFDocument from "./inventory-report-pdf";
import { buildInventoryReport } from "@/lib/inventory-report";

// Test de fumée : le document se rend réellement en PDF (un style invalide ou une donnée inattendue
// ferait planter react-pdf au clic de l'utilisateur, pas à la compilation).
describe("InventoryReportPDFDocument", () => {
  const lines = Array.from({ length: 120 }, (_, i) => ({
    id: `l${i}`,
    pharmacyItemId: `p${i}`,
    systemQuantity: 10,
    countedQuantity: i % 10 === 0 ? 7 : i % 15 === 0 ? null : 10,
    pharmacyItem: { name: `Produit ${String(i).padStart(3, "0")}`, dosage: i % 2 ? "500mg" : null, category: "MEDICATION" },
  }));
  const adjustments = lines
    .filter((l) => l.countedQuantity === 7)
    .map((l) => ({ inventoryCountLineId: l.id, quantityDelta: -3, valuationAmount: 300 }));

  const render = (report: ReturnType<typeof buildInventoryReport>) =>
    renderToBuffer(
      // renderToBuffer attend un élément <Document> ; createElement (contrairement au JSX utilisé par
      // l'appli) ne le déduit pas du composant, d'où le cast.
      createElement(InventoryReportPDFDocument, {
        inventory: { id: "6a9b0704b96d96aeda3cf69b", createdAt: new Date("2026-09-01"), completedAt: new Date("2026-09-02"), startedBy: { firstName: "Awa", lastName: "Ndiaye" } },
        report,
        organizationName: "Clinique Le Bien-être",
        organizationLogoUrl: null,
      }) as unknown as ReactElement<DocumentProps>
    );

  it("génère un PDF valide pour un inventaire de plusieurs pages", async () => {
    const buffer = await render(buildInventoryReport(lines, adjustments));

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(2000);
    if (process.env.INVENTORY_PDF_OUT) fs.writeFileSync(process.env.INVENTORY_PDF_OUT, buffer);
  });

  it("génère un PDF valide même sans aucun produit modifié ni ligne", async () => {
    const buffer = await render(buildInventoryReport([], []));

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
