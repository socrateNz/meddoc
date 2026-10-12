"use server";

import { runIdempotent, type IdempotentInput } from "@/lib/idempotency";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  createCarePlanSchema,
  createCareTaskSchema,
  toggleTaskStatusSchema,
  closeCarePlanSchema,
  reopenCarePlanSchema,
} from "@/validators/careplans";
import { revalidatePath } from "next/cache";
import { billStayToDate, closeOpenSegment, findOpenStay, patientOutstanding } from "@/lib/hospital-stay-db";

// Écrire sur un plan de soins (créer/clôturer/réouvrir, ajouter ou cocher une tâche) est
// réservé au personnel opérationnel de la clinique — même périmètre que CLINICAL_WRITE_ROLES
// dans src/actions/patients.ts. Avant ce contrôle, seul l'accès au dossier patient était
// vérifié : un rôle non clinique (PHARMACIST, FAMILY, PATIENT...) partageant l'organisation
// du patient pouvait déclencher ces écritures.
const CLINICAL_WRITE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];
function assertClinicalWriteAccess(role: string) {
  if (!CLINICAL_WRITE_ROLES.includes(role)) {
    throw new Error("Non autorisé. Réservé au personnel clinique (coordinateur, médecin ou infirmier(e)).");
  }
}

export async function createCarePlan(data: Parameters<typeof createCarePlanOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createCarePlan", idempotencyKey, payload, () => createCarePlanOnce(payload));
}

async function createCarePlanOnce(data: {
  patientId: string;
  title: string;
  startDate: string;
  endDate?: string;
}) {
  try {
    createCarePlanSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertClinicalWriteAccess(activeUser.role);

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
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du plan.") };
  }
}

export async function createCareTask(data: Parameters<typeof createCareTaskOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createCareTask", idempotencyKey, payload, () => createCareTaskOnce(payload));
}

async function createCareTaskOnce(data: {
  carePlanId: string;
  patientId: string; // for revalidation
  title: string;
  description?: string;
  scheduledFor: string;
}) {
  try {
    createCareTaskSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertClinicalWriteAccess(activeUser.role);

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
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'ajout de la tâche.") };
  }
}

export async function toggleTaskStatus(taskId: string, patientId: string, isCompleted: boolean) {
  try {
    toggleTaskStatusSchema.parse({ taskId, patientId, isCompleted });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertClinicalWriteAccess(activeUser.role);

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
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour.") };
  }
}

