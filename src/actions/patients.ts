"use server";

import { prisma } from "@/lib/db";
import { Role, Priority, IncidentStatus } from "@prisma/client";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  createPatientSchema,
  createMedicalRecordSchema,
  createIncidentSchema,
  updateIncidentStatusSchema,
  reassignPatientSchema,
} from "@/validators/patients";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

// La prise en charge clinique (créer/modifier un patient, un dossier ou un incident) est réservée
// au personnel opérationnel de la clinique — ADMIN (holding) et PHARMACIST restent en lecture seule.
const CLINICAL_WRITE_ROLES = ["COORDINATOR", "CAREGIVER"];

function assertClinicalWriteAccess(role: string) {
  if (!CLINICAL_WRITE_ROLES.includes(role)) {
    throw new Error("Non autorisé. Seuls un coordinateur ou un soignant peuvent effectuer cette action.");
  }
}

export async function createPatient(data: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth: string;
  address: string;
  emergencyContact?: string;
  dependencyLevel: number;
  pathologies: string[];
  allergies: string[];
  organizationId?: string;
}) {
  try {
    createPatientSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }
    assertClinicalWriteAccess(activeUser.role);

    let targetOrgId = activeUser.organizationId;
    if (data.organizationId && activeUser.organization?.type === "HOLDING") {
      // Validate target organization belongs to the holding
      if (data.organizationId !== activeUser.organizationId) {
        const targetOrg = await prisma.organization.findFirst({
          where: { id: data.organizationId, parentId: activeUser.organizationId }
        });
        if (!targetOrg) {
          throw new Error("Établissement cible invalide ou non autorisé.");
        }
      }
      targetOrgId = data.organizationId;
    }

    const hashedPassword = await bcrypt.hash("patient123", 10); // default password for new patients

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        throw new Error("Un utilisateur avec cet email existe déjà.");
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          role: Role.PATIENT,
          phone: data.phone,
          organizationId: targetOrgId,
        },
      });

      const patient = await tx.patient.create({
        data: {
          userId: user.id,
          dateOfBirth: new Date(data.dateOfBirth),
          address: data.address,
          emergencyContact: data.emergencyContact,
          dependencyLevel: Number(data.dependencyLevel),
          pathologies: data.pathologies,
          allergies: data.allergies,
          organizationId: targetOrgId,
        },
      });

      return { user, patient };
    });

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "CREATE_PATIENT",
      "Patient",
      result.patient.id,
      { email: data.email, lastName: data.lastName }
    );

    revalidatePath("/dashboard/patients");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating patient:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du patient") };
  }
}

export async function createMedicalRecord(data: {
  patientId: string;
  title: string;
  description: string;
  documentUrl?: string;
}) {
  try {
    createMedicalRecordSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }
    assertClinicalWriteAccess(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { carePlans: true }
    });
    const isDischarged = (patient as any)?.status === "DISCHARGED" || (patient?.carePlans && patient.carePlans.length > 0 && !patient.carePlans.some((cp: any) => cp.status === "ACTIVE"));
    if (isDischarged) {
      throw new Error("Ce dossier patient est clôturé. Veuillez réouvrir les soins pour ajouter des documents.");
    }

    const record = await prisma.medicalRecord.create({
      data: {
        patientId: data.patientId,
        title: data.title,
        description: data.description,
        documentUrl: data.documentUrl || null,
      },
    });

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "CREATE_MEDICAL_RECORD",
      "MedicalRecord",
      record.id,
      { patientId: data.patientId, title: data.title }
    );

    revalidatePath(`/dashboard/patients/${data.patientId}`);
    return { success: true, data: record };
  } catch (error: any) {
    console.error("Error creating medical record:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du document médical") };
  }
}

