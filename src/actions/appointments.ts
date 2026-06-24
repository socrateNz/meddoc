"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
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
