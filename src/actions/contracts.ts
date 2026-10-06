"use server";

import { runIdempotent, type IdempotentInput } from "@/lib/idempotency";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";
import { resolvePage } from "@/lib/pagination";
import { createContractSchema, updateContractStatusSchema } from "@/validators/contracts";
import { revalidatePath } from "next/cache";

const CONTRACT_READ_ROLES = ["ADMIN", "COORDINATOR"];
const CONTRACT_WRITE_ROLES = ["COORDINATOR"];

// ADMIN (holding) garde une vue lecture seule des contrats des aidants ; seul
// COORDINATOR (le véritable gestionnaire RH de sa clinique) peut les créer/modifier.
async function assertContractRead(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (!CONTRACT_READ_ROLES.includes(activeUser.role)) {
    throw new Error("Non autorisé.");
  }
}

async function assertContractWrite(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (!CONTRACT_WRITE_ROLES.includes(activeUser.role)) {
    throw new Error("Non autorisé. Réservé aux coordinateurs.");
  }
  await requirePermission(activeUser.role, "MANAGE_CONTRACTS");
}

export async function listContracts(organizationId?: string, options?: { page?: number; pageSize?: number }) {
  try {
    const activeUser = await getCurrentUser();
    await assertContractRead(activeUser);

    const { page, pageSize, skip, take } = resolvePage(options);
    const whereClause: any = {};

    if (activeUser!.organization?.type === "HOLDING" && !organizationId) {
      whereClause.patient = {
        OR: [
          { organizationId: activeUser!.organizationId },
          { organization: { parentId: activeUser!.organizationId } },
        ],
      };
    } else {
      const targetOrgId = organizationId || activeUser!.organizationId;
      if (targetOrgId) {
        whereClause.patient = { organizationId: targetOrgId };
      }
    }

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where: whereClause,
        include: {
          patient: { include: { user: true } },
          caregiver: { include: { user: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.contract.count({ where: whereClause }),
    ]);

    return { success: true as const, data: contracts, total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des contrats.") };
  }
}

export async function createContract(data: Parameters<typeof createContractOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createContract", idempotencyKey, payload, () => createContractOnce(payload));
}

async function createContractOnce(data: {
  patientId: string;
  caregiverId?: string;
  title: string;
  startDate: string;
  endDate?: string;
  hourlyRate: number;
  hoursPerWeek: number;
  documentUrl?: string;
  organizationId?: string;
}) {
  try {
    createContractSchema.parse(data);
    const activeUser = await getCurrentUser();
    await assertContractWrite(activeUser);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const contract = await prisma.contract.create({
      data: {
        patientId: data.patientId,
        caregiverId: data.caregiverId || null,
        title: data.title,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        hourlyRate: Number(data.hourlyRate),
        hoursPerWeek: Number(data.hoursPerWeek),
        documentUrl: data.documentUrl || null,
        status: "ACTIVE",
      },
    });

    await logAuditAction(activeUser!.id, "CREATE_CONTRACT", "Contract", contract.id, {
      patientId: data.patientId,
    });

    revalidatePath("/dashboard/contracts");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: contract };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du contrat.") };
  }
}

export async function updateContractStatus(contractId: string, status: string) {
  try {
    updateContractStatusSchema.parse({ contractId, status });
    const activeUser = await getCurrentUser();
    await assertContractWrite(activeUser);

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new Error("Contrat introuvable.");

    const hasAccess = await verifyPatientAccess(contract.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        status,
        endDate: status === "COMPLETED" || status === "TERMINATED" ? new Date() : contract.endDate,
      },
    });

    await logAuditAction(activeUser!.id, "UPDATE_CONTRACT_STATUS", "Contract", contractId, { status });

    revalidatePath("/dashboard/contracts");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du contrat.") };
  }
}
