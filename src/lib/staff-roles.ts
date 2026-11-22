// Rôles du personnel d'une clinique et accès par section du tableau de bord — source unique, pure
// (sans accès base) : importée par src/middleware.ts (garde des routes), la barre latérale (menu)
// et l'équipe (formulaire, contrôles serveur). Avant, middleware et menu portaient chacun leur
// propre copie des listes et divergeaient.

// Rôles qu'un coordinateur recrute pour sa clinique (l'admin de holding peut en plus désigner un
// coordinateur).
export const CLINIC_STAFF_ROLES = ["MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE"] as const;
export type ClinicStaffRole = (typeof CLINIC_STAFF_ROLES)[number];

// Tous les rôles de personnel (listes d'équipe).
export const ALL_STAFF_ROLES = ["COORDINATOR", ...CLINIC_STAFF_ROLES, "ADMIN"] as const;

export const STAFF_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur (holding)",
  COORDINATOR: "Coordinateur",
  MEDECIN: "Médecin",
  CAREGIVER: "Infirmier(e) / Sage-femme",
  LABORANTIN: "Laborantin(e)",
  ACCUEIL: "Accueil",
  PHARMACIST: "Pharmacien(ne)",
  CASHIER: "Caissier(ère)",
  COMPTABLE: "Comptable",
};

export const STAFF_ROLE_DESCRIPTIONS: Record<string, string> = {
  COORDINATOR: "Dirige la clinique : équipe, réglages, supervision de tous les services.",
  MEDECIN: "Consultations, dossiers, prescriptions, demandes d'examens.",
  CAREGIVER: "Soins, constantes, ronde, prélèvements, maternité.",
  LABORANTIN: "Prélèvements et saisie des résultats du laboratoire.",
  ACCUEIL: "Enregistre les patients, crée les tickets, gère les rendez-vous. Aucun contenu médical.",
  PHARMACIST: "Remise des médicaments, stock, inventaires, fournisseurs.",
  CASHIER: "Encaissements et dépenses de la caisse.",
  COMPTABLE: "Finance et comptabilité. Aucun accès médical.",
};

export function isClinicStaffRole(role: string): role is ClinicStaffRole {
  return (CLINIC_STAFF_ROLES as readonly string[]).includes(role);
}

// Accès par section (/dashboard/[clinics/<id>/]<section>). Une section absente est ouverte à tout
// utilisateur connecté. L'ADMIN (holding) consulte en lecture seule : les pages et actions le
// limitent elles-mêmes.
export const SECTION_ROLES: Record<string, string[]> = {
  patients: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  // Accueil & file d'attente (cf. src/actions/visits.ts) : l'accueil enregistre ; chaque rôle y
  // traite aussi les tickets qui lui sont destinés (caisse, pharmacie, laboratoire).
  accueil: ["ADMIN", "COORDINATOR", "ACCUEIL", "MEDECIN", "CAREGIVER", "LABORANTIN", "CASHIER", "PHARMACIST"],
  team: ["ADMIN", "COORDINATOR"],
  incidents: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER"],
  lab: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN"],
  imagerie: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  maternite: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  urgences: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  bloc: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "banque-sang": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  rooms: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  // Ronde médicale : l'équipe qui visite les patients hospitalisés (cf. src/lib/rounds.ts ROUND_ROLES).
  ronde: ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  // Calendrier unifié : rendez-vous, gardes, échéances de stock (cf. src/actions/calendar.ts).
  appointments: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "ACCUEIL", "LABORANTIN", "PHARMACIST", "CASHIER"],
  "ai-assistant": ["ADMIN", "COORDINATOR", "MEDECIN"],
  medecin: ["MEDECIN"],
  // Caisse : le pharmacien n'y entre que si le coordinateur l'a autorisé (cf. register-access.ts,
  // vérifié par la page et par chaque action — le middleware ne lit pas la base).
  caisse: ["ADMIN", "COORDINATOR", "CASHIER", "PHARMACIST"],
  pharmacie: ["ADMIN", "COORDINATOR", "PHARMACIST"],
  finance: ["ADMIN", "COORDINATOR", "COMPTABLE"],
  comptabilite: ["ADMIN", "COORDINATOR", "COMPTABLE"],
  // Relevés des cliniques partenaires (montants dus) : direction et comptabilité.
  partenaires: ["ADMIN", "COORDINATOR", "COMPTABLE"],
  contracts: ["ADMIN", "COORDINATOR"],
  permissions: ["ADMIN"],
  "audit-log": ["ADMIN"],
  "contact-messages": ["SUPER_ADMIN"],
  holdings: ["SUPER_ADMIN"],
  messages: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE"],
  manual: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE", "FAMILY", "PATIENT"],
  notifications: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE"],
};

export function canAccessSection(role: string, section: string): boolean {
  const roles = SECTION_ROLES[section];
  return !roles || roles.includes(role);
}
