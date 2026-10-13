"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { assertClinicScope } from "@/lib/clinic-scope";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { resolvePage } from "@/lib/pagination";
import { revalidatePath } from "next/cache";
import { RADIOLOGY_MODALITIES, nextRadiologyStatus, snapshotExams, type RadiologyAction, type RadiologyExamSnapshot } from "@/lib/radiology";
import { assertUserModule } from "@/lib/modules-server";

// Imagerie médicale (étape D1 de l'audit d'évolution) — mêmes rôles que le laboratoire, sans rôle
// dédié : prescription et compte-rendu par le médecin (ou le coordinateur), réalisation et envoi
// des clichés aussi par l'infirmier(e), catalogue par le coordinateur, lecture seule pour
// l'admin de holding. Facturée à la prescription, comme le laboratoire.
const READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const ORDER_ROLES = ["COORDINATOR", "MEDECIN"];
const PERFORM_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];
const REPORT_ROLES = ["COORDINATOR", "MEDECIN"];
const CATALOG_ROLES = ["COORDINATOR"];

async function requireUser(roles: string[], message = "Non autorisé.") {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");
  assertUserModule(activeUser, "IMAGERIE");
  if (!roles.includes(activeUser.role)) throw new Error(message);
  return activeUser;
}

function revalidateRadiology(organizationId: string, patientId?: string) {
  revalidatePath(`/dashboard/clinics/${organizationId}/imagerie`);
  if (patientId) revalidatePath(`/dashboard/patients/${patientId}`);
}

// --- Catalogue ---

export async function listRadiologyExams(clinicId: string, options: { includeInactive?: boolean } = {}) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    await assertClinicScope(clinicId, activeUser);
    const exams = await prisma.radiologyExam.findMany({
      where: { organizationId: clinicId, ...(options.includeInactive ? {} : { isActive: true }) },
      orderBy: [{ modality: "asc" }, { name: "asc" }],
    });
    return { success: true as const, data: exams };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du catalogue d'imagerie.") };
  }
}

const examSchema = z.object({
  id: z.string().min(1).optional(),
  clinicId: z.string().min(1),
  name: z.string().trim().min(2, "Nom de l'examen requis").max(120),
  modality: z.enum(RADIOLOGY_MODALITIES),
  basePrice: z.number().finite().min(0, "Le tarif ne peut pas être négatif"),
  isActive: z.boolean().optional(),
});

export async function upsertRadiologyExam(data: z.input<typeof examSchema>) {
  try {
    const input = examSchema.parse(data);
    const activeUser = await requireUser(CATALOG_ROLES, "Non autorisé. Le catalogue est géré par le coordinateur.");
    await assertClinicScope(input.clinicId, activeUser);

    let exam;
    if (input.id) {
      const existing = await prisma.radiologyExam.findUnique({ where: { id: input.id } });
      if (!existing || existing.organizationId !== input.clinicId) throw new Error("Examen introuvable.");
      exam = await prisma.radiologyExam.update({
        where: { id: input.id },
        data: { name: input.name, modality: input.modality, basePrice: input.basePrice, ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
      });
    } else {
      exam = await prisma.radiologyExam.create({
        data: { organizationId: input.clinicId, name: input.name, modality: input.modality, basePrice: input.basePrice },
      });
    }
    await logAuditAction(activeUser.id, input.id ? "UPDATE_RADIOLOGY_EXAM" : "CREATE_RADIOLOGY_EXAM", "RadiologyExam", exam.id, {
      name: input.name,
      basePrice: input.basePrice,
      isActive: exam.isActive,
    });
    revalidateRadiology(input.clinicId);
    return { success: true as const, data: exam };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'examen.") };
  }
}

// --- Prescription ---

const orderSchema = z.object({
  patientId: z.string().min(1),
  examIds: z.array(z.string().min(1)).min(1, "Sélectionnez au moins un examen").max(10),
  clinicalIndication: z.string().trim().max(1000).optional(),
  priority: z.enum(["ROUTINE", "URGENT"]).default("ROUTINE"),
  medicalRecordId: z.string().min(1).optional(),
});

export async function createRadiologyOrder(data: z.input<typeof orderSchema>) {
  try {
    const input = orderSchema.parse(data);
    const activeUser = await requireUser(ORDER_ROLES, "Non autorisé. Seul un médecin ou un coordinateur peut prescrire un examen d'imagerie.");
    if (!(await verifyPatientAccess(input.patientId, activeUser))) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }
    const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { organizationId: true } });
    if (!patient?.organizationId) throw new Error("Patient introuvable.");
    const organizationId = patient.organizationId;

    // Examens du catalogue de LA clinique du patient, actifs uniquement.
    const exams = await prisma.radiologyExam.findMany({ where: { id: { in: input.examIds }, organizationId, isActive: true } });
    if (exams.length !== new Set(input.examIds).size) throw new Error("Un examen sélectionné n'est plus disponible au catalogue.");
    const { snapshot, items } = snapshotExams(exams);

    const order = await prisma.$transaction(async (tx) => {
      const invoice = items.length
        ? await tx.pendingInvoice.create({
            data: {
              status: "PENDING",
              patientId: input.patientId,
              organizationId,
              medicalRecordId: input.medicalRecordId || null,
              items: items as unknown as Prisma.InputJsonValue,
              createdById: activeUser.id,
            },
          })
        : null;
      return tx.radiologyOrder.create({
        data: {
          patientId: input.patientId,
          organizationId,
          medicalRecordId: input.medicalRecordId || null,
          exams: snapshot as unknown as Prisma.InputJsonValue,
          clinicalIndication: input.clinicalIndication || null,
          priority: input.priority,
          pendingInvoiceId: invoice?.id ?? null,
          orderedById: activeUser.id,
        },
      });
    });

    await logAuditAction(activeUser.id, "CREATE_RADIOLOGY_ORDER", "RadiologyOrder", order.id, {
      patientId: input.patientId,
      exams: snapshot.map((e) => e.name),
    });
    revalidateRadiology(organizationId, input.patientId);
    revalidatePath("/dashboard/finance");
    return { success: true as const, data: { id: order.id, invoiceCreated: items.length > 0 } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la prescription de l'examen.") };
  }
}

