"use server";

import { can, type PermissionSubject } from "@/lib/permissions-catalog";

import { runIdempotent, type IdempotentInput } from "@/lib/idempotency";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { resolvePage } from "@/lib/pagination";
import {
  createPregnancySchema,
  addPrenatalVisitSchema,
  recordDeliverySchema,
  updatePregnancyStatusSchema,
} from "@/validators/maternity";
import { revalidatePath } from "next/cache";
import { assertUserModule } from "@/lib/modules-server";
import { assertClinicScope } from "@/lib/clinic-scope";
import { createNewbornPatient } from "@/lib/newborn-server";
import { z } from "zod";
import { patientServiceWhere, restrictedServiceIds } from "@/lib/service-access";
import { prenatalFollowUp, comparePrenatalFollowUp } from "@/lib/maternity-labels";

// Consulter le suivi de maternité est ouvert à tout le personnel clinique, y compris ADMIN
// (holding) en lecture seule. Créer/modifier une grossesse, une visite prénatale ou un
// accouchement reste une écriture clinique réservée au même trio que CLINICAL_WRITE_ROLES
// (src/actions/patients.ts, src/actions/careplans.ts).

function assertMaternityReadRole(role: PermissionSubject) {
  if (!can(role, "maternity.read")) throw new Error("Non autorisé.");
}

function assertMaternityWriteRole(role: PermissionSubject) {
  if (!can(role, "maternity.write")) {
    throw new Error("Non autorisé. Réservé au personnel clinique (coordinateur, médecin ou infirmier(e)).");
  }
}

