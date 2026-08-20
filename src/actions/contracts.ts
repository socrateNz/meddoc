"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { requirePermission } from "@/lib/permissions";
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

export async function listContracts(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    await assertContractRead(activeUser);

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

    const contracts = await prisma.contract.findMany({
      where: whereClause,
      include: {
        patient: { include: { user: true } },
        caregiver: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return { success: true, data: contracts };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des contrats.") };
  }
}

export async function createContract(data: {
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
