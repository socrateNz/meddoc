"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { revalidatePath } from "next/cache";

export async function createAppointment(data: {
  patientId: string;
  caregiverId?: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  type: string;
  status?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        caregiverId: data.caregiverId || null,
        title: data.title,
        scheduledAt: new Date(data.scheduledAt),
        durationMinutes: Number(data.durationMinutes),
        type: data.type,
        status: data.status || "SCHEDULED",
      },
    });

    // Emit event for notification
    if (appointment.caregiverId) {
      try {
        const { appEvents } = await import("@/lib/events");
        appEvents.emit("appointment.scheduled", {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          caregiverId: appointment.caregiverId,
          title: appointment.title,
        });
      } catch (e) {
        console.error("Failed to emit appointment.scheduled event:", e);
      }
    }

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "SCHEDULE_APPOINTMENT",
      "Appointment",
      appointment.id,
      { patientId: data.patientId, scheduledAt: data.scheduledAt }
    );

    revalidatePath("/dashboard/appointments");
    return { success: true, data: appointment };
  } catch (error: any) {
    console.error("Error creating appointment:", error);
    return { success: false, error: error.message || "Erreur lors de la planification du rendez-vous" };
  }
}

export async function completeConsultation(data: {
  appointmentId?: string;
  patientId: string;
  symptoms: string;
  diagnosis: string;
  plan: string;
  medications?: { name: string; dosage: string; frequency: string; instructions: string }[];
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    let description = `**Symptômes / Observations :**\n${data.symptoms}\n\n**Diagnostic / Évaluation :**\n${data.diagnosis}\n\n**Plan de traitement / Recommandations :**\n${data.plan}`;

    const result = await prisma.$transaction(async (tx) => {
      let appointment = null;
      // 1. Update appointment status if appointmentId is provided
      if (data.appointmentId) {
        appointment = await tx.appointment.update({
          where: { id: data.appointmentId },
          data: { status: "COMPLETED" },
        });
      }

      // 2. Handle Medications & Care Plan
      if (data.medications && data.medications.length > 0) {
        let activeCarePlan = await tx.carePlan.findFirst({
          where: { patientId: data.patientId, status: "ACTIVE" },
          orderBy: { startDate: "desc" },
        });

        if (!activeCarePlan) {
          let coordinator = await tx.medicalCoordinator.findFirst();
          if (!coordinator) {
            const fallbackUser = await tx.user.findFirst({ where: { role: { in: ["ADMIN", "COORDINATOR"] } } });
            if (!fallbackUser) throw new Error("Aucun administrateur ou coordinateur disponible pour valider le plan de soins.");
            coordinator = await tx.medicalCoordinator.create({
              data: { userId: fallbackUser.id }
            });
          }

          activeCarePlan = await tx.carePlan.create({
            data: {
              title: "Plan de Soins Général",
              patientId: data.patientId,
              coordinatorId: coordinator.id,
              startDate: new Date(),
              status: "ACTIVE",
            }
          });
        }

        await tx.medication.createMany({
          data: data.medications.map((med) => ({
            carePlanId: activeCarePlan!.id,
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            instructions: med.instructions,
          }))
        });

        description += "\n\n**Ordonnance :**\n";
        data.medications.forEach(med => {
          description += `- ${med.name} : ${med.dosage}, ${med.frequency}${med.instructions ? ` (${med.instructions})` : ''}\n`;
        });
      }

      // 3. Create medical record with structured notes in description
      const medicalRecord = await tx.medicalRecord.create({
        data: {
          patientId: data.patientId,
          title: `Consultation du ${new Date().toLocaleDateString('fr-FR')}`,
          description: description,
        },
      });

      return { appointment, medicalRecord };
    });

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "COMPLETE_CONSULTATION",
      data.appointmentId ? "Appointment" : "Patient",
      data.appointmentId || data.patientId,
      { status: "COMPLETED", medicalRecordId: result.medicalRecord.id }
    );

    revalidatePath("/dashboard/appointments");
    revalidatePath(`/dashboard/patients/${data.patientId}`);
    
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error completing consultation:", error);
    return { success: false, error: error.message || "Erreur lors de la clôture de la consultation" };
  }
}
