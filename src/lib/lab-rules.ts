// Règles pures du laboratoire partagées par la saisie manuelle (src/actions/lab.ts) et l'import
// des résultats d'automates en HL7 (src/lib/hl7-import.ts).

// Valeur hors des seuils critiques de l'examen du catalogue (résultats numériques uniquement).
export function isCriticalValue(test: { criticalLow: number | null; criticalHigh: number | null } | null | undefined, value: string): boolean {
  if (!test) return false;
  const numeric = parseFloat(value);
  if (Number.isNaN(numeric)) return false;
  return (test.criticalLow != null && numeric < test.criticalLow) || (test.criticalHigh != null && numeric > test.criticalHigh);
}

// Statut d'une demande d'après ses résultats — n'avance jamais en arrière, ne touche ni une
// demande annulée ni une demande remise.
export function computeLabOrderStatus(order: {
  status: string;
  tests: string[];
  results: { testName: string; validatedAt: Date | string | null }[];
}): string {
  if (order.status === "CANCELLED" || order.status === "DELIVERED") return order.status;
  const allTestsHaveResult = order.tests.every((t) => order.results.some((r) => r.testName === t));
  const allTestsValidated = order.tests.every((t) => order.results.some((r) => r.testName === t && r.validatedAt));
  if (allTestsValidated && order.results.length > 0) return "VALIDATED";
  if (allTestsHaveResult) return "TO_VALIDATE";
  if (order.results.length > 0 && ["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB"].includes(order.status)) return "IN_ANALYSIS";
  return order.status;
}

// Prélèvements (tubes) d'une demande. Une ancienne demande (avant les prélèvements multiples) n'a
// pas de `samples` : son prélèvement unique (champs sample*) couvre alors tous les examens.
export interface LabSampleView {
  id: string;
  sampleType: string;
  tests: string[];
  quantity: string | null;
  condition: string | null;
  collectedAt: Date | string;
  collectedByName: string | null;
  receivedAt: Date | string | null;
}

export function orderSamples(order: {
  tests: string[];
  status?: string;
  samples?: Partial<LabSampleView>[] | null;
  sampleType?: string | null;
  sampleCollectedAt?: Date | string | null;
  sampleQuantity?: string | null;
  sampleCondition?: string | null;
  sampleCollectedBy?: { firstName?: string | null; lastName?: string | null } | null;
}): LabSampleView[] {
  if (order.samples && order.samples.length > 0) {
    return order.samples.map((s, i) => ({
      id: s.id || `sample-${i}`,
      sampleType: s.sampleType || "OTHER",
      tests: s.tests || [],
      quantity: s.quantity ?? null,
      condition: s.condition ?? null,
      collectedAt: s.collectedAt as Date | string,
      collectedByName: s.collectedByName ?? null,
      receivedAt: s.receivedAt ?? null,
    }));
  }
  if (!order.sampleCollectedAt) return [];
  const legacyReceived = order.status && !["PRESCRIBED", "SAMPLE_COLLECTED"].includes(order.status);
  return [
    {
      id: "legacy",
      sampleType: order.sampleType || "OTHER",
      tests: order.tests,
      quantity: order.sampleQuantity ?? null,
      condition: order.sampleCondition ?? null,
      collectedAt: order.sampleCollectedAt,
      collectedByName: [order.sampleCollectedBy?.firstName, order.sampleCollectedBy?.lastName].filter(Boolean).join(" ") || null,
      receivedAt: legacyReceived ? order.sampleCollectedAt : null,
    },
  ];
}

// Examens de la demande qui n'ont encore aucun prélèvement.
export function testsWithoutSample(order: Parameters<typeof orderSamples>[0]): string[] {
  const covered = new Set(orderSamples(order).flatMap((s) => s.tests));
  return order.tests.filter((t) => !covered.has(t));
}
