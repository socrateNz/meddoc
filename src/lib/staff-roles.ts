import { SECTION_PERMISSIONS, canAccessSection, rolesWith } from "./permissions-catalog";

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

// Accès par section : défini par les permissions (src/lib/permissions-catalog.ts, SECTION_PERMISSIONS).
// SECTION_ROLES (rôles qui ont chaque section par défaut) reste exporté pour les écrans qui listent
// des rôles.
export const SECTION_ROLES: Record<string, string[]> = Object.fromEntries(
  Object.entries(SECTION_PERMISSIONS).map(([section, permission]) => [section, [...rolesWith(permission)]])
);

export { canAccessSection };