export async function createIncident(data: {
  patientId: string;
  reportedById: string;
  title: string;
  description: string;
  priority: Priority;
}) {
  try {
    createIncidentSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }
    assertClinicalWriteAccess(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { carePlans: true }
    });
    const isDischarged = (patient as any)?.status === "DISCHARGED" || (patient?.carePlans && patient.carePlans.length > 0 && !patient.carePlans.some((cp: any) => cp.status === "ACTIVE"));
    if (isDischarged) {
      throw new Error("Ce dossier patient est clôturé. Veuillez réouvrir les soins pour enregistrer un incident.");
    }

    const incident = await prisma.incident.create({
      data: {
        patientId: data.patientId,
        reportedById: data.reportedById,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: IncidentStatus.OPEN,
      },
    });

    // Emit event for notification
    try {
      const { appEvents } = await import("@/lib/events");
      appEvents.emit("incident.created", {
        incidentId: incident.id,
        patientId: incident.patientId,
        title: incident.title,
      });
    } catch (e) {
      console.error("Failed to emit incident.created event:", e);
    }

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "CREATE_INCIDENT",
      "Incident",
      incident.id,
      { patientId: data.patientId, priority: data.priority, title: data.title }
    );

    revalidatePath(`/dashboard/patients/${data.patientId}`);
    revalidatePath("/dashboard/incidents");
    return { success: true, data: incident };
  } catch (error: any) {
    console.error("Error creating incident:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de l'incident") };
  }
}

export async function updateIncidentStatus(incidentId: string, status: IncidentStatus) {
  try {
    updateIncidentStatusSchema.parse({ incidentId, status });
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }
    assertClinicalWriteAccess(activeUser.role);

    // Verify incident belongs to a patient the user can access
    const existingIncident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!existingIncident) {
      throw new Error("Incident introuvable.");
    }

    const hasAccess = await verifyPatientAccess(existingIncident.patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: { status },
    });

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "UPDATE_INCIDENT_STATUS",
      "Incident",
      incidentId,
      { status }
    );

    revalidatePath("/dashboard/incidents");
    if (updated.patientId) {
      revalidatePath(`/dashboard/patients/${updated.patientId}`);
    }
    return { success: true, data: updated };
  } catch (error: any) {
    console.error("Error updating incident status:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour de l'incident") };
  }
}

export async function getClinicPatients(clinicId: string) {
  const activeUser = await getCurrentUser();
  if (!activeUser || activeUser.role !== "ADMIN" || activeUser.organization?.type !== "HOLDING") {
    throw new Error("Non authentifié ou non autorisé.");
  }

  // Verify clinic ownership
  const clinic = await prisma.organization.findFirst({
    where: { id: clinicId, parentId: activeUser.organizationId, type: "CLINIC" }
  });

  if (!clinic) {
    throw new Error("Clinique introuvable ou non autorisée.");
  }

  const patients = await prisma.patient.findMany({
    where: { organizationId: clinicId },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
        }
      },
      incidents: {
        where: { status: { not: "RESOLVED" } },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: {
      user: { lastName: "asc" }
    }
  });

  return { success: true, data: patients, clinicName: clinic.name };
}

export async function reassignPatient(patientId: string, newOrganizationId: string) {
  try {
    reassignPatientSchema.parse({ patientId, newOrganizationId });
    const activeUser = await getCurrentUser();
    if (!activeUser || activeUser.role !== "ADMIN" || activeUser.organization?.type !== "HOLDING") {
      throw new Error("Non autorisé. Seul un administrateur de Holding peut réaffecter un patient.");
    }

    // Verify the target organization belongs to the holding (or IS the holding)
    let isTargetValid = false;
    if (newOrganizationId === activeUser.organizationId) {
      isTargetValid = true;
    } else {
      const targetOrg = await prisma.organization.findUnique({
        where: { id: newOrganizationId }
      });
      if (targetOrg && targetOrg.parentId === activeUser.organizationId) {
        isTargetValid = true;
      }
    }

    if (!isTargetValid) {
      throw new Error("L'organisation cible n'appartient pas à votre holding.");
    }

    // Update patient and its user record
    const updatedPatient = await prisma.$transaction(async (tx) => {
      const p = await tx.patient.update({
        where: { id: patientId },
        data: { organizationId: newOrganizationId }
      });
      await tx.user.update({
        where: { id: p.userId },
        data: { organizationId: newOrganizationId }
      });
      return p;
    });

    await logAuditAction(activeUser.id, "REASSIGN_PATIENT", "Patient", patientId, { newOrganizationId });
    
    revalidatePath("/dashboard/patients");
    revalidatePath(`/dashboard/patients/${patientId}`);

    return { success: true, data: updatedPatient };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la réaffectation.") };
  }
}
