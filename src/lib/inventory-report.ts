// Construit les lignes et les totaux du rapport PDF d'un inventaire clôturé (cf. getInventoryReport
// et src/components/pdf/inventory-report-pdf.tsx). Fonction pure : aucun accès base, testable seule.
//
// Le stock d'un produit n'est réellement modifié QUE s'il existe un StockAdjustment rattaché à sa
// ligne de comptage (créé par completeInventoryCount) — c'est la source de vérité de "ce qui a été
// appliqué", pas la seule comparaison compté/système : une ligne dont le stock avait bougé depuis
// son comptage est ignorée à la clôture (cf. staleProducts) et n'a donc aucun ajustement.

export type InventoryLineStatus =
  | "MODIFIED" // écart appliqué : le stock du produit a été modifié
  | "NOT_APPLIED" // écart constaté mais NON appliqué (stock modifié entre-temps, à recompter)
  | "CONFORM" // compté = stock système
  | "NOT_COUNTED"; // jamais compté

export interface InventoryReportLineInput {
  id: string;
  pharmacyItemId: string;
  systemQuantity: number;
  countedQuantity: number | null;
  pharmacyItem?: { name?: string | null; dosage?: string | null; category?: string | null } | null;
}

export interface InventoryReportAdjustmentInput {
  inventoryCountLineId?: string | null;
  quantityDelta: number;
  valuationAmount?: number | null;
}

export interface InventoryReportRow {
  lineId: string;
  pharmacyItemId: string;
  name: string;
  dosage: string | null;
  category: string | null;
  systemQuantity: number;
  countedQuantity: number | null;
  // Stock réellement appliqué : avant = ce que le système disait au moment du comptage, après = la
  // quantité comptée. Nuls hors statut MODIFIED.
  stockBefore: number | null;
  stockAfter: number | null;
  // Écart appliqué (MODIFIED) ou simplement constaté (NOT_APPLIED) ; nul sinon.
  delta: number | null;
  // Valeur de la perte (au coût réel des lots) ou du surplus (au coût moyen). MODIFIED seulement.
  valuation: number | null;
  status: InventoryLineStatus;
}

export interface InventoryReportTotals {
  totalLines: number;
  countedLines: number;
  notCounted: number;
  conform: number;
  modified: number;
  notApplied: number;
  lossUnits: number;
  lossValue: number;
  surplusUnits: number;
  surplusValue: number;
}

export interface InventoryReport {
  rows: InventoryReportRow[];
  modified: InventoryReportRow[];
  notApplied: InventoryReportRow[];
  totals: InventoryReportTotals;
}

const byName = (a: InventoryReportRow, b: InventoryReportRow) =>
  a.name.localeCompare(b.name, "fr", { sensitivity: "base" });

export function buildInventoryReport(
  lines: InventoryReportLineInput[],
  adjustments: InventoryReportAdjustmentInput[]
): InventoryReport {
  // Un seul ajustement par ligne en pratique ; on additionne par sécurité si plusieurs existaient.
  const adjustmentByLine = new Map<string, { delta: number; valuation: number }>();
  for (const adj of adjustments) {
    if (!adj.inventoryCountLineId) continue;
    const acc = adjustmentByLine.get(adj.inventoryCountLineId) ?? { delta: 0, valuation: 0 };
    acc.delta += adj.quantityDelta;
    acc.valuation += adj.valuationAmount ?? 0;
    adjustmentByLine.set(adj.inventoryCountLineId, acc);
  }

  const totals: InventoryReportTotals = {
    totalLines: lines.length,
    countedLines: 0,
    notCounted: 0,
    conform: 0,
    modified: 0,
    notApplied: 0,
    lossUnits: 0,
    lossValue: 0,
    surplusUnits: 0,
    surplusValue: 0,
  };

  const rows: InventoryReportRow[] = lines.map((line) => {
    const base = {
      lineId: line.id,
      pharmacyItemId: line.pharmacyItemId,
      name: line.pharmacyItem?.name || "Produit supprimé",
      dosage: line.pharmacyItem?.dosage ?? null,
      category: line.pharmacyItem?.category ?? null,
      systemQuantity: line.systemQuantity,
      countedQuantity: line.countedQuantity,
    };

    if (line.countedQuantity === null) {
      totals.notCounted++;
      return { ...base, stockBefore: null, stockAfter: null, delta: null, valuation: null, status: "NOT_COUNTED" as const };
    }
    totals.countedLines++;

    const adjustment = adjustmentByLine.get(line.id);
    if (adjustment) {
      totals.modified++;
      if (adjustment.delta < 0) {
        totals.lossUnits += -adjustment.delta;
        totals.lossValue += adjustment.valuation;
      } else {
        totals.surplusUnits += adjustment.delta;
        totals.surplusValue += adjustment.valuation;
      }
      return {
        ...base,
        stockBefore: line.systemQuantity,
        stockAfter: line.countedQuantity,
        delta: adjustment.delta,
        valuation: adjustment.valuation,
        status: "MODIFIED" as const,
      };
    }

    if (line.countedQuantity === line.systemQuantity) {
      totals.conform++;
      return { ...base, stockBefore: null, stockAfter: null, delta: null, valuation: null, status: "CONFORM" as const };
    }

    totals.notApplied++;
    return {
      ...base,
      stockBefore: null,
      stockAfter: null,
      delta: line.countedQuantity - line.systemQuantity,
      valuation: null,
      status: "NOT_APPLIED" as const,
    };
  });

  rows.sort(byName);
  return {
    rows,
    modified: rows.filter((r) => r.status === "MODIFIED"),
    notApplied: rows.filter((r) => r.status === "NOT_APPLIED"),
    totals,
  };
}
