import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrganizationModules } from "@/lib/modules-server";
import { MODULE_DISABLED_MESSAGE } from "@/lib/modules";
import { extractIntegrationKey, hashIntegrationKey, type IntegrationScope } from "@/lib/integration-keys";

export type IntegrationClientRecord = { id: string; organizationId: string; name: string; createdById: string; scopes: string[] };

// Authentification des systèmes externes (FHIR, HL7) par clé d'API — jamais par cookie de session.
// La clé ne donne accès qu'aux données de SA clinique et aux seules portées qui lui ont été
// accordées.
export async function authenticateIntegration(
  req: Request,
  scope: IntegrationScope,
  onError: (status: number, message: string) => Response = (status, message) => NextResponse.json({ error: message }, { status })
): Promise<{ client: IntegrationClientRecord } | { response: Response }> {
  const key = extractIntegrationKey(req.headers);
  if (!key) return { response: onError(401, "Clé d'API manquante ou mal formée.") };
  const client = await prisma.integrationClient.findUnique({ where: { keyHash: hashIntegrationKey(key) } });
  if (!client || !client.isActive || client.revokedAt) return { response: onError(401, "Clé d'API invalide ou révoquée.") };
  if (!client.scopes.includes(scope)) return { response: onError(403, `Cette clé n'a pas la portée « ${scope} ».`) };
  // Modules de la licence : l'interopérabilité, et le laboratoire pour les automates (HL7).
  const modules = await getOrganizationModules(client.organizationId);
  const missing = !modules.includes("INTEROPERABILITE") ? "INTEROPERABILITE" : scope === "hl7:lab" && !modules.includes("LABORATOIRE") ? "LABORATOIRE" : null;
  if (missing) return { response: onError(403, MODULE_DISABLED_MESSAGE(missing)) };

  // Trace d'utilisation (au plus une écriture par minute et par clé).
  if (!client.lastUsedAt || Date.now() - client.lastUsedAt.getTime() > 60000) {
    await prisma.integrationClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
  }
  return { client: { id: client.id, organizationId: client.organizationId, name: client.name, createdById: client.createdById, scopes: client.scopes } };
}
