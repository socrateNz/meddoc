"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { recordVitalSignSchema } from "@/validators/vitals";
import { revalidatePath } from "next/cache";

export interface RecordVitalSignInput {
  patientId: string;
  appointmentId?: string;
  temperature?: number;
  bloodPressure?: string;
  heartRate?: number;
  oxygenSaturation?: number;
  bloodSugar?: number;
  weight?: number;
  painScore?: number;
  notes?: string;
}

export async function recordVitalSign(data: RecordVitalSignInput) {
  try {
    recordVitalSignSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      include: { carePlans: true }
    });
    const isDischarged = (patient as any)?.status === "DISCHARGED" || (patient?.carePlans && patient.carePlans.length > 0 && !patient.carePlans.some((cp: any) => cp.status === "ACTIVE"));
    if (isDischarged) {
      throw new Error("Ce dossier patient est clôturé. Veuillez réouvrir les soins pour enregistrer des constantes.");
    }

    const vital = await (prisma as any).vitalSign.create({
      data: {
        patientId: data.patientId,
        appointmentId: data.appointmentId || null,
        recordedById: activeUser.id,
        temperature: data.temperature ?? null,
        bloodPressure: data.bloodPressure || null,
        heartRate: data.heartRate ?? null,
        oxygenSaturation: data.oxygenSaturation ?? null,
        bloodSugar: data.bloodSugar ?? null,
        weight: data.weight ?? null,
        painScore: data.painScore ?? null,
        notes: data.notes || null,
      },
    });

    await logAuditAction(activeUser.id, "RECORD_VITAL_SIGN", "Patient", data.patientId);
    revalidatePath(`/dashboard/patients/${data.patientId}`);
    return { success: true, data: vital };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement des constantes.") };
  }
}

export async function getPatientVitalSigns(patientId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const vitals = await (prisma as any).vitalSign.findMany({
      where: { patientId },
      include: {
        recordedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        appointment: { select: { id: true, title: true, scheduledAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: vitals };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la récupération des constantes." };
  }
}
