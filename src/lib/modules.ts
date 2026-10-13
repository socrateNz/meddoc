// Modules activables à la licence (cf. Audit/ANALYSE_MODULES_LICENCE.md) — registre unique, pur
// (utilisable côté serveur comme navigateur) : menu, gardes des pages et des actions, écran du
// SUPER_ADMIN et tests le lisent tous ici.
//
// Les modules sont portés par la HOLDING (Organization.disabledModules : la liste des modules
// DÉSACTIVÉS) et valent pour toutes ses cliniques. Une liste vide = tous les modules : c'est l'état
// de toute holding existante, aucune migration n'est donc nécessaire. Le socle (patients, dossier,
// rendez-vous, ordonnances, caisse, finance, équipe, messagerie, audit) n'est jamais désactivable.

export const MODULE_KEYS = [
  "ACCUEIL",
  "URGENCES",
  "HOSPITALISATION",
  "LABORATOIRE",
  "IMAGERIE",
  "BLOC",
  "BANQUE_SANG",
  "PHARMACIE",
  "MATERNITE",
  "IA",
  "CONTRATS_AIDANTS",
  "INTEROPERABILITE",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  // Modules requis : activer celui-ci les active, désactiver l'un d'eux désactive celui-ci.
  requires: ModuleKey[];
  // Segments de route du tableau de bord appartenant au module (/dashboard/[clinics/<id>/]<segment>).
  routeSegments: string[];
}

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  ACCUEIL: { key: "ACCUEIL", label: "Accueil & file d'attente", description: "Tickets de passage du jour et file d'attente par service.", requires: [], routeSegments: ["accueil"] },
  URGENCES: { key: "URGENCES", label: "Urgences", description: "Tableau des urgences et tri CIMU à 5 niveaux.", requires: ["ACCUEIL"], routeSegments: ["urgences"] },
  HOSPITALISATION: {
    key: "HOSPITALISATION",
    label: "Hospitalisation",
    description: "Chambres et lits, séjours et nuitées, sortie, ronde médicale.",
    requires: [],
    routeSegments: ["rooms", "ronde"],
  },
  LABORATOIRE: { key: "LABORATOIRE", label: "Laboratoire", description: "Demandes d'analyses, prélèvements, résultats et validation, catalogue.", requires: [], routeSegments: ["lab"] },
  IMAGERIE: { key: "IMAGERIE", label: "Imagerie médicale", description: "Prescriptions, clichés et comptes-rendus d'imagerie.", requires: [], routeSegments: ["imagerie"] },
  BLOC: { key: "BLOC", label: "Bloc opératoire", description: "Salles, programme opératoire, check-list de sécurité, compte-rendu.", requires: [], routeSegments: ["bloc"] },
  BANQUE_SANG: { key: "BANQUE_SANG", label: "Banque de sang", description: "Stock de produits sanguins, transfusions, hémovigilance.", requires: [], routeSegments: ["banque-sang"] },
  PHARMACIE: {
    key: "PHARMACIE",
    label: "Pharmacie & stock",
    description: "Remise des médicaments, stock et inventaires, fournisseurs, bons de commande.",
    requires: [],
    routeSegments: ["pharmacie"],
  },
  MATERNITE: { key: "MATERNITE", label: "Maternité", description: "Grossesses, consultations prénatales, accouchements, nouveau-nés.", requires: [], routeSegments: [] },
  IA: { key: "IA", label: "Intelligence artificielle", description: "Assistant clinique et analyses IA (dossier, résultats, consultation).", requires: [], routeSegments: ["ai-assistant"] },
  CONTRATS_AIDANTS: { key: "CONTRATS_AIDANTS", label: "Contrats aidants", description: "Contrats et suivi des aidants à domicile.", requires: [], routeSegments: ["contracts"] },
  INTEROPERABILITE: { key: "INTEROPERABILITE", label: "Interopérabilité HL7 / FHIR", description: "Clés d'API, automates de laboratoire (HL7), export FHIR.", requires: [], routeSegments: [] },
};

// Préréglages des plans de licence : modules ACTIVÉS par chaque plan (le SUPER_ADMIN peut ensuite
// ajuster holding par holding).
export const PLAN_MODULES: Record<string, ModuleKey[]> = {
  TRIAL: [...MODULE_KEYS],
  BASIC: ["ACCUEIL", "PHARMACIE"],
  PREMIUM: ["ACCUEIL", "PHARMACIE", "LABORATOIRE", "HOSPITALISATION", "MATERNITE", "URGENCES"],
  ENTERPRISE: [...MODULE_KEYS],
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

// Modules actifs à partir de la liste stockée des modules désactivés (valeurs inconnues ignorées).
// Un module dont un prérequis est désactivé est lui-même inactif.
export function enabledModulesFrom(disabled: readonly string[] | null | undefined): ModuleKey[] {
  const off = new Set((disabled ?? []).filter(isModuleKey));
  const isOn = (key: ModuleKey): boolean => !off.has(key) && MODULES[key].requires.every(isOn);
  return MODULE_KEYS.filter(isOn);
}

// Complète une sélection avec ses prérequis (activer URGENCES active ACCUEIL).
export function withRequirements(selected: readonly ModuleKey[]): ModuleKey[] {
  const result = new Set<ModuleKey>();
  const add = (key: ModuleKey) => {
    if (result.has(key)) return;
    result.add(key);
    MODULES[key].requires.forEach(add);
  };
  selected.forEach(add);
  return MODULE_KEYS.filter((k) => result.has(k));
}

// Liste à stocker (modules désactivés) pour une sélection de modules actifs.
export function disabledModulesFor(enabled: readonly ModuleKey[]): ModuleKey[] {
  const on = new Set(withRequirements(enabled));
  return MODULE_KEYS.filter((k) => !on.has(k));
}

// Module propriétaire d'un chemin du tableau de bord, ou null pour le socle.
export function moduleForPath(pathname: string): ModuleKey | null {
  const segment = /^\/dashboard\/(?:clinics\/[^/]+\/)?([^/]+)/.exec(pathname)?.[1];
  if (!segment) return null;
  return MODULE_KEYS.find((k) => MODULES[k].routeSegments.includes(segment)) ?? null;
}

// Destinations de l'accueil rattachées à un module (les autres relèvent du socle).
export const VISIT_DESTINATION_MODULE: Record<string, ModuleKey | undefined> = {
  EMERGENCY: "URGENCES",
  LAB: "LABORATOIRE",
  PHARMACY: "PHARMACIE",
};

export const MODULE_DISABLED_MESSAGE = (key: ModuleKey) => `Le module « ${MODULES[key].label} » n'est pas inclus dans la licence de cet établissement.`;
