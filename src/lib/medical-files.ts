// Fichiers médicaux (documents scannés, clichés d'imagerie) — règles pures partagées par le
// serveur, l'interface d'envoi et les tests.

export const MEDICAL_FILE_CATEGORIES = ["SCANNED_DOCUMENT", "RADIOLOGY_IMAGE"] as const;
export type MedicalFileCategory = (typeof MEDICAL_FILE_CATEGORIES)[number];

export const ALLOWED_FILE_FORMATS = ["pdf", "jpg", "jpeg", "png"] as const;
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Durée de validité d'un lien de consultation délivré par /api/files/[id].
export const FILE_LINK_TTL_SECONDS = 300;

// Dossier Cloudinary d'un patient : un fichier n'est rattachable à un patient que s'il a été
// envoyé dans SON dossier (dont la signature d'envoi fixe l'identifiant) — impossible d'attacher le
// fichier d'un autre patient ou d'un autre établissement en devinant son identifiant.
export function patientFileFolder(organizationId: string, patientId: string): string {
  return `meddoc/${organizationId}/${patientId}`;
}

export function belongsToPatientFolder(publicId: string, organizationId: string, patientId: string): boolean {
  const prefix = `${patientFileFolder(organizationId, patientId)}/`;
  return publicId.startsWith(prefix) && !publicId.slice(prefix.length).includes("/") && publicId.length > prefix.length;
}

export function isAllowedFormat(format: string | null | undefined): boolean {
  return !!format && (ALLOWED_FILE_FORMATS as readonly string[]).includes(format.toLowerCase());
}

// Contrôle côté navigateur avant l'envoi (revérifié côté serveur une fois le fichier reçu).
export function validateFileBeforeUpload(file: { type: string; size: number }): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return "Format non accepté : PDF, JPEG ou PNG uniquement.";
  if (file.size > MAX_FILE_BYTES) return "Fichier trop volumineux : 20 Mo maximum.";
  if (file.size === 0) return "Fichier vide.";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
