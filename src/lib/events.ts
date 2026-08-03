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

// Event: Critical Lab Result — alerte le prescripteur et les coordinateurs de la clinique.
appEvents.on("lab.result.critical", async (data: {
  labOrderId: string;
  labResultId: string;
  patientId: string;
  orderedById: string;
  organizationId: string | null;
  testName: string;
  value: string;
}) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { user: true },
    });
    const patientName = patient ? `${patient.user.lastName} ${patient.user.firstName}` : "un patient";

    const recipientIds = new Set<string>([data.orderedById]);
    if (data.organizationId) {
      const coordinators = await prisma.user.findMany({
        where: { role: Role.COORDINATOR, isActive: true, organizationId: data.organizationId },
        select: { id: true },
      });
      coordinators.forEach((c) => recipientIds.add(c.id));
    }

    await prisma.notification.createMany({
      data: Array.from(recipientIds).map((userId) => ({
        userId,
        title: `Résultat critique : ${data.testName}`,
        message: `Valeur critique détectée (${data.value}) pour ${patientName}. Vérification urgente requise.`,
        type: "LAB_CRITICAL",
      })),
    });
  } catch (error) {
    console.error("Error handling lab.result.critical event:", error);
  }
});

// Event: Interaction médicamenteuse à risque élevé (vérification IA, consultative) — alerte le
// prescripteur et les coordinateurs de la clinique. Même mécanique que lab.result.critical.
appEvents.on("prescription.interaction.high", async (data: {
  prescriptionId: string;
  patientId: string;
  prescribedById: string;
  organizationId: string | null;
  warnings: { drugs: string[]; description: string }[];
}) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { user: true },
    });
    const patientName = patient ? `${patient.user.lastName} ${patient.user.firstName}` : "un patient";
    const summary = data.warnings?.[0]?.description || "Risque d'interaction médicamenteuse détecté.";

    const recipientIds = new Set<string>([data.prescribedById]);
    if (data.organizationId) {
      const coordinators = await prisma.user.findMany({
        where: { role: Role.COORDINATOR, isActive: true, organizationId: data.organizationId },
        select: { id: true },
      });
      coordinators.forEach((c) => recipientIds.add(c.id));
    }

    await prisma.notification.createMany({
      data: Array.from(recipientIds).map((userId) => ({
        userId,
        title: `Interaction médicamenteuse à risque élevé`,
        message: `${summary} (patient : ${patientName}). Vérification IA consultative — à valider cliniquement.`,
        type: "DRUG_INTERACTION",
      })),
    });
  } catch (error) {
    console.error("Error handling prescription.interaction.high event:", error);
  }
});

// Event: Rupture de stock (franchissement du seuil de réapprovisionnement) — alerte
// COORDINATOR + PHARMACIST de la clinique. Émis par les actions qui décrémentent
// PharmacyItem.stockQuantity (finance.ts, lab.ts, stock.ts) ou par le planificateur en filet
// de sécurité (src/lib/scheduler.ts:checkLowStock).
appEvents.on("stock.low", async (data: {
  pharmacyItemId: string;
  itemName: string;
  stockQuantity: number;
  reorderLevel: number;
  organizationId: string | null;
}) => {
  try {
    if (!data.organizationId) return;

    const recipients = await prisma.user.findMany({
      where: { role: { in: [Role.COORDINATOR, Role.PHARMACIST] }, isActive: true, organizationId: data.organizationId },
      select: { id: true },
    });
    if (recipients.length === 0) return;

    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        title: `Rupture de stock : ${data.itemName}`,
        message: `Stock restant : ${data.stockQuantity} (seuil de réapprovisionnement : ${data.reorderLevel}). Pensez à commander.`,
        type: "STOCK_LOW",
      })),
    });
  } catch (error) {
    console.error("Error handling stock.low event:", error);
  }
});

// Event: Expiration de lot proche — alerte COORDINATOR + PHARMACIST. Émis uniquement par le
// planificateur (rien ne "se déclenche" quand un lot vieillit).
appEvents.on("stock.expiring", async (data: {
  pharmacyItemId: string;
  itemName: string;
  expiryDate: string;
  organizationId: string | null;
}) => {
  try {
    if (!data.organizationId) return;

    const recipients = await prisma.user.findMany({
      where: { role: { in: [Role.COORDINATOR, Role.PHARMACIST] }, isActive: true, organizationId: data.organizationId },
      select: { id: true },
    });
    if (recipients.length === 0) return;

    const expiryStr = new Date(data.expiryDate).toLocaleDateString("fr-FR");
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        title: `Expiration proche : ${data.itemName}`,
        message: `Un lot expire le ${expiryStr}. Vérifiez le stock et priorisez son écoulement (FEFO).`,
        type: "STOCK_EXPIRY",
      })),
    });
  } catch (error) {
    console.error("Error handling stock.expiring event:", error);
  }
});
