"use server";

import { prisma } from "@/lib/db";
import { Role, Priority, IncidentStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

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
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
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
    return { success: false, error: error.message || "Erreur lors de la création du patient" };
  }
}

export async function createMedicalRecord(data: {
  patientId: string;
  title: string;
  description: string;
  documentUrl?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
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
    return { success: false, error: error.message || "Erreur lors de la création du document médical" };
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
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
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
    return { success: false, error: error.message || "Erreur lors de la création de l'incident" };
  }
}

export async function updateIncidentStatus(incidentId: string, status: IncidentStatus) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
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
    return { success: false, error: error.message || "Erreur lors de la mise à jour de l'incident" };
  }
}
