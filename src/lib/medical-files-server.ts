import { randomBytes } from "node:crypto";
import cloudinary from "@/lib/cloudinary";
import { ALLOWED_FILE_FORMATS, FILE_LINK_TTL_SECONDS, patientFileFolder } from "@/lib/medical-files";

// Opérations Cloudinary des fichiers médicaux — serveur uniquement (le secret d'API ne quitte
// jamais le serveur). Tous les fichiers sont en type « authenticated » : aucune URL publique.
const DELIVERY_TYPE = "authenticated";

function credentials() {
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error("Stockage de fichiers non configuré (CLOUDINARY_URL manquant).");
  }
  return { cloudName: cloud_name, apiKey: api_key, apiSecret: api_secret };
}

// Paramètres signés d'un envoi direct navigateur → Cloudinary (contourne la limite de taille des
// requêtes Vercel). L'identifiant est imposé par le serveur, dans le dossier du patient : le
// navigateur ne peut ni le choisir, ni changer le type de livraison ou les formats autorisés sans
// invalider la signature.
export function signPatientUpload(organizationId: string, patientId: string) {
  const { cloudName, apiKey, apiSecret } = credentials();
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: `${patientFileFolder(organizationId, patientId)}/${randomBytes(12).toString("hex")}`,
    type: DELIVERY_TYPE,
    allowed_formats: ALLOWED_FILE_FORMATS.join(","),
  };
  const signature = cloudinary.utils.api_sign_request(params, apiSecret);
  return { cloudName, apiKey, signature, ...params };
}

// Lecture du fichier réellement reçu par Cloudinary (taille, format) — on ne se fie jamais aux
// métadonnées déclarées par le navigateur.
export async function fetchUploadedResource(publicId: string, resourceType: string) {
  try {
    const res = await cloudinary.api.resource(publicId, { type: DELIVERY_TYPE, resource_type: resourceType });
    return { format: String(res.format || ""), bytes: Number(res.bytes || 0), resourceType: String(res.resource_type || resourceType) };
  } catch {
    return null;
  }
}

export async function destroyUploadedResource(publicId: string, resourceType: string) {
  await cloudinary.uploader.destroy(publicId, { type: DELIVERY_TYPE, resource_type: resourceType, invalidate: true }).catch(() => undefined);
}

// Lien de consultation à durée limitée (quelques minutes), délivré après contrôle d'accès.
export function temporaryFileLink(file: { publicId: string; format: string; resourceType: string }) {
  credentials();
  return cloudinary.utils.private_download_url(file.publicId, file.format, {
    resource_type: file.resourceType,
    type: DELIVERY_TYPE,
    expires_at: Math.floor(Date.now() / 1000) + FILE_LINK_TTL_SECONDS,
    attachment: false,
  });
}
