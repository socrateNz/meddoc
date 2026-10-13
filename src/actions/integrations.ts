"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertClinicScope } from "@/lib/clinic-scope";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { INTEGRATION_SCOPES, generateIntegrationKey } from "@/lib/integration-keys";

// Clés d'API des systèmes externes (étape E3) : créées et révoquées par le coordinateur de la
// clinique, consultables par l'admin de holding. La clé n'est renvoyée qu'une fois, à la création.
const READ_ROLES = ["ADMIN", "COORDINATOR"];
const MANAGE_ROLES = ["COORDINATOR"];

async function requireUser(roles: string[]) {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");
  if (!roles.includes(activeUser.role)) throw new Error("Non autorisé. Les intégrations sont gérées par le coordinateur de la clinique.");
  return activeUser;
}

export async function listIntegrationClients(clinicId: string) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    await assertClinicScope(clinicId, activeUser);
    const clients = await prisma.integrationClient.findMany({ where: { organizationId: clinicId }, orderBy: { createdAt: "desc" } });
    return {
      success: true as const,
      data: clients.map((c) => ({
        id: c.id,
        name: c.name,
        scopes: c.scopes,
        keyPrefix: c.keyPrefix,
        isActive: c.isActive && !c.revokedAt,
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        revokedAt: c.revokedAt?.toISOString() ?? null,
      })),
      canManage: MANAGE_ROLES.includes(activeUser.role),
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des intégrations.") };
  }
}

const createSchema = z.object({
  clinicId: z.string().min(1),
  name: z.string().trim().min(2, "Nom requis").max(80),
  scopes: z.array(z.enum(INTEGRATION_SCOPES)).min(1, "Choisissez au moins un accès"),
});

export async function createIntegrationClient(data: z.input<typeof createSchema>) {
  try {
    const input = createSchema.parse(data);
    const activeUser = await requireUser(MANAGE_ROLES);
    await assertClinicScope(input.clinicId, activeUser);

    const { key, prefix, hash } = generateIntegrationKey();
    const client = await prisma.integrationClient.create({
      data: { organizationId: input.clinicId, name: input.name, scopes: [...new Set(input.scopes)], keyPrefix: prefix, keyHash: hash, createdById: activeUser.id },
    });
    await logAuditAction(activeUser.id, "CREATE_INTEGRATION_KEY", "IntegrationClient", client.id, { name: input.name, scopes: client.scopes, keyPrefix: prefix });
    revalidatePath(`/dashboard/clinics/${input.clinicId}/settings`);
    return { success: true as const, data: { id: client.id, key } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la création de la clé.") };
  }
}

export async function revokeIntegrationClient(clientId: string) {
  try {
    z.string().min(1).parse(clientId);
    const activeUser = await requireUser(MANAGE_ROLES);
    const client = await prisma.integrationClient.findUnique({ where: { id: clientId } });
    if (!client) throw new Error("Intégration introuvable.");
    await assertClinicScope(client.organizationId, activeUser);
    if (client.revokedAt) throw new Error("Cette clé est déjà révoquée.");

    await prisma.integrationClient.update({ where: { id: clientId }, data: { isActive: false, revokedAt: new Date(), revokedById: activeUser.id } });
    await logAuditAction(activeUser.id, "REVOKE_INTEGRATION_KEY", "IntegrationClient", clientId, { name: client.name, keyPrefix: client.keyPrefix });
    revalidatePath(`/dashboard/clinics/${client.organizationId}/settings`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la révocation de la clé.") };
  }
}