const PREGNANCY_INCLUDE = {
  prenatalVisits: {
    orderBy: { visitDate: "desc" as const },
    include: {
      recordedBy: { select: { firstName: true, lastName: true } },
      // Examens demandés lors de la visite (cf. LabOrder.prenatalVisitId).
      labOrders: { select: { id: true, tests: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
      prescriptions: { select: { id: true, status: true, items: { select: { drugName: true, dosage: true } } }, orderBy: { createdAt: "asc" as const } },
      radiologyOrders: { select: { id: true, status: true, exams: true }, orderBy: { createdAt: "asc" as const } },
    },
  },
  delivery: {
    include: { newborns: true, recordedBy: { select: { firstName: true, lastName: true } } },
  },
  createdBy: { select: { firstName: true, lastName: true } },
};

export async function createPregnancy(data: Parameters<typeof createPregnancyOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createPregnancy", idempotencyKey, payload, () => createPregnancyOnce(payload));
}

async function createPregnancyOnce(data: {
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
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityWriteRole(activeUser);

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

export async function listPregnancies(patientId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityReadRole(activeUser);

    const hasAccess = await verifyPatientAccess(patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const { page, pageSize, skip, take } = resolvePage(options);
    const where = { patientId };
    const [pregnancies, total] = await Promise.all([
      prisma.pregnancy.findMany({
        where,
        include: PREGNANCY_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.pregnancy.count({ where }),
    ]);

    return { success: true as const, data: pregnancies, total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du suivi de maternité.") };
  }
}

export async function addPrenatalVisit(data: Parameters<typeof addPrenatalVisitOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("addPrenatalVisit", idempotencyKey, payload, () => addPrenatalVisitOnce(payload));
}

async function addPrenatalVisitOnce(data: {
  pregnancyId: string;
  visitDate?: string;
  gestationalWeeks?: number;
  weightKg?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  fundalHeightCm?: number;
  fetalHeartRateBpm?: number;
  notes?: string;
  cpnNumber?: number;
  edema?: boolean;
  urineProtein?: string;
  urineGlucose?: string;
  fetalPresentation?: string;
  fetalMovements?: boolean;
  preventiveTreatments?: string[];
  nextVisitDate?: string;
}) {
  try {
    addPrenatalVisitSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityWriteRole(activeUser);

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
        cpnNumber: data.cpnNumber ?? null,
        edema: data.edema ?? null,
        urineProtein: data.urineProtein || null,
        urineGlucose: data.urineGlucose || null,
        fetalPresentation: data.fetalPresentation || null,
        fetalMovements: data.fetalMovements ?? null,
        preventiveTreatments: data.preventiveTreatments ?? [],
        nextVisitDate: data.nextVisitDate ? new Date(data.nextVisitDate) : null,
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

export async function recordDelivery(data: Parameters<typeof recordDeliveryOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("recordDelivery", idempotencyKey, payload, () => recordDeliveryOnce(payload));
}

async function recordDeliveryOnce(data: {
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
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityWriteRole(activeUser);

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

    // Dossier propre de chaque enfant né vivant (néonatalogie, couveuse, vaccins) : un échec ici
    // n'annule pas l'accouchement enregistré, il se rattrape depuis la fiche (createNewbornRecord).
    const born = await prisma.newborn.findMany({ where: { deliveryId: delivery.id, vitalStatus: "LIVE_BIRTH" }, orderBy: { id: "asc" } });
    let newbornRecords = 0;
    for (const [i, n] of born.entries()) {
      try {
        await createNewbornPatient({ newbornId: n.id, motherPatientId: pregnancy.patientId, rank: i + 1, twins: born.length > 1 });
        newbornRecords++;
      } catch (e) {
        console.error("Création du dossier du nouveau-né impossible :", e);
      }
    }

    await logAuditAction(activeUser.id, "RECORD_DELIVERY", "Pregnancy", data.pregnancyId, {
      mode: data.mode,
      newbornCount: data.newborns.length,
      newbornRecords,
    });
    revalidatePath(`/dashboard/patients/${pregnancy.patientId}`);

    return { success: true, data: { ...delivery, newbornRecords } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'accouchement.") };
  }
}

const partogramEntrySchema = z.object({
  pregnancyId: z.string().min(1),
  recordedAt: z.string().optional(),
  cervicalDilation: z.number().min(0).max(10).optional(),
  headDescent: z.number().int().min(0).max(5).optional(),
  contractionsPer10: z.number().int().min(0).max(10).optional(),
  contractionDuration: z.number().int().min(0).max(300).optional(),
  fetalHeartRate: z.number().int().min(40).max(250).optional(),
  amnioticFluid: z.enum(["I", "C", "M", "B", "A"]).optional(),
  moulding: z.enum(["0", "+", "++", "+++"]).optional(),
  maternalPulse: z.number().int().min(20).max(250).optional(),
  systolicBp: z.number().int().min(40).max(300).optional(),
  diastolicBp: z.number().int().min(20).max(200).optional(),
  temperature: z.number().min(30).max(45).optional(),
  urineVolume: z.number().int().min(0).max(5000).optional(),
  oxytocin: z.string().trim().max(100).optional(),
  drugs: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});

// Partogramme : une mesure pendant le travail (sage-femme, médecin).
export async function addPartogramEntry(input: z.input<typeof partogramEntrySchema>) {
  try {
    const data = partogramEntrySchema.parse(input);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityWriteRole(activeUser);
    const pregnancy = await prisma.pregnancy.findUnique({ where: { id: data.pregnancyId }, select: { id: true, patientId: true, status: true } });
    if (!pregnancy) throw new Error("Grossesse introuvable.");
    if (pregnancy.status !== "ACTIVE") throw new Error("Le partogramme se remplit pendant le travail, avant l'accouchement.");
    if (!(await verifyPatientAccess(pregnancy.patientId, activeUser))) throw new Error("Non autorisé.");
    const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date();
    if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > Date.now() + 5 * 60_000) throw new Error("Heure de la mesure invalide.");
    const { pregnancyId, recordedAt: _r, ...measures } = data;
    void _r;
    if (Object.values(measures).every((v) => v === undefined || v === "")) throw new Error("Saisissez au moins une mesure.");
    const entry = await prisma.partogramEntry.create({
      data: { ...measures, pregnancyId, patientId: pregnancy.patientId, recordedAt, recordedById: activeUser.id },
    });
    await logAuditAction(activeUser.id, "ADD_PARTOGRAM_ENTRY", "Pregnancy", pregnancyId, { entryId: entry.id });
    revalidatePath(`/dashboard/patients/${pregnancy.patientId}`);
    return { success: true as const, data: entry };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement de la mesure.") };
  }
}

export async function listPartogram(pregnancyId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityReadRole(activeUser);
    const pregnancy = await prisma.pregnancy.findUnique({ where: { id: pregnancyId }, select: { patientId: true } });
    if (!pregnancy || !(await verifyPatientAccess(pregnancy.patientId, activeUser))) throw new Error("Non autorisé.");
    const entries = await prisma.partogramEntry.findMany({ where: { pregnancyId }, orderBy: { recordedAt: "asc" }, take: 500 });
    return { success: true as const, data: entries.map((e) => ({ ...e, recordedAt: e.recordedAt.toISOString(), createdAt: e.createdAt.toISOString() })) };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du partogramme.") };
  }
}

// Crée le dossier d'un nouveau-né qui n'en a pas encore (accouchement antérieur à cette fonction,
// ou échec lors de l'enregistrement de l'accouchement).
export async function createNewbornRecord(newbornId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityWriteRole(activeUser);
    const newborn = await prisma.newborn.findUnique({
      where: { id: newbornId },
      include: { delivery: { include: { pregnancy: { select: { patientId: true } }, newborns: { select: { id: true, vitalStatus: true }, orderBy: { id: "asc" } } } } },
    });
    if (!newborn) throw new Error("Nouveau-né introuvable.");
    const motherId = newborn.delivery.pregnancy.patientId;
    if (!(await verifyPatientAccess(motherId, activeUser))) throw new Error("Non autorisé.");
    const alive = newborn.delivery.newborns.filter((n) => n.vitalStatus === "LIVE_BIRTH");
    const patientId = await createNewbornPatient({
      newbornId,
      motherPatientId: motherId,
      rank: Math.max(1, alive.findIndex((n) => n.id === newbornId) + 1),
      twins: alive.length > 1,
    });
    await logAuditAction(activeUser.id, "CREATE_NEWBORN_RECORD", "Patient", patientId, { newbornId, motherId });
    revalidatePath(`/dashboard/patients/${motherId}`);
    return { success: true as const, data: { patientId } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la création du dossier du nouveau-né.") };
  }
}

export async function updatePregnancyStatus(pregnancyId: string, status: "MISCARRIED" | "TERMINATED") {
  try {
    updatePregnancyStatusSchema.parse({ pregnancyId, status });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityWriteRole(activeUser);

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

// Suivi des CPN de la clinique (page Maternité) : toutes les grossesses en cours, avec la dernière
// visite et le prochain rendez-vous, triées des plus urgentes (terme dépassé, CPN manquée) aux
// rendez-vous à venir — pour relancer les patientes par téléphone.
export async function listPrenatalFollowUp(clinicId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "MATERNITE");
    assertMaternityReadRole(activeUser);
    await assertClinicScope(clinicId, activeUser);

    // Cloisonnement par service (cf. src/lib/service-access.ts) : la sage-femme de Maternité ne voit
    // que les dossiers de son service.
    const myServices = await restrictedServiceIds(activeUser);
    const pregnancies = await prisma.pregnancy.findMany({
      where: { status: "ACTIVE", patient: { organizationId: clinicId, ...patientServiceWhere(myServices) } },
      select: {
        id: true,
        lastMenstrualPeriod: true,
        expectedDueDate: true,
        gravidity: true,
        parity: true,
        riskFactors: true,
        patient: { select: { id: true, ipp: true, user: { select: { firstName: true, lastName: true, phone: true } } } },
        prenatalVisits: { select: { visitDate: true, nextVisitDate: true, cpnNumber: true }, orderBy: { visitDate: "desc" }, take: 1 },
        _count: { select: { prenatalVisits: true } },
      },
      take: 1000,
    });

    const today = new Date();
    const rows = pregnancies
      .map((p) => {
        const lastVisit = p.prenatalVisits[0] ?? null;
        return {
          id: p.id,
          patientId: p.patient.id,
          patientName: `${p.patient.user.lastName} ${p.patient.user.firstName}`,
          ipp: p.patient.ipp,
          phone: p.patient.user.phone,
          gravidity: p.gravidity,
          parity: p.parity,
          riskFactors: p.riskFactors,
          expectedDueDate: p.expectedDueDate,
          visitCount: p._count.prenatalVisits,
          lastVisit,
          ...prenatalFollowUp({ lastMenstrualPeriod: p.lastMenstrualPeriod, expectedDueDate: p.expectedDueDate, lastVisit }, today),
        };
      })
      .sort(comparePrenatalFollowUp);

    return { success: true as const, data: rows };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du suivi des CPN.") };
  }
}
