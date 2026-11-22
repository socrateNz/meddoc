"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { assertOrganizationAccess } from "@/lib/org-scope";
import { isClinicStaffRole } from "@/lib/staff-roles";

// Services d'une clinique (cf. modèle ClinicService) : créés et tarifés par le coordinateur ;
// l'accueil y oriente les patients, le personnel y est rattaché, les dossiers y sont transférés.

const saveServiceSchema = z.object({
  clinicId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(2, "Nom du service requis").max(60),
  consultationPrice: z.number().min(0, "Prix invalide").nullable().optional(),
  isTransversal: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const transferSchema = z.object({
  patientId: z.string().min(1),
  toServiceId: z.string().min(1, "Service de destination requis"),
  reason: z.string().trim().max(500).optional(),
});

const TRANSFER_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

async function assertCoordinatorOf(clinicId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COORDINATOR" || user.organizationId !== clinicId) {
    throw new Error("Non autorisé. Seul le coordinateur de la clinique gère ses services.");
  }
  return user;
}

export async function listClinicServices(clinicId: string, options?: { includeInactive?: boolean }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");
    await assertOrganizationAccess(user, clinicId);
    const services = await prisma.clinicService.findMany({
      where: { organizationId: clinicId, ...(options?.includeInactive ? {} : { isActive: true }) },
      orderBy: { name: "asc" },
      include: { _count: { select: { patients: true } } },
    });
    return { success: true as const, data: services };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des services.") };
  }
}

export async function saveClinicService(input: z.input<typeof saveServiceSchema>) {
  try {
    const data = saveServiceSchema.parse(input);
    const user = await assertCoordinatorOf(data.clinicId);
    const duplicate = await prisma.clinicService.findFirst({
      where: { organizationId: data.clinicId, name: { equals: data.name, mode: "insensitive" }, ...(data.id ? { NOT: { id: data.id } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new Error(`Un service « ${data.name} » existe déjà.`);

    const fields = {
      name: data.name,
      consultationPrice: data.consultationPrice ?? null,
      isTransversal: data.isTransversal,
      isActive: data.isActive,
    };
    let service;
    if (data.id) {
      const existing = await prisma.clinicService.findFirst({ where: { id: data.id, organizationId: data.clinicId } });
      if (!existing) throw new Error("Service introuvable.");
      service = await prisma.clinicService.update({ where: { id: data.id }, data: fields });
    } else {
      service = await prisma.clinicService.create({ data: { ...fields, organizationId: data.clinicId } });
    }
    await logAuditAction(user.id, data.id ? "UPDATE_CLINIC_SERVICE" : "CREATE_CLINIC_SERVICE", "ClinicService", service.id);
    revalidatePath(`/dashboard/clinics/${data.clinicId}`, "layout");
    return { success: true as const, data: service };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement du service.") };
  }
}

// Rattache un membre du personnel à des services (vide = tous les services).
export async function setStaffServices(input: { userId: string; serviceIds: string[] }) {
  try {
    const data = z.object({ userId: z.string().min(1), serviceIds: z.array(z.string().min(1)).max(30) }).parse(input);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    const target = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true, role: true, organizationId: true } });
    if (!target || !target.organizationId || !isClinicStaffRole(target.role)) throw new Error("Membre introuvable.");

    const isCoordinator = activeUser.role === "COORDINATOR" && activeUser.organizationId === target.organizationId;
    const isHoldingAdmin = activeUser.role === "ADMIN" && activeUser.organization?.type === "HOLDING";
    if (!isCoordinator && !isHoldingAdmin) throw new Error("Non autorisé.");
    if (isHoldingAdmin) await assertOrganizationAccess(activeUser, target.organizationId);

    const serviceIds = [...new Set(data.serviceIds)];
    if (serviceIds.length > 0) {
      const count = await prisma.clinicService.count({ where: { id: { in: serviceIds }, organizationId: target.organizationId } });
      if (count !== serviceIds.length) throw new Error("Service invalide pour cette clinique.");
    }
    await prisma.user.update({ where: { id: target.id }, data: { serviceIds } });
    await logAuditAction(activeUser.id, "SET_STAFF_SERVICES", "User", target.id, { serviceIds });
    revalidatePath(`/dashboard/clinics/${target.organizationId}/team`);
    revalidatePath("/dashboard/team");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du rattachement aux services.") };
  }
}

// Confie le dossier à un autre service. Le soignant doit avoir accès au dossier (service actuel,
// cf. verifyPatientAccess) : après le transfert, s'il n'est pas du service de destination, il
// n'y a plus accès — c'est voulu.
export async function transferPatient(input: z.input<typeof transferSchema>) {
  try {
    const data = transferSchema.parse(input);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    if (!TRANSFER_ROLES.includes(activeUser.role)) throw new Error("Non autorisé. Seuls le coordinateur, un médecin ou un infirmier(e) peuvent transférer un dossier.");
    if (!(await verifyPatientAccess(data.patientId, activeUser))) throw new Error("Non autorisé. Ce dossier n'est pas accessible.");

    const patient = await prisma.patient.findUnique({ where: { id: data.patientId }, select: { id: true, organizationId: true, serviceId: true } });
    if (!patient?.organizationId) throw new Error("Patient introuvable.");
    if (patient.serviceId === data.toServiceId) throw new Error("Le dossier est déjà dans ce service.");
    const target = await prisma.clinicService.findFirst({ where: { id: data.toServiceId, organizationId: patient.organizationId, isActive: true } });
    if (!target) throw new Error("Service de destination introuvable ou désactivé.");

    await prisma.$transaction([
      prisma.patient.update({ where: { id: patient.id }, data: { serviceId: target.id } }),
      prisma.patientTransfer.create({
        data: {
          patientId: patient.id,
          fromServiceId: patient.serviceId ?? null,
          toServiceId: target.id,
          reason: data.reason || null,
          kind: "TRANSFER",
          transferredById: activeUser.id,
        },
      }),
    ]);
    await logAuditAction(activeUser.id, "TRANSFER_PATIENT", "Patient", patient.id, { from: patient.serviceId ?? null, to: target.id });
    revalidatePath(`/dashboard/clinics/${patient.organizationId}/patients`, "layout");
    revalidatePath(`/dashboard/patients/${patient.id}`);
    return { success: true as const, data: { serviceName: target.name } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du transfert du dossier.") };
  }
}
