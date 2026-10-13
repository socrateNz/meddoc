import { createHash, randomBytes } from "node:crypto";

// Clés d'API des systèmes externes (étape E3) : « mdk_<préfixe>_<secret> ». Seule l'empreinte
// SHA-256 est conservée en base ; le préfixe sert à reconnaître la clé dans la liste.
export const INTEGRATION_SCOPES = ["fhir:read", "hl7:lab"] as const;
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];
export const INTEGRATION_SCOPE_LABELS: Record<IntegrationScope, string> = {
  "fhir:read": "Lecture FHIR des dossiers (patients, constantes, résultats validés, comptes-rendus)",
  "hl7:lab": "Automate de laboratoire HL7 (liste de travail, envoi des résultats)",
};

export function hashIntegrationKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateIntegrationKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString("hex");
  const key = `mdk_${prefix}_${randomBytes(24).toString("base64url")}`;
  return { key, prefix, hash: hashIntegrationKey(key) };
}

// Clé présentée par le client : « Authorization: Bearer <clé> » ou en-tête « X-Api-Key ».
export function extractIntegrationKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  const bearer = auth && /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  const key = bearer || headers.get("x-api-key");
  return key && /^mdk_[a-f0-9]{8}_[A-Za-z0-9_-]{20,}$/.test(key) ? key : null;
}
