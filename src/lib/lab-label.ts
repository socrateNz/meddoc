// Étiquette de prélèvement (tube) — fonctions pures partagées par l'écran de la demande d'analyse
// et le PDF d'étiquette (cf. src/components/pdf/lab-tube-label-pdf.tsx).

// Référence d'une demande d'analyse, encodée dans le code-barres du tube et reprise sur le
// compte-rendu (même numéro que lab-report-pdf) : un scan du tube retrouve la demande.
export function labOrderReference(orderId: string): string {
  return `LAB-${String(orderId).slice(-8).toUpperCase()}`;
}

export const SAMPLE_TYPE_LABELS: Record<string, string> = {
  BLOOD: "Sang",
  URINE: "Urine",
  STOOL: "Selles",
  SALIVA: "Salive",
  BIOPSY: "Biopsie",
  CSF: "Liquide céphalorachidien",
  OTHER: "Autre",
};

// Nombre d'étiquettes imprimables d'un coup (une par tube) : borné pour éviter un PDF démesuré
// sur une faute de frappe.
export const MAX_TUBE_LABELS = 20;

export interface TubeLabelData {
  reference: string;
  patientName: string;
  ipp: string | null;
  birthDate: string | null;
  sex: string | null;
  sampleType: string;
  tests: string;
  collectedAt: string | null;
  priority: "URGENT" | "ROUTINE";
}

const formatDate = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
const formatDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export function buildTubeLabelData(order: {
  id: string;
  tests?: string[] | null;
  sampleType?: string | null;
  sampleCollectedAt?: string | Date | null;
  priority?: string | null;
  patient?: {
    ipp?: string | null;
    dateOfBirth?: string | Date | null;
    sex?: string | null;
    user?: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
}): TubeLabelData {
  const user = order.patient?.user;
  const patientName = [user?.lastName?.toUpperCase(), user?.firstName].filter(Boolean).join(" ") || "Patient non identifié";
  return {
    reference: labOrderReference(order.id),
    patientName,
    ipp: order.patient?.ipp || null,
    birthDate: order.patient?.dateOfBirth ? formatDate(order.patient.dateOfBirth) : null,
    sex: order.patient?.sex || null,
    sampleType: (order.sampleType && SAMPLE_TYPE_LABELS[order.sampleType]) || order.sampleType || "Échantillon",
    tests: (order.tests || []).join(", "),
    collectedAt: order.sampleCollectedAt ? formatDateTime(order.sampleCollectedAt) : null,
    priority: order.priority === "URGENT" ? "URGENT" : "ROUTINE",
  };
}
