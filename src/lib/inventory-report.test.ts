import { describe, it, expect } from "vitest";
import { buildInventoryReport } from "./inventory-report";

const line = (id: string, name: string, systemQuantity: number, countedQuantity: number | null, dosage: string | null = null) => ({
  id,
  pharmacyItemId: `item-${id}`,
  systemQuantity,
  countedQuantity,
  pharmacyItem: { name, dosage, category: "MEDICATION" },
});

describe("buildInventoryReport", () => {
  it("classe chaque ligne : modifiée (ajustement appliqué), conforme (dont ligne jamais saisie), écart non appliqué", () => {
    const report = buildInventoryReport(
      [
        line("l1", "Amoxicilline", 10, 7, "500mg"), // perte de 3, appliquée
        line("l2", "Paracétamol", 4, 6), // surplus de 2, appliqué
        line("l3", "Vitamine C", 5, 5), // conforme
        line("l4", "Ibuprofène", 8, null), // jamais comptée
        line("l5", "Fluclox", 6, 6 + 3), // écart constaté mais stock périmé : aucun ajustement
      ],
      [
        { inventoryCountLineId: "l1", quantityDelta: -3, valuationAmount: 400 },
        { inventoryCountLineId: "l2", quantityDelta: 2, valuationAmount: 100 },
      ]
    );

    const statusByName = Object.fromEntries(report.rows.map((r) => [r.name, r.status]));
    expect(statusByName).toEqual({
      Amoxicilline: "MODIFIED",
      Paracétamol: "MODIFIED",
      "Vitamine C": "CONFORM",
      Ibuprofène: "CONFORM", // ligne laissée à sa valeur par défaut = confirmée conforme
      Fluclox: "NOT_APPLIED",
    });
    expect(report.totals).toEqual({
      totalLines: 5,
      conform: 2,
      modified: 2,
      notApplied: 1,
      lossUnits: 3,
      lossValue: 400,
      surplusUnits: 2,
      surplusValue: 100,
    });
  });

  it("range une ligne jamais saisie avec les conformes, en affichant le stock système comme quantité confirmée", () => {
    const report = buildInventoryReport([line("l1", "Ibuprofène", 8, null)], []);

    expect(report.rows[0]).toMatchObject({ status: "CONFORM", systemQuantity: 8, countedQuantity: 8, delta: null });
    expect(report.totals).toMatchObject({ conform: 1, modified: 0, notApplied: 0 });
  });

  it("donne, pour un produit modifié, le stock avant (système au comptage), après (compté), l'écart et la valeur", () => {
    const report = buildInventoryReport(
      [line("l1", "Amoxicilline", 10, 7, "500mg")],
      [{ inventoryCountLineId: "l1", quantityDelta: -3, valuationAmount: 400 }]
    );

    expect(report.modified).toHaveLength(1);
    expect(report.modified[0]).toMatchObject({
      name: "Amoxicilline",
      dosage: "500mg",
      stockBefore: 10,
      stockAfter: 7,
      delta: -3,
      valuation: 400,
      status: "MODIFIED",
    });
  });

  it("ne compte comme modifié que ce qui a un ajustement : une ligne à écart sans ajustement est 'non appliquée'", () => {
    const report = buildInventoryReport([line("l1", "Fluclox", 6, 9)], []);

    expect(report.modified).toHaveLength(0);
    expect(report.notApplied).toHaveLength(1);
    expect(report.notApplied[0]).toMatchObject({ delta: 3, stockBefore: null, stockAfter: null, valuation: null });
    expect(report.totals.lossValue).toBe(0);
    expect(report.totals.surplusUnits).toBe(0);
  });

  it("ignore les ajustements qui ne sont rattachés à aucune ligne de cet inventaire", () => {
    const report = buildInventoryReport(
      [line("l1", "Vitamine C", 5, 5)],
      [
        { inventoryCountLineId: null, quantityDelta: -9, valuationAmount: 999 },
        { inventoryCountLineId: "autre-ligne", quantityDelta: -9, valuationAmount: 999 },
      ]
    );

    expect(report.totals.modified).toBe(0);
    expect(report.totals.lossValue).toBe(0);
    expect(report.rows[0].status).toBe("CONFORM");
  });

  it("valorise à 0 une perte sans lot d'achat (valuationAmount nul) sans planter", () => {
    const report = buildInventoryReport(
      [line("l1", "Stock hérité", 5, 2)],
      [{ inventoryCountLineId: "l1", quantityDelta: -3, valuationAmount: null }]
    );

    expect(report.modified[0].valuation).toBe(0);
    expect(report.totals.lossUnits).toBe(3);
    expect(report.totals.lossValue).toBe(0);
  });

  it("trie les lignes par nom (ordre alphabétique français, accents ignorés)", () => {
    const report = buildInventoryReport(
      [line("l1", "Zinc", 1, 1), line("l2", "Érythromycine", 1, 1), line("l3", "Amoxicilline", 1, 1)],
      []
    );

    expect(report.rows.map((r) => r.name)).toEqual(["Amoxicilline", "Érythromycine", "Zinc"]);
  });

  it("nomme 'Produit supprimé' une ligne dont le produit n'existe plus", () => {
    const report = buildInventoryReport(
      [{ id: "l1", pharmacyItemId: "gone", systemQuantity: 1, countedQuantity: 1, pharmacyItem: null }],
      []
    );

    expect(report.rows[0].name).toBe("Produit supprimé");
  });
});
