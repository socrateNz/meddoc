// Imagerie médicale — règles pures partagées par les actions, les écrans et les tests.

export const RADIOLOGY_MODALITIES = ["XRAY", "ULTRASOUND", "CT", "MRI", "ECG", "MAMMOGRAPHY", "OTHER"] as const;
export type RadiologyModality = (typeof RADIOLOGY_MODALITIES)[number];

export const RADIOLOGY_MODALITY_LABELS: Record<RadiologyModality, string> = {
  XRAY: "Radiographie",
  ULTRASOUND: "Échographie",
  CT: "Scanner",
  MRI: "IRM",
  ECG: "ECG",
  MAMMOGRAPHY: "Mammographie",
  OTHER: "Autre",
};

export const RADIOLOGY_STATUS_LABELS: Record<string, string> = {
  PRESCRIBED: "Prescrit",
  PERFORMED: "Réalisé",
  REPORTED: "Compte-rendu rédigé",
  VALIDATED: "Validé",
  CANCELLED: "Annulé",
};

export interface RadiologyExamSnapshot {
  examId: string;
  name: string;
  modality: string;
  price: number;
}

// Instantané des examens prescrits (tarif figé à la prescription) et lignes de facture
// correspondantes — les examens à 0 FCFA ne génèrent aucune ligne.
export function snapshotExams(exams: { id: string; name: string; modality: string; basePrice: number }[]) {
  const snapshot: RadiologyExamSnapshot[] = exams.map((e) => ({ examId: e.id, name: e.name, modality: e.modality, price: Math.max(0, e.basePrice || 0) }));
  const items = snapshot
    .filter((e) => e.price > 0)
    .map((e) => ({ type: "SERVICE" as const, description: `Imagerie : ${e.name}`, quantity: 1, unitPrice: e.price, amount: e.price }));
  return { snapshot, items };
}

export type RadiologyAction = "PERFORM" | "REPORT" | "VALIDATE" | "CANCEL";

// Transitions : réaliser un examen prescrit ; rédiger (ou corriger) le compte-rendu d'un examen
// réalisé tant qu'il n'est pas validé ; valider un compte-rendu rédigé ; annuler un examen tant
// qu'il n'a pas été réalisé.
const TRANSITIONS: Record<RadiologyAction, { from: string[]; to: string }> = {
  PERFORM: { from: ["PRESCRIBED"], to: "PERFORMED" },
  REPORT: { from: ["PERFORMED", "REPORTED"], to: "REPORTED" },
  VALIDATE: { from: ["REPORTED"], to: "VALIDATED" },
  CANCEL: { from: ["PRESCRIBED"], to: "CANCELLED" },
};

export function nextRadiologyStatus(current: string, action: RadiologyAction): string | null {
  const rule = TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

export function radiologyReference(orderId: string): string {
  return `IMG-${String(orderId).slice(-8).toUpperCase()}`;
}