// --- Circuit de l'examen ---

const ACTION_ROLES: Record<RadiologyAction, string[]> = {
  PERFORM: PERFORM_ROLES,
  REPORT: REPORT_ROLES,
  VALIDATE: REPORT_ROLES,
  CANCEL: ORDER_ROLES,
};

const transitionSchema = z.object({
  orderId: z.string().min(1),
  action: z.enum(["PERFORM", "REPORT", "VALIDATE", "CANCEL"]),
  notes: z.string().trim().max(1000).optional(),
  report: z.string().trim().max(10000).optional(),
  conclusion: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function updateRadiologyOrder(data: z.input<typeof transitionSchema>) {
  try {
    const input = transitionSchema.parse(data);
    const activeUser = await requireUser(ACTION_ROLES[input.action], "Non autorisé pour cette étape de l'examen.");

    const order = await prisma.radiologyOrder.findUnique({ where: { id: input.orderId } });
    if (!order) throw new Error("Examen introuvable.");
    if (!(await verifyPatientAccess(order.patientId, activeUser))) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    const next = nextRadiologyStatus(order.status, input.action);
    if (!next) throw new Error("Action impossible dans l'état actuel de l'examen. Rechargez la page.");

    const now = new Date();
    let changes: Prisma.RadiologyOrderUpdateManyMutationInput;
    if (input.action === "PERFORM") {
      changes = { performedById: activeUser.id, performedAt: now, performedNotes: input.notes || null };
    } else if (input.action === "REPORT") {
      if (!input.report || input.report.length < 10) throw new Error("Le compte-rendu est requis.");
      if (!input.conclusion) throw new Error("La conclusion est requise.");
      changes = { report: input.report, conclusion: input.conclusion, reportedById: activeUser.id, reportedAt: now };
    } else if (input.action === "VALIDATE") {
      changes = { validatedById: activeUser.id, validatedAt: now };
    } else {
      if (!input.reason) throw new Error("Le motif d'annulation est requis.");
      // Rien d'encaissé : la facture est clôturée avec l'examen. Déjà réglé (même en partie) :
      // l'annulation passe par la caisse (contrepassation), jamais en silence ici.
      if (order.pendingInvoiceId) {
        const paid = await prisma.financialTransaction.count({ where: { pendingInvoiceId: order.pendingInvoiceId } });
        if (paid > 0) throw new Error("Cet examen a déjà été (en partie) réglé : annulez d'abord le règlement à la caisse.");
      }
      changes = { cancelledById: activeUser.id, cancelledAt: now, cancelReason: input.reason };
    }

    // Conditionné au statut lu : deux validations simultanées ne peuvent pas toutes deux réussir.
    const claim = await prisma.radiologyOrder.updateMany({ where: { id: order.id, status: order.status }, data: { ...changes, status: next } });
    if (claim.count === 0) throw new Error("L'examen vient d'être modifié par un autre utilisateur. Rechargez la page.");

    if (input.action === "CANCEL" && order.pendingInvoiceId) {
      await prisma.pendingInvoice.updateMany({
        where: { id: order.pendingInvoiceId, status: "PENDING" },
        data: { status: "CANCELLED", closedAt: now, closedById: activeUser.id },
      });
    }

    await logAuditAction(activeUser.id, `RADIOLOGY_${input.action}`, "RadiologyOrder", order.id, { from: order.status, to: next });
    revalidateRadiology(order.organizationId, order.patientId);
    revalidatePath(`/dashboard/clinics/${order.organizationId}/imagerie/${order.id}`);
    return { success: true as const, data: { status: next } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la mise à jour de l'examen.") };
  }
}

// --- Lecture ---

async function namesById(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
}

export async function listRadiologyOrders(options: { clinicId?: string; patientId?: string; status?: string; page?: number }) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    const where: Prisma.RadiologyOrderWhereInput = {};
    if (options.patientId) {
      if (!(await verifyPatientAccess(options.patientId, activeUser))) throw new Error("Non autorisé.");
      where.patientId = options.patientId;
    } else if (options.clinicId) {
      await assertClinicScope(options.clinicId, activeUser);
      where.organizationId = options.clinicId;
    } else {
      throw new Error("Clinique ou patient requis.");
    }
    if (options.status && options.status !== "ALL") where.status = options.status;

    const { page, pageSize, skip, take } = resolvePage({ page: options.page });
    const [orders, total] = await Promise.all([
      prisma.radiologyOrder.findMany({ where, orderBy: [{ createdAt: "desc" }], skip, take }),
      prisma.radiologyOrder.count({ where }),
    ]);
    const patients = await prisma.patient.findMany({
      where: { id: { in: [...new Set(orders.map((o) => o.patientId))] } },
      select: { id: true, ipp: true, user: { select: { firstName: true, lastName: true } } },
    });
    const patientById = new Map(patients.map((p) => [p.id, p]));
    const names = await namesById(orders.map((o) => o.orderedById));

    return {
      success: true as const,
      total,
      page,
      pageSize,
      data: orders.map((o) => {
        const p = patientById.get(o.patientId);
        return {
          id: o.id,
          patientId: o.patientId,
          patientName: p?.user ? `${p.user.lastName} ${p.user.firstName}` : "Patient",
          ipp: p?.ipp ?? null,
          exams: (o.exams as unknown as RadiologyExamSnapshot[]) || [],
          status: o.status,
          priority: o.priority,
          orderedBy: names.get(o.orderedById) ?? null,
          createdAt: o.createdAt.toISOString(),
        };
      }),
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des examens d'imagerie.") };
  }
}

export async function getRadiologyOrder(orderId: string) {
  try {
    z.string().min(1).parse(orderId);
    const activeUser = await requireUser(READ_ROLES);
    const order = await prisma.radiologyOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Examen introuvable.");
    if (!(await verifyPatientAccess(order.patientId, activeUser))) throw new Error("Non autorisé.");

    const [patient, organization, invoice, names] = await Promise.all([
      prisma.patient.findUnique({
        where: { id: order.patientId },
        select: { id: true, ipp: true, sex: true, dateOfBirth: true, allergies: true, user: { select: { firstName: true, lastName: true } } },
      }),
      prisma.organization.findUnique({ where: { id: order.organizationId }, select: { name: true, logoUrl: true } }),
      order.pendingInvoiceId ? prisma.pendingInvoice.findUnique({ where: { id: order.pendingInvoiceId }, select: { status: true } }) : null,
      namesById([order.orderedById, order.performedById, order.reportedById, order.validatedById, order.cancelledById]),
    ]);

    return {
      success: true as const,
      data: {
        ...order,
        exams: (order.exams as unknown as RadiologyExamSnapshot[]) || [],
        createdAt: order.createdAt.toISOString(),
        performedAt: order.performedAt?.toISOString() ?? null,
        reportedAt: order.reportedAt?.toISOString() ?? null,
        validatedAt: order.validatedAt?.toISOString() ?? null,
        cancelledAt: order.cancelledAt?.toISOString() ?? null,
        updatedAt: order.updatedAt.toISOString(),
        patient: patient ? { ...patient, dateOfBirth: patient.dateOfBirth.toISOString() } : null,
        organization,
        invoiceStatus: invoice?.status ?? null,
        orderedByName: names.get(order.orderedById) ?? null,
        performedByName: order.performedById ? names.get(order.performedById) ?? null : null,
        reportedByName: order.reportedById ? names.get(order.reportedById) ?? null : null,
        validatedByName: order.validatedById ? names.get(order.validatedById) ?? null : null,
        cancelledByName: order.cancelledById ? names.get(order.cancelledById) ?? null : null,
        permissions: {
          perform: PERFORM_ROLES.includes(activeUser.role),
          report: REPORT_ROLES.includes(activeUser.role),
          cancel: ORDER_ROLES.includes(activeUser.role),
          upload: PERFORM_ROLES.includes(activeUser.role),
        },
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de l'examen.") };
  }
}
