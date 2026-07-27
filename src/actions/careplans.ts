"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { revalidatePath } from "next/cache";

export async function createCarePlan(data: {
  patientId: string;
  title: string;
  startDate: string;
  endDate?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    let coordinator = await prisma.medicalCoordinator.findFirst();
    if (!coordinator) {
      const fallbackUser = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "COORDINATOR"] } } });
      if (!fallbackUser) throw new Error("Aucun administrateur disponible.");
      coordinator = await prisma.medicalCoordinator.create({ data: { userId: fallbackUser.id } });
    }

    const carePlan = await prisma.carePlan.create({
      data: {
        patientId: data.patientId,
        coordinatorId: coordinator.id,
        title: data.title,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: "ACTIVE",
      },
    });

    await logAuditAction(activeUser.id, "CREATE_CARE_PLAN", "Patient", data.patientId);
    revalidatePath(`/dashboard/patients/${data.patientId}`);
    return { success: true, data: carePlan };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la création du plan." };
  }
}

export async function createCareTask(data: {
  carePlanId: string;
  patientId: string; // for revalidation
  title: string;
  description?: string;
  scheduledFor: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const task = await prisma.careTask.create({
      data: {
        carePlanId: data.carePlanId,
        title: data.title,
        description: data.description || null,
        scheduledFor: new Date(data.scheduledFor),
        status: "PENDING",
      },
    });

    await logAuditAction(activeUser.id, "CREATE_CARE_TASK", "CarePlan", data.carePlanId);
    revalidatePath(`/dashboard/patients/${data.patientId}`);
    return { success: true, data: task };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de l'ajout de la tâche." };
  }
}

export async function toggleTaskStatus(taskId: string, patientId: string, isCompleted: boolean) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const task = await prisma.careTask.update({
      where: { id: taskId },
      data: {
        status: isCompleted ? "COMPLETED" : "PENDING",
        completedAt: isCompleted ? new Date() : null,
      },
    });

    await logAuditAction(activeUser.id, "UPDATE_CARE_TASK_STATUS", "CareTask", taskId);
    revalidatePath(`/dashboard/patients/${patientId}`);
    return { success: true, data: task };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la mise à jour." };
  }
}

export async function closeCarePlan(
  carePlanId: string,
  patientId: string,
  dischargeSummary: string
) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    // Mettre à jour le plan de soins en COMPLETED
    const updatedPlan = await prisma.carePlan.update({
      where: { id: carePlanId },
      data: {
        status: "COMPLETED",
        endDate: new Date(),
      },
    });

    // Mettre à jour le statut du patient en DISCHARGED (Sortie / Soins terminés)
    try {
      await (prisma as any).patient.update({
        where: { id: patientId },
        data: {
          status: "DISCHARGED",
        },
      });
    } catch (e) {
      // Ignorer si le champ status du patient n'est pas reconnu par le client JS actuellement chargé
    }

    // Enregistrer le bilan médical de sortie dans le dossier médical du patient (MedicalRecord)
    if (dischargeSummary) {
      await prisma.medicalRecord.create({
        data: {
          patientId,
          title: "Bilan de sortie & Résumé de fin de traitement",
          description: dischargeSummary,
        },
      });
    }

    await logAuditAction(activeUser.id, "CLOSE_CARE_PLAN", "CarePlan", carePlanId);
    revalidatePath(`/dashboard/patients/${patientId}`);
    revalidatePath("/dashboard/patients");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: updatedPlan };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la clôture des soins." };
  }
}

export async function reopenCarePlan(patientId: string, title?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    let coordinator = await prisma.medicalCoordinator.findFirst();
    if (!coordinator) {
      const fallbackUser = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "COORDINATOR"] } } });
      if (!fallbackUser) throw new Error("Aucun administrateur disponible.");
      coordinator = await prisma.medicalCoordinator.create({ data: { userId: fallbackUser.id } });
    }

    // Réouvrir le patient en ADMITTED
    try {
      await (prisma as any).patient.update({
        where: { id: patientId },
        data: {
          status: "ADMITTED",
        },
      });
    } catch (e) {
      // Ignorer si le champ status n'est pas reconnu par le client JS actuellement chargé
    }

    // Créer un nouveau plan de soins actif pour le nouveau séjour
    const newCarePlan = await prisma.carePlan.create({
      data: {
        patientId: patientId,
        coordinatorId: coordinator.id,
        title: title || "Nouveau cycle de soins",
        startDate: new Date(),
        status: "ACTIVE",
      },
    });

    await logAuditAction(activeUser.id, "REOPEN_PATIENT_CARE", "Patient", patientId);
    revalidatePath(`/dashboard/patients/${patientId}`);
    revalidatePath("/dashboard/patients");
    revalidatePath("/dashboard", "layout");

    return { success: true, data: newCarePlan };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de la réouverture du dossier." };
  }
}
