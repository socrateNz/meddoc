// Libellés de la consultation prénatale (CPN), partagés par le formulaire de visite et le suivi
// de maternité (cf. PrenatalVisit dans schema.prisma, src/validators/maternity.ts).

export const URINE_DIPSTICK_OPTIONS = [
  { value: "NEG", label: "Négatif" },
  { value: "TRACES", label: "Traces" },
  { value: "+", label: "+" },
  { value: "++", label: "++" },
  { value: "+++", label: "+++" },
] as const;

export const FETAL_PRESENTATION_LABELS: Record<string, string> = {
  CEPHALIC: "Céphalique",
  BREECH: "Siège",
  TRANSVERSE: "Transverse",
};

export const PREVENTIVE_TREATMENT_LABELS: Record<string, string> = {
  IPTP_SP: "TPI / SP (paludisme)",
  TT_VACCINE: "VAT (antitétanique)",
  IRON_FOLIC: "Fer + acide folique",
  DEWORMING: "Déparasitage",
  LLIN: "Moustiquaire imprégnée",
};

// Examens du bilan prénatal habituel : la demande d'examens depuis une visite propose de cocher
// d'un coup ceux du catalogue de la clinique dont le nom contient l'un de ces mots-clés.
export const PRENATAL_LAB_KEYWORDS = [
  "nfs",
  "groupe",
  "rhésus",
  "rhesus",
  "glycémie",
  "glycemie",
  "vih",
  "hiv",
  "syphilis",
  "tpha",
  "vdrl",
  "toxoplasm",
  "rubéole",
  "rubeole",
  "aghbs",
  "hépatite b",
  "hepatite b",
  "albumin",
  "sucre",
  "ecbu",
  "électrophorèse",
  "electrophorese",
];

export function isPrenatalLabTest(name: string): boolean {
  const n = name.toLowerCase();
  return PRENATAL_LAB_KEYWORDS.some((k) => n.includes(k));
}
