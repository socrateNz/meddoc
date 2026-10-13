// Bloc opératoire (étape E1 de l'audit d'évolution) — règles pures partagées par les actions, les
// écrans et les tests.

export const ANESTHESIA_TYPES = ["GENERAL", "LOCOREGIONAL", "LOCAL", "SEDATION"] as const;
export type AnesthesiaType = (typeof ANESTHESIA_TYPES)[number];
export const ANESTHESIA_LABELS: Record<AnesthesiaType, string> = {
  GENERAL: "Anesthésie générale",
  LOCOREGIONAL: "Locorégionale",
  LOCAL: "Locale",
  SEDATION: "Sédation",
};

export const LATERALITIES = ["NA", "LEFT", "RIGHT", "BILATERAL"] as const;
export type Laterality = (typeof LATERALITIES)[number];
export const LATERALITY_LABELS: Record<Laterality, string> = {
  NA: "Sans objet",
  LEFT: "Gauche",
  RIGHT: "Droit(e)",
  BILATERAL: "Bilatéral",
};

export const SURGERY_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Programmée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

// Durées admises pour une intervention programmée (minutes).
export const MIN_SURGERY_MINUTES = 10;
export const MAX_SURGERY_MINUTES = 24 * 60;

// Check-list « Sécurité du patient au bloc opératoire » (OMS), en 3 temps. Chaque point doit être
// confirmé (« Oui ») ou, quand c'est prévu, déclaré « Non applicable » : un point non confirmable
// bloque l'étape — c'est le principe même de la check-list.
export const CHECKLIST_PHASES = ["SIGN_IN", "TIME_OUT", "SIGN_OUT"] as const;
export type ChecklistPhase = (typeof CHECKLIST_PHASES)[number];

export interface ChecklistItem {
  key: string;
  label: string;
  naAllowed?: boolean;
}

export const CHECKLIST: Record<ChecklistPhase, { label: string; moment: string; items: ChecklistItem[] }> = {
  SIGN_IN: {
    label: "Avant l'induction anesthésique",
    moment: "Temps de pause avant anesthésie",
    items: [
      { key: "identity", label: "Identité du patient confirmée (nom, prénom, date de naissance)" },
      { key: "procedure_site", label: "Intervention et site opératoire confirmés" },
      { key: "site_marked", label: "Site opératoire marqué", naAllowed: true },
      { key: "consent", label: "Consentement éclairé signé" },
      { key: "anesthesia_check", label: "Matériel et médicaments d'anesthésie vérifiés" },
      { key: "oximeter", label: "Oxymètre de pouls en place et fonctionnel" },
      { key: "allergies", label: "Allergies du patient vérifiées" },
      { key: "airway", label: "Risque d'intubation difficile / d'inhalation évalué, matériel disponible" },
      { key: "blood", label: "Risque hémorragique évalué ; produits sanguins disponibles si nécessaire", naAllowed: true },
    ],
  },
  TIME_OUT: {
    label: "Avant l'incision",
    moment: "Temps de pause avant incision",
    items: [
      { key: "team", label: "Tous les membres de l'équipe se sont présentés (nom, fonction)" },
      { key: "confirm", label: "Patient, site et intervention confirmés à voix haute par l'équipe" },
      { key: "critical_events", label: "Étapes critiques, durée et pertes sanguines prévues annoncées" },
      { key: "sterility", label: "Stérilité du matériel confirmée, pas de problème d'équipement" },
      { key: "antibiotics", label: "Antibioprophylaxie administrée dans les 60 dernières minutes", naAllowed: true },
      { key: "imaging", label: "Imagerie essentielle disponible en salle", naAllowed: true },
    ],
  },
  SIGN_OUT: {
    label: "Avant la sortie de salle",
    moment: "Temps de pause avant sortie",
    items: [
      { key: "procedure_recorded", label: "Intervention réalisée enregistrée" },
      { key: "counts", label: "Décompte des compresses, aiguilles et instruments correct", naAllowed: true },
      { key: "specimens", label: "Pièces opératoires étiquetées", naAllowed: true },
      { key: "equipment", label: "Dysfonctionnements de matériel signalés", naAllowed: true },
      { key: "recovery", label: "Prescriptions et surveillance post-opératoires transmises" },
    ],
  },
};

