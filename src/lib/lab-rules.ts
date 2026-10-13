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