// Sortie du patient (protocole de sortie, étape C de l'audit d'évolution) :
// 1. compte-rendu de sortie obligatoire ;
// 2. patient hospitalisé : les nuitées dues sont facturées à date (facture « Frais de séjour » à la
//    caisse) et le reste à payer de TOUTES ses factures est contrôlé. Avec un solde dû, la sortie
//    est refusée — sauf pour un coordinateur, avec un motif tracé dans l'audit. La facture est
//    conservée même quand la sortie est refusée, pour que la famille puisse régler à la caisse ;
// 3. sortie en une transaction : plan de soins clôturé, patient sorti, période de lit et séjour
//    fermés, lit libéré, bilan versé au dossier médical ;
// 4. renvoie les données du bulletin de sortie (cf. discharge-pdf.tsx).
// Un patient suivi en ambulatoire (aucun séjour ouvert) n'a ni facturation de séjour ni contrôle
// de solde : clôturer ses soins n'est pas une sortie d'hospitalisation.
export async function closeCarePlan(
  carePlanId: string,
  patientId: string,
  dischargeSummary: string,
  options: { forceReason?: string } = {}
) {
  try {
    closeCarePlanSchema.parse({ carePlanId, patientId, dischargeSummary });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertClinicalWriteAccess(activeUser.role);

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const plan = await prisma.carePlan.findUnique({ where: { id: carePlanId }, select: { patientId: true, status: true } });
    if (!plan || plan.patientId !== patientId) throw new Error("Plan de soins introuvable pour ce patient.");
    if (plan.status !== "ACTIVE") throw new Error("Ce plan de soins est déjà clôturé.");

    // 2. Facturation des nuitées à date, validée immédiatement (indépendamment de la suite).
    const openStay = await prisma.$transaction((tx) => findOpenStay(tx, patientId));
    let outstanding = 0;
    if (openStay) {
      await prisma.$transaction((tx) => billStayToDate(tx, { stayId: openStay.id, userId: activeUser.id }));
      outstanding = (await prisma.$transaction((tx) => patientOutstanding(tx, patientId))).total;
    }

    const forceReason = options.forceReason?.trim() || null;
    if (outstanding > 0) {
      const canForce = activeUser.role === "COORDINATOR";
      if (!canForce || !forceReason) {
        return {
          success: false as const,
          blocked: true as const,
          outstanding,
          canForce,
          error: canForce
            ? `Reste à payer : ${formatFCFA(outstanding)}. Faites régler à la caisse, ou indiquez le motif d'une sortie sans règlement complet.`
            : `Reste à payer : ${formatFCFA(outstanding)}. La facture de séjour est disponible à la caisse ; la sortie sera possible une fois réglée (ou validée par un coordinateur).`,
        };
      }
    }

    // 3. Sortie.
    const now = new Date();
    const updatedPlan = await prisma.$transaction(async (tx) => {
      const closed = await tx.carePlan.update({
        where: { id: carePlanId },
        data: { status: "COMPLETED", endDate: now, dischargeSummary, completedAt: now, closedById: activeUser.id },
      });
      const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { bedId: true } });
      if (patient?.bedId) {
        await tx.bed.update({ where: { id: patient.bedId }, data: { status: "AVAILABLE" } });
      }
      await tx.patient.update({ where: { id: patientId }, data: { status: "DISCHARGED", bedId: null } });
      if (openStay) {
        await closeOpenSegment(tx, patientId, "DISCHARGE", now);
        await tx.hospitalStay.update({
          where: { id: openStay.id },
          data: {
            status: "CLOSED",
            dischargedAt: now,
            dischargedById: activeUser.id,
            ...(outstanding > 0 ? { dischargeOverrideReason: forceReason, outstandingAtDischarge: outstanding } : {}),
          },
        });
      }
      await tx.medicalRecord.create({
        data: { patientId, title: "Bilan de sortie & Résumé de fin de traitement", description: dischargeSummary },
      });
      return closed;
    });

    await logAuditAction(activeUser.id, "CLOSE_CARE_PLAN", "CarePlan", carePlanId, {
      hospitalStayId: openStay?.id ?? null,
      outstanding,
      forcedWithReason: outstanding > 0 ? forceReason : null,
    });
    revalidatePath(`/dashboard/patients/${patientId}`);
    revalidatePath("/dashboard/patients");
    revalidatePath("/dashboard", "layout");

    // 4. Bulletin de sortie.
    const [patient, stay] = await Promise.all([
      prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          ipp: true,
          dateOfBirth: true,
          sex: true,
          user: { select: { firstName: true, lastName: true } },
          organization: { select: { name: true, logoUrl: true } },
        },
      }),
      openStay ? prisma.hospitalStay.findUnique({ where: { id: openStay.id }, include: { bedStays: { orderBy: { startedAt: "asc" } } } }) : null,
    ]);

    return {
      success: true as const,
      data: updatedPlan,
      bulletin: {
        patient,
        dischargeSummary,
        dischargedAt: now.toISOString(),
        dischargedBy: `${activeUser.firstName} ${activeUser.lastName}`,
        stay: stay
          ? {
              admittedAt: stay.admittedAt.toISOString(),
              nightsBilled: stay.nightsBilled,
              beds: stay.bedStays.map((b) => ({ wardName: b.wardName, roomName: b.roomName, bedLabel: b.bedLabel })),
            }
          : null,
        outstanding,
        overrideReason: outstanding > 0 ? forceReason : null,
      },
    };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la clôture des soins.") };
  }
}

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

export async function reopenCarePlan(patientId: string, title?: string) {
  try {
    reopenCarePlanSchema.parse({ patientId, title });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertClinicalWriteAccess(activeUser.role);

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
    return { success: false, error: toErrorMessage(error, "Erreur lors de la réouverture du dossier.") };
  }
}
