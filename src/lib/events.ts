import { EventEmitter } from "events";
import { prisma } from "./db";
import { Role } from "@prisma/client";

class AppEventEmitter extends EventEmitter { }

export const appEvents = new AppEventEmitter();

// Event: Incident Created
appEvents.on("incident.created", async (data: { incidentId: string; patientId: string; title: string }) => {
  try {
    // 1. Find all coordinators to notify them
    const coordinators = await prisma.user.findMany({
      where: { role: Role.COORDINATOR, isActive: true },
    });

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { user: true },
    });

    const patientName = patient ? `${patient.user.lastName} ${patient.user.firstName}` : "un patient";

    // 2. Create database notifications
    const notificationsData = coordinators.map((coord) => ({
      userId: coord.id,
      title: `Alerte Incident : ${data.title}`,
      message: `Un nouvel incident concernant le patient ${patientName} a été signalé.`,
      type: "INCIDENT",
    }));

    await prisma.notification.createMany({
      data: notificationsData,
    });

  } catch (error) {
    console.error("Error handling incident.created event:", error);
  }
});

// Event: Appointment Scheduled
appEvents.on("appointment.scheduled", async (data: { appointmentId: string; patientId: string; caregiverId: string; title: string }) => {
  try {
    // Find caregiver user ID
    const caregiver = await prisma.caregiver.findUnique({
      where: { id: data.caregiverId },
      include: { user: true },
    });

    if (!caregiver) return;

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { user: true },
    });

    const patientName = patient ? `${patient.user.lastName} ${patient.user.firstName}` : "un patient";

    // Create database notification for the caregiver
    await prisma.notification.create({
      data: {
        userId: caregiver.userId,
        title: `Nouveau Rendez-vous : ${data.title}`,
        message: `Vous avez été assigné(e) à une visite pour le patient ${patientName}.`,
        type: "APPOINTMENT",
      },
    });
  } catch (error) {
    console.error("Error handling appointment.scheduled event:", error);
  }
});
