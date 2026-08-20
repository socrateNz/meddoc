"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  createPregnancySchema,
  addPrenatalVisitSchema,
  recordDeliverySchema,
  updatePregnancyStatusSchema,
} from "@/validators/maternity";
import { revalidatePath } from "next/cache";

// Consulter le suivi de maternité est ouvert à tout le personnel clinique, y compris ADMIN
// (holding) en lecture seule. Créer/modifier une grossesse, une visite prénatale ou un
// accouchement reste une écriture clinique réservée au même trio que CLINICAL_WRITE_ROLES
// (src/actions/patients.ts, src/actions/careplans.ts).
const MATERNITY_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const MATERNITY_WRITE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

function assertMaternityReadRole(role: string) {
  if (!MATERNITY_READ_ROLES.includes(role)) throw new Error("Non autorisé.");
}

function assertMaternityWriteRole(role: string) {
  if (!MATERNITY_WRITE_ROLES.includes(role)) {
    throw new Error("Non autorisé. Réservé au personnel clinique (coordinateur, médecin ou infirmier(e)).");
  }
}

const PREGNANCY_INCLUDE = {
  prenatalVisits: {
    orderBy: { visitDate: "desc" as const },
    include: { recordedBy: { select: { firstName: true, lastName: true } } },
  },
  delivery: {
    include: { newborns: true, recordedBy: { select: { firstName: true, lastName: true } } },
  },
  createdBy: { select: { firstName: true, lastName: true } },
};

export async function createPregnancy(data: {
  patientId: string;
  lastMenstrualPeriod: string;
  expectedDueDate: string;
  gravidity: number;
  parity: number;
  riskFactors?: string[];
}) {
  try {
    createPregnancySchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertMaternityWriteRole(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const existingActive = await prisma.pregnancy.findFirst({ where: { patientId: data.patientId, status: "ACTIVE" } });
    if (existingActive) throw new Error("Une grossesse active existe déjà pour ce patient.");

    const pregnancy = await prisma.pregnancy.create({
      data: {
        patientId: data.patientId,
        lastMenstrualPeriod: new Date(data.lastMenstrualPeriod),
        expectedDueDate: new Date(data.expectedDueDate),
        gravidity: data.gravidity,
        parity: data.parity,
        riskFactors: data.riskFactors || [],
        status: "ACTIVE",
        createdById: activeUser.id,
      },
    });

    await logAuditAction(activeUser.id, "CREATE_PREGNANCY", "Pregnancy", pregnancy.id, { patientId: data.patientId });
    revalidatePath(`/dashboard/patients/${data.patientId}`);

    return { success: true, data: pregnancy };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de la grossesse.") };
  }
}

export async function listPregnancies(patientId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertMaternityReadRole(activeUser.role);

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const pregnancies = await prisma.pregnancy.findMany({
      where: { patientId },
      include: PREGNANCY_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: pregnancies };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement du suivi de maternité.") };
  }
}

export async function addPrenatalVisit(data: {
  pregnancyId: string;
  visitDate?: string;
  gestationalWeeks?: number;
  weightKg?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  fundalHeightCm?: number;
  fetalHeartRateBpm?: number;
  notes?: string;
}) {
  try {
    addPrenatalVisitSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertMaternityWriteRole(activeUser.role);

    const pregnancy = await prisma.pregnancy.findUnique({ where: { id: data.pregnancyId } });
    if (!pregnancy) throw new Error("Grossesse introuvable.");
    if (pregnancy.status !== "ACTIVE") throw new Error("Cette grossesse n'est plus active — impossible d'ajouter une visite.");

    const hasAccess = await verifyPatientAccess(pregnancy.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const visit = await prisma.prenatalVisit.create({
      data: {
        pregnancyId: data.pregnancyId,
        visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
        gestationalWeeks: data.gestationalWeeks ?? null,
        weightKg: data.weightKg ?? null,
        bloodPressureSystolic: data.bloodPressureSystolic ?? null,
        bloodPressureDiastolic: data.bloodPressureDiastolic ?? null,
        fundalHeightCm: data.fundalHeightCm ?? null,
        fetalHeartRateBpm: data.fetalHeartRateBpm ?? null,
        notes: data.notes || null,
        recordedById: activeUser.id,
      },
    });

    await logAuditAction(activeUser.id, "ADD_PRENATAL_VISIT", "Pregnancy", data.pregnancyId, {});
    revalidatePath(`/dashboard/patients/${pregnancy.patientId}`);

    return { success: true, data: visit };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'ajout de la visite prénatale.") };
  }
}

export async function recordDelivery(data: {
  pregnancyId: string;
  deliveredAt?: string;
  mode: "VAGINAL" | "C_SECTION" | "ASSISTED";
  complications?: string[];
  notes?: string;
  newborns: {
    sex: "M" | "F" | "Indéterminé";
    weightGrams: number;
    apgarScore1?: number;
    apgarScore5?: number;
    vitalStatus?: "LIVE_BIRTH" | "STILLBIRTH";
    notes?: string;
  }[];
}) {
  try {
    recordDeliverySchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertMaternityWriteRole(activeUser.role);

    const pregnancy = await prisma.pregnancy.findUnique({ where: { id: data.pregnancyId } });
    if (!pregnancy) throw new Error("Grossesse introuvable.");
    if (pregnancy.status !== "ACTIVE") throw new Error("L'accouchement a déjà été enregistré pour cette grossesse.");

    const hasAccess = await verifyPatientAccess(pregnancy.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const delivery = await prisma.$transaction(async (tx) => {
      const created = await tx.delivery.create({
        data: {
          pregnancyId: data.pregnancyId,
          deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : new Date(),
          mode: data.mode,
          complications: data.complications || [],
          notes: data.notes || null,
          recordedById: activeUser.id,
        },
      });

      await tx.newborn.createMany({
        data: data.newborns.map((n) => ({
          deliveryId: created.id,
          sex: n.sex,
          weightGrams: n.weightGrams,
          apgarScore1: n.apgarScore1 ?? null,
          apgarScore5: n.apgarScore5 ?? null,
          vitalStatus: n.vitalStatus || "LIVE_BIRTH",
          notes: n.notes || null,
        })),
      });

      await tx.pregnancy.update({ where: { id: data.pregnancyId }, data: { status: "DELIVERED" } });

      return created;
    });

    await logAuditAction(activeUser.id, "RECORD_DELIVERY", "Pregnancy", data.pregnancyId, {
      mode: data.mode,
      newbornCount: data.newborns.length,
    });
    revalidatePath(`/dashboard/patients/${pregnancy.patientId}`);

    return { success: true, data: delivery };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'accouchement.") };
  }
}

export async function updatePregnancyStatus(pregnancyId: string, status: "MISCARRIED" | "TERMINATED") {
  try {
    updatePregnancyStatusSchema.parse({ pregnancyId, status });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertMaternityWriteRole(activeUser.role);

    const pregnancy = await prisma.pregnancy.findUnique({ where: { id: pregnancyId } });
    if (!pregnancy) throw new Error("Grossesse introuvable.");
    if (pregnancy.status !== "ACTIVE") throw new Error("Cette grossesse n'est plus active.");

    const hasAccess = await verifyPatientAccess(pregnancy.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const updated = await prisma.pregnancy.update({ where: { id: pregnancyId }, data: { status } });

    await logAuditAction(activeUser.id, "UPDATE_PREGNANCY_STATUS", "Pregnancy", pregnancyId, { status });
    revalidatePath(`/dashboard/patients/${pregnancy.patientId}`);

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du statut.") };
  }
}
