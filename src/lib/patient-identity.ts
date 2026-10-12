// Identité administrative du patient — fonctions pures, utilisables côté serveur comme dans le
// navigateur (tableaux, PDF, exports).

// IPP — Identifiant Permanent du Patient : IPP-<année>-<compteur sur 6 chiffres>, compteur global
// (toutes cliniques confondues) remis à 1 chaque année. Au-delà de 999 999 dans l'année, le
// compteur s'allonge simplement (jamais tronqué).
export function formatIpp(year: number, sequence: number): string {
  return `IPP-${year}-${String(sequence).padStart(6, "0")}`;
}

// Un patient sans e-mail n'a pas de compte de connexion, mais le modèle User exige un e-mail
// unique (index MongoDB : plusieurs valeurs absentes seraient vues comme des doublons). On lui
// attribue donc une adresse technique dérivée de son IPP, sur un domaine réservé qui ne reçoit
// jamais de courrier, et qu'on n'affiche jamais.
export const TECHNICAL_PATIENT_EMAIL_DOMAIN = "patients.meddoc.local";

export function technicalPatientEmail(ipp: string): string {
  return `${ipp.toLowerCase()}@${TECHNICAL_PATIENT_EMAIL_DOMAIN}`;
}

export function isTechnicalPatientEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${TECHNICAL_PATIENT_EMAIL_DOMAIN}`);
}

// E-mail à afficher pour un patient : vide pour une adresse technique.
export function displayPatientEmail(email: string | null | undefined): string {
  return email && !isTechnicalPatientEmail(email) ? email : "";
}
