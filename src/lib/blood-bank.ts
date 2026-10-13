// Banque de sang / hémovigilance (étape E2 de l'audit d'évolution) — règles pures partagées par
// les actions, les écrans et les tests. Les règles de compatibilité sont les règles ABO/RhD
// classiques ; elles ne remplacent ni le cross-match ni le contrôle ultime au lit du patient.

export const BLOOD_PRODUCTS = ["RBC", "PLASMA", "PLATELETS", "WHOLE_BLOOD"] as const;
export type BloodProduct = (typeof BLOOD_PRODUCTS)[number];
export const BLOOD_PRODUCT_LABELS: Record<BloodProduct, string> = {
  RBC: "Concentré de globules rouges (CGR)",
  PLASMA: "Plasma frais congelé (PFC)",
  PLATELETS: "Concentré plaquettaire",
  WHOLE_BLOOD: "Sang total",
};
export const BLOOD_PRODUCT_SHORT: Record<BloodProduct, string> = { RBC: "CGR", PLASMA: "PFC", PLATELETS: "Plaquettes", WHOLE_BLOOD: "Sang total" };

export const ABO_GROUPS = ["O", "A", "B", "AB"] as const;
export type AboGroup = (typeof ABO_GROUPS)[number];
export const RHESUS = ["POS", "NEG"] as const;
export type Rhesus = (typeof RHESUS)[number];

export interface BloodGroup {
  abo: AboGroup;
  rh: Rhesus;
}

export function formatBloodGroup(g: { abo: string; rh: string }): string {
  return `${g.abo}${g.rh === "NEG" ? "-" : "+"}`;
}

// « O+ », « AB- », « a pos »... → groupe, ou null si illisible.
export function parseBloodType(value: string | null | undefined): BloodGroup | null {
  const m = /^\s*(AB|A|B|O)\s*(\+|-|POS|NEG)\s*$/i.exec(value ?? "");
  if (!m) return null;
  const sign = m[2].toUpperCase();
  return { abo: m[1].toUpperCase() as AboGroup, rh: sign === "+" || sign === "POS" ? "POS" : "NEG" };
}

// Groupes ABO donneurs acceptables, selon ce que le produit apporte : des globules rouges
// (antigènes du donneur face aux anticorps du receveur) ou du plasma (anticorps du donneur face
// aux globules du receveur).
const RED_CELL_DONORS: Record<AboGroup, AboGroup[]> = { O: ["O"], A: ["A", "O"], B: ["B", "O"], AB: ["AB", "A", "B", "O"] };
const PLASMA_DONORS: Record<AboGroup, AboGroup[]> = { O: ["O", "A", "B", "AB"], A: ["A", "AB"], B: ["B", "AB"], AB: ["AB"] };

export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
  warning?: string;
}

export function checkCompatibility(product: BloodProduct, donor: BloodGroup, recipient: BloodGroup): CompatibilityResult {
  const rhIssue = recipient.rh === "NEG" && donor.rh === "POS";
  if (product === "RBC" || product === "WHOLE_BLOOD") {
    const aboOk = product === "WHOLE_BLOOD" ? donor.abo === recipient.abo : RED_CELL_DONORS[recipient.abo].includes(donor.abo);
    if (!aboOk) return { compatible: false, reason: `Incompatibilité ABO : poche ${donor.abo} pour un patient ${recipient.abo}.` };
    if (rhIssue) return { compatible: false, reason: "Incompatibilité RhD : poche RhD+ pour un patient RhD-." };
    return { compatible: true };
  }
  if (product === "PLASMA") {
    if (!PLASMA_DONORS[recipient.abo].includes(donor.abo)) return { compatible: false, reason: `Plasma ${donor.abo} incompatible avec un patient ${recipient.abo}.` };
    return { compatible: true };
  }
  // Plaquettes : l'ABO et le RhD sont préférés mais pas bloquants (avis médical).
  const warnings: string[] = [];
  if (!PLASMA_DONORS[recipient.abo].includes(donor.abo)) warnings.push("plasma ABO non compatible");
  if (rhIssue) warnings.push("RhD+ chez un patient RhD- (prévention anti-D à discuter)");
  return { compatible: true, warning: warnings.length ? `Plaquettes : ${warnings.join(", ")}.` : undefined };
}