export type ChecklistAnswer = "YES" | "NA";
export interface ChecklistPhaseRecord {
  answers: Record<string, ChecklistAnswer>;
  notes: string | null;
  checkedById: string;
  checkedAt: string;
}
export type ChecklistRecord = Partial<Record<ChecklistPhase, ChecklistPhaseRecord>>;

export function readChecklist(value: unknown): ChecklistRecord {
  return value && typeof value === "object" ? (value as ChecklistRecord) : {};
}

// Réponses complètes et cohérentes pour une étape : chaque point « Oui », ou « Non applicable »
// quand c'est permis. Renvoie le message d'erreur, ou null.
export function validatePhaseAnswers(phase: ChecklistPhase, answers: Record<string, string>): string | null {
  for (const item of CHECKLIST[phase].items) {
    const a = answers[item.key];
    if (a === "YES") continue;
    if (a === "NA" && item.naAllowed) continue;
    return `Point non confirmé : « ${item.label} ».`;
  }
  const known = new Set(CHECKLIST[phase].items.map((i) => i.key));
  if (Object.keys(answers).some((k) => !known.has(k))) return "Réponse inconnue dans la check-list.";
  return null;
}

// Ordre imposé : avant l'induction puis avant l'incision tant que l'intervention n'a pas commencé ;
// avant la sortie de salle pendant l'intervention. Une étape signée ne se resigne pas.
export function phaseBlocker(phase: ChecklistPhase, status: string, checklist: ChecklistRecord): string | null {
  if (checklist[phase]) return "Cette étape de la check-list est déjà signée.";
  if (phase === "SIGN_IN" && status !== "SCHEDULED") return "L'étape « avant induction » se signe avant le début de l'intervention.";
  if (phase === "TIME_OUT") {
    if (status !== "SCHEDULED") return "L'étape « avant incision » se signe avant le début de l'intervention.";
    if (!checklist.SIGN_IN) return "Signez d'abord l'étape « avant induction ».";
  }
  if (phase === "SIGN_OUT" && status !== "IN_PROGRESS") return "L'étape « avant sortie de salle » se signe pendant l'intervention.";
  return null;
}

export type SurgeryAction = "START" | "COMPLETE" | "CANCEL";

const TRANSITIONS: Record<SurgeryAction, { from: string; to: string }> = {
  START: { from: "SCHEDULED", to: "IN_PROGRESS" },
  COMPLETE: { from: "IN_PROGRESS", to: "COMPLETED" },
  CANCEL: { from: "SCHEDULED", to: "CANCELLED" },
};

// Transition demandée, ou message expliquant pourquoi elle est refusée.
export function surgeryTransition(status: string, action: SurgeryAction, checklist: ChecklistRecord): { next: string } | { error: string } {
  const rule = TRANSITIONS[action];
  if (status !== rule.from) return { error: "Action impossible dans l'état actuel de l'intervention. Rechargez la page." };
  if (action === "START" && (!checklist.SIGN_IN || !checklist.TIME_OUT)) {
    return { error: "Check-list incomplète : signez les étapes « avant induction » et « avant incision » avant de commencer." };
  }
  if (action === "COMPLETE" && !checklist.SIGN_OUT) return { error: "Check-list incomplète : signez l'étape « avant sortie de salle »." };
  return { next: rule.to };
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

// Statuts qui occupent une salle et une équipe.
export const BLOCKING_SURGERY_STATUSES = ["SCHEDULED", "IN_PROGRESS"];

export function surgeryReference(caseId: string): string {
  return `BLOC-${String(caseId).slice(-8).toUpperCase()}`;
}