// Le cross-match (épreuve directe de compatibilité) est exigé pour les produits contenant des
// globules rouges.
export function requiresCrossmatch(product: string): boolean {
  return product === "RBC" || product === "WHOLE_BLOOD";
}

export const EXPIRY_WARNING_DAYS = 3;

export function isExpired(expiresAt: Date | string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function expiresSoon(expiresAt: Date | string, now: Date = new Date()): boolean {
  const t = new Date(expiresAt).getTime();
  return t > now.getTime() && t - now.getTime() <= EXPIRY_WARNING_DAYS * 24 * 3600 * 1000;
}

export const UNIT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Réservée",
  TRANSFUSED: "Transfusée",
  DISCARDED: "Détruite",
};

export const DISCARD_REASONS = ["EXPIRED", "DAMAGED", "TEMPERATURE", "OTHER"] as const;
export const DISCARD_REASON_LABELS: Record<(typeof DISCARD_REASONS)[number], string> = {
  EXPIRED: "Périmée",
  DAMAGED: "Poche endommagée",
  TEMPERATURE: "Rupture de la chaîne du froid",
  OTHER: "Autre",
};

export const TRANSFUSION_STATUS_LABELS: Record<string, string> = {
  RESERVED: "Poche réservée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

export type TransfusionAction = "START" | "COMPLETE" | "CANCEL";
const TRANSITIONS: Record<TransfusionAction, { from: string; to: string }> = {
  START: { from: "RESERVED", to: "IN_PROGRESS" },
  COMPLETE: { from: "IN_PROGRESS", to: "COMPLETED" },
  CANCEL: { from: "RESERVED", to: "CANCELLED" },
};

export function nextTransfusionStatus(current: string, action: TransfusionAction): string | null {
  return TRANSITIONS[action].from === current ? TRANSITIONS[action].to : null;
}

// Contrôle ultime au lit du patient, juste avant la pose : tous les points sont obligatoires
// (la carte de contrôle ABO seulement pour les produits contenant des globules rouges).
export function bedsideChecks(product: string): { key: string; label: string }[] {
  return [
    { key: "identity", label: "Identité du patient vérifiée (interrogatoire + bracelet) et concordante avec la prescription" },
    { key: "unit", label: "Numéro, groupe et produit de la poche concordants avec la réservation" },
    { key: "expiry", label: "Date de péremption et aspect de la poche vérifiés" },
    ...(requiresCrossmatch(product) ? [{ key: "abo_card", label: "Contrôle ultime ABO au lit (carte) concordant patient / poche" }] : []),
    { key: "vitals", label: "Constantes de départ relevées, voie veineuse dédiée en place" },
  ];
}

export const TRANSFUSION_REACTIONS = ["NONE", "FEVER", "ALLERGIC", "HEMOLYTIC", "TRALI", "TACO", "OTHER"] as const;
export type TransfusionReaction = (typeof TRANSFUSION_REACTIONS)[number];
export const REACTION_LABELS: Record<TransfusionReaction, string> = {
  NONE: "Aucun effet indésirable",
  FEVER: "Réaction fébrile non hémolytique",
  ALLERGIC: "Réaction allergique",
  HEMOLYTIC: "Réaction hémolytique",
  TRALI: "Œdème pulmonaire lésionnel (TRALI)",
  TACO: "Surcharge volémique (TACO)",
  OTHER: "Autre effet indésirable",
};
// Effets graves : incident « critique » déclaré automatiquement (les autres : « élevé »).
export const SEVERE_REACTIONS: TransfusionReaction[] = ["HEMOLYTIC", "TRALI", "TACO"];
