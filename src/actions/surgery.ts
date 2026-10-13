"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { assertClinicScope } from "@/lib/clinic-scope";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { clinicDateKey, clinicDateTimeToUtc } from "@/lib/clinic-day";
import {
  ANESTHESIA_TYPES,
  BLOCKING_SURGERY_STATUSES,
  CHECKLIST_PHASES,
  LATERALITIES,
  MAX_SURGERY_MINUTES,
  MIN_SURGERY_MINUTES,
  phaseBlocker,
  readChecklist,
  surgeryTransition,
  validatePhaseAnswers,
} from "@/lib/surgery";

// Bloc opératoire (étape E1 de l'audit d'évolution), sans rôle dédié : le médecin (chirurgien ou
// anesthésiste) ou le coordinateur programme et opère ; l'infirmier(e) — panseuse — signe la
// check-list ; le coordinateur gère les salles ; l'admin de holding consulte. Facturé à la
// programmation (forfait), comme l'imagerie.
const READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const SCHEDULE_ROLES = ["COORDINATOR", "MEDECIN"];
const CHECKLIST_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];
const ROOM_ROLES = ["COORDINATOR"];
const SURGEON_ROLES = ["COORDINATOR", "MEDECIN"];
const NURSE_ROLES = ["CAREGIVER"];

async function requireUser(roles: string[], message = "Non autorisé.") {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");
  if (!roles.includes(activeUser.role)) throw new Error(message);
  return activeUser;
}

function revalidateSurgery(organizationId: string, caseId?: string) {
  revalidatePath(`/dashboard/clinics/${organizationId}/bloc`);
  if (caseId) revalidatePath(`/dashboard/clinics/${organizationId}/bloc/${caseId}`);
}

// --- Salles ---

export async function listOperatingRooms(clinicId: string, options: { includeInactive?: boolean } = {}) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    await assertClinicScope(clinicId, activeUser);
    const rooms = await prisma.operatingRoom.findMany({
      where: { organizationId: clinicId, ...(options.includeInactive ? {} : { isActive: true }) },
      orderBy: { name: "asc" },
    });
    return { success: true as const, data: rooms };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des salles.") };
  }
}

const roomSchema = z.object({
  id: z.string().min(1).optional(),
  clinicId: z.string().min(1),
  name: z.string().trim().min(1, "Nom de la salle requis").max(60),
  isActive: z.boolean().optional(),
});

export async function upsertOperatingRoom(data: z.input<typeof roomSchema>) {
  try {
    const input = roomSchema.parse(data);
    const activeUser = await requireUser(ROOM_ROLES, "Non autorisé. Les salles sont gérées par le coordinateur.");
    await assertClinicScope(input.clinicId, activeUser);

    const duplicate = await prisma.operatingRoom.findFirst({ where: { organizationId: input.clinicId, name: input.name, ...(input.id ? { id: { not: input.id } } : {}) } });
    if (duplicate) throw new Error("Une salle porte déjà ce nom.");

    let room;
    if (input.id) {
      const existing = await prisma.operatingRoom.findUnique({ where: { id: input.id } });
      if (!existing || existing.organizationId !== input.clinicId) throw new Error("Salle introuvable.");
      room = await prisma.operatingRoom.update({ where: { id: input.id }, data: { name: input.name, ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) } });
    } else {
      room = await prisma.operatingRoom.create({ data: { organizationId: input.clinicId, name: input.name } });
    }
    await logAuditAction(activeUser.id, input.id ? "UPDATE_OPERATING_ROOM" : "CREATE_OPERATING_ROOM", "OperatingRoom", room.id, { name: room.name, isActive: room.isActive });
    revalidateSurgery(input.clinicId);
    return { success: true as const, data: room };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement de la salle.") };
  }
}

// --- Équipe ---

export async function listSurgeryStaff(clinicId: string) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    await assertClinicScope(clinicId, activeUser);
    const users = await prisma.user.findMany({
      where: { organizationId: clinicId, isActive: true, role: { in: ["COORDINATOR", "MEDECIN", "CAREGIVER"] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const toOption = (u: (typeof users)[number]) => ({ id: u.id, name: `${u.lastName} ${u.firstName}` });
    return {
      success: true as const,
      data: {
        doctors: users.filter((u) => SURGEON_ROLES.includes(u.role)).map(toOption),
        nurses: users.filter((u) => NURSE_ROLES.includes(u.role)).map(toOption),
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de l'équipe.") };
  }
}

async function assertTeamMember(userId: string | null | undefined, organizationId: string, roles: string[], label: string) {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, organizationId: true, isActive: true } });
  if (!user || user.organizationId !== organizationId || !user.isActive || !roles.includes(user.role)) {
    throw new Error(`${label} invalide pour cette clinique.`);
  }
}

// Interventions qui occuperaient la même salle ou la même personne sur le même créneau.
async function findConflicts(params: {
  organizationId: string;
  operatingRoomId: string;
  start: Date;
  end: Date;
  people: (string | null | undefined)[];
  excludeId?: string;
}) {
  const people = [...new Set(params.people.filter((p): p is string => !!p))];
  const conflicts = await prisma.surgeryCase.findMany({
    where: {
      organizationId: params.organizationId,
      status: { in: BLOCKING_SURGERY_STATUSES },
      scheduledStart: { lt: params.end },
      scheduledEnd: { gt: params.start },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      OR: [
        { operatingRoomId: params.operatingRoomId },
        { surgeonId: { in: people } },
        { anesthetistId: { in: people } },
        { scrubNurseId: { in: people } },
      ],
    },
    select: { id: true, procedure: true, operatingRoomId: true, scheduledStart: true },
  });
  return conflicts;
}

function conflictMessage(conflicts: { operatingRoomId: string; procedure: string }[], operatingRoomId: string) {
  const sameRoom = conflicts.some((c) => c.operatingRoomId === operatingRoomId);
  return sameRoom
    ? `Créneau déjà occupé dans cette salle (« ${conflicts[0].procedure} »).`
    : `Un membre de l'équipe est déjà programmé sur ce créneau (« ${conflicts[0].procedure} »).`;
}

const slotSchema = {
  operatingRoomId: z.string().min(1, "Salle requise"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide"),
  durationMinutes: z.number().int().min(MIN_SURGERY_MINUTES, "Durée trop courte").max(MAX_SURGERY_MINUTES, "Durée trop longue"),
};

function resolveSlot(input: { date: string; time: string; durationMinutes: number }) {
  const start = clinicDateTimeToUtc(input.date, input.time);
  if (Number.isNaN(start.getTime())) throw new Error("Date ou heure invalide.");
  // Une urgence opérée avant d'être saisie reste enregistrable, pas une programmation passée.
  if (start.getTime() < Date.now() - 12 * 3600 * 1000) throw new Error("Impossible de programmer une intervention dans le passé.");
  return { start, end: new Date(start.getTime() + input.durationMinutes * 60000) };
}

const scheduleSchema = z.object({
  patientId: z.string().min(1),
  ...slotSchema,
  procedure: z.string().trim().min(3, "Intervention requise").max(200),
  indication: z.string().trim().max(1000).optional(),
  laterality: z.enum(LATERALITIES).default("NA"),
  anesthesiaType: z.enum(ANESTHESIA_TYPES),
  priority: z.enum(["SCHEDULED", "URGENT"]).default("SCHEDULED"),
  surgeonId: z.string().min(1, "Chirurgien requis"),
  anesthetistId: z.string().min(1).optional(),
  scrubNurseId: z.string().min(1).optional(),
  fee: z.number().finite().min(0, "Le forfait ne peut pas être négatif").default(0),
});

export async function scheduleSurgery(data: z.input<typeof scheduleSchema>) {
  try {
    const input = scheduleSchema.parse(data);
    const activeUser = await requireUser(SCHEDULE_ROLES, "Non autorisé. Seul un médecin ou un coordinateur programme une intervention.");
    if (!(await verifyPatientAccess(input.patientId, activeUser))) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }
    const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { organizationId: true } });
    if (!patient?.organizationId) throw new Error("Patient introuvable.");
    const organizationId = patient.organizationId;

    const room = await prisma.operatingRoom.findUnique({ where: { id: input.operatingRoomId } });
    if (!room || room.organizationId !== organizationId || !room.isActive) throw new Error("Salle d'opération invalide.");
    if (input.anesthetistId && input.anesthetistId === input.surgeonId) throw new Error("Le chirurgien et l'anesthésiste doivent être deux personnes différentes.");
    await assertTeamMember(input.surgeonId, organizationId, SURGEON_ROLES, "Chirurgien");
    await assertTeamMember(input.anesthetistId, organizationId, SURGEON_ROLES, "Anesthésiste");
    await assertTeamMember(input.scrubNurseId, organizationId, NURSE_ROLES, "Infirmier(e) de bloc");

    const { start, end } = resolveSlot(input);
    const people = [input.surgeonId, input.anesthetistId, input.scrubNurseId];
    const conflicts = await findConflicts({ organizationId, operatingRoomId: room.id, start, end, people });
    if (conflicts.length) throw new Error(conflictMessage(conflicts, room.id));

    const created = await prisma.$transaction(async (tx) => {
      const invoice =
        input.fee > 0
          ? await tx.pendingInvoice.create({
              data: {
                status: "PENDING",
                patientId: input.patientId,
                organizationId,
                items: [{ type: "SERVICE", description: `Bloc opératoire : ${input.procedure}`, quantity: 1, unitPrice: input.fee, amount: input.fee }] as unknown as Prisma.InputJsonValue,
                createdById: activeUser.id,
              },
            })
          : null;
      return tx.surgeryCase.create({
        data: {
          organizationId,
          patientId: input.patientId,
          operatingRoomId: room.id,
          procedure: input.procedure,
          indication: input.indication || null,
          laterality: input.laterality,
          anesthesiaType: input.anesthesiaType,
          priority: input.priority,
          scheduledStart: start,
          scheduledEnd: end,
          surgeonId: input.surgeonId,
          anesthetistId: input.anesthetistId || null,
          scrubNurseId: input.scrubNurseId || null,
          fee: input.fee,
          pendingInvoiceId: invoice?.id ?? null,
          createdById: activeUser.id,
        },
      });
    });

    // Deux programmations simultanées sur le même créneau passent toutes deux le contrôle
    // ci-dessus : on revérifie après écriture et on retire la sienne en cas de collision.
    const lateConflicts = await findConflicts({ organizationId, operatingRoomId: room.id, start, end, people, excludeId: created.id });
    if (lateConflicts.length) {
      await prisma.surgeryCase.delete({ where: { id: created.id } });
      if (created.pendingInvoiceId) await prisma.pendingInvoice.delete({ where: { id: created.pendingInvoiceId } });
      throw new Error(conflictMessage(lateConflicts, room.id));
    }

    await logAuditAction(activeUser.id, "SCHEDULE_SURGERY", "SurgeryCase", created.id, {
      patientId: input.patientId,
      procedure: input.procedure,
      start: start.toISOString(),
      fee: input.fee,
    });
    revalidateSurgery(organizationId);
    revalidatePath("/dashboard/finance");
    return { success: true as const, data: { id: created.id, date: clinicDateKey(start) } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la programmation de l'intervention.") };
  }
}

const rescheduleSchema = z.object({ caseId: z.string().min(1), ...slotSchema });

export async function rescheduleSurgery(data: z.input<typeof rescheduleSchema>) {
  try {
    const input = rescheduleSchema.parse(data);
    const activeUser = await requireUser(SCHEDULE_ROLES, "Non autorisé.");
    const surgery = await prisma.surgeryCase.findUnique({ where: { id: input.caseId } });
    if (!surgery) throw new Error("Intervention introuvable.");
    if (!(await verifyPatientAccess(surgery.patientId, activeUser))) throw new Error("Non autorisé.");
    if (surgery.status !== "SCHEDULED") throw new Error("Seule une intervention programmée (non commencée) peut être déplacée.");

    const room = await prisma.operatingRoom.findUnique({ where: { id: input.operatingRoomId } });
    if (!room || room.organizationId !== surgery.organizationId || !room.isActive) throw new Error("Salle d'opération invalide.");
    const { start, end } = resolveSlot(input);
    const people = [surgery.surgeonId, surgery.anesthetistId, surgery.scrubNurseId];
    const slot = { organizationId: surgery.organizationId, operatingRoomId: room.id, start, end, people, excludeId: surgery.id };
    const conflicts = await findConflicts(slot);
    if (conflicts.length) throw new Error(conflictMessage(conflicts, room.id));

    const claim = await prisma.surgeryCase.updateMany({
      where: { id: surgery.id, status: "SCHEDULED", updatedAt: surgery.updatedAt },
      data: { operatingRoomId: room.id, scheduledStart: start, scheduledEnd: end },
    });
    if (claim.count === 0) throw new Error("L'intervention vient d'être modifiée par un autre utilisateur. Rechargez la page.");

    const lateConflicts = await findConflicts(slot);
    if (lateConflicts.length) {
      await prisma.surgeryCase.update({
        where: { id: surgery.id },
        data: { operatingRoomId: surgery.operatingRoomId, scheduledStart: surgery.scheduledStart, scheduledEnd: surgery.scheduledEnd },
      });
      throw new Error(conflictMessage(lateConflicts, room.id));
    }

    await logAuditAction(activeUser.id, "RESCHEDULE_SURGERY", "SurgeryCase", surgery.id, {
      from: { room: surgery.operatingRoomId, start: surgery.scheduledStart.toISOString() },
      to: { room: room.id, start: start.toISOString() },
    });
    revalidateSurgery(surgery.organizationId, surgery.id);
    return { success: true as const, data: { date: clinicDateKey(start) } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du déplacement de l'intervention.") };
  }
}

// --- Check-list de sécurité ---

const checklistSchema = z.object({
  caseId: z.string().min(1),
  phase: z.enum(CHECKLIST_PHASES),
  answers: z.record(z.string(), z.enum(["YES", "NA"])),
  notes: z.string().trim().max(1000).optional(),
});

export async function signChecklistPhase(data: z.input<typeof checklistSchema>) {
  try {
    const input = checklistSchema.parse(data);
    const activeUser = await requireUser(CHECKLIST_ROLES, "Non autorisé. La check-list est signée par l'équipe du bloc.");
    const surgery = await prisma.surgeryCase.findUnique({ where: { id: input.caseId } });
    if (!surgery) throw new Error("Intervention introuvable.");
    if (!(await verifyPatientAccess(surgery.patientId, activeUser))) throw new Error("Non autorisé.");

    const checklist = readChecklist(surgery.checklist);
    const blocker = phaseBlocker(input.phase, surgery.status, checklist);
    if (blocker) throw new Error(blocker);
    const invalid = validatePhaseAnswers(input.phase, input.answers);
    if (invalid) throw new Error(invalid);

    const next = {
      ...checklist,
      [input.phase]: { answers: input.answers, notes: input.notes || null, checkedById: activeUser.id, checkedAt: new Date().toISOString() },
    };
    // Conditionné à la version lue : deux signatures simultanées ne s'écrasent pas.
    const claim = await prisma.surgeryCase.updateMany({
      where: { id: surgery.id, status: surgery.status, updatedAt: surgery.updatedAt },
      data: { checklist: next as unknown as Prisma.InputJsonValue },
    });
    if (claim.count === 0) throw new Error("L'intervention vient d'être modifiée par un autre utilisateur. Rechargez la page.");

    await logAuditAction(activeUser.id, "SIGN_SURGERY_CHECKLIST", "SurgeryCase", surgery.id, { phase: input.phase, answers: input.answers });
    revalidateSurgery(surgery.organizationId, surgery.id);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la signature de la check-list.") };
  }
}

// --- Déroulement ---

const reportFields = {
  operativeReport: z.string().trim().max(10000).optional(),
  complications: z.string().trim().max(2000).optional(),
  postOpInstructions: z.string().trim().max(2000).optional(),
};

function requireReport(input: { operativeReport?: string; postOpInstructions?: string }) {
  if (!input.operativeReport || input.operativeReport.length < 20) throw new Error("Le compte-rendu opératoire est requis (20 caractères minimum).");
  if (!input.postOpInstructions) throw new Error("Les consignes post-opératoires sont requises.");
}

// Le compte-rendu est rédigé par le chirurgien de l'intervention (ou le coordinateur).
function assertReportAuthor(activeUser: { id: string; role: string }, surgeonId: string) {
  if (activeUser.role !== "COORDINATOR" && activeUser.id !== surgeonId) {
    throw new Error("Seul le chirurgien de l'intervention (ou le coordinateur) rédige le compte-rendu opératoire.");
  }
}

const statusSchema = z.object({
  caseId: z.string().min(1),
  action: z.enum(["START", "COMPLETE", "CANCEL"]),
  reason: z.string().trim().max(500).optional(),
  ...reportFields,
});

export async function updateSurgeryStatus(data: z.input<typeof statusSchema>) {
  try {
    const input = statusSchema.parse(data);
    const activeUser = await requireUser(SCHEDULE_ROLES, "Non autorisé pour cette étape de l'intervention.");
    const surgery = await prisma.surgeryCase.findUnique({ where: { id: input.caseId } });
    if (!surgery) throw new Error("Intervention introuvable.");
    if (!(await verifyPatientAccess(surgery.patientId, activeUser))) throw new Error("Non autorisé.");

    const transition = surgeryTransition(surgery.status, input.action, readChecklist(surgery.checklist));
    if ("error" in transition) throw new Error(transition.error);

    const now = new Date();
    let changes: Prisma.SurgeryCaseUpdateManyMutationInput;
    if (input.action === "START") {
      changes = { actualStart: now };
    } else if (input.action === "COMPLETE") {
      assertReportAuthor(activeUser, surgery.surgeonId);
      requireReport(input);
      changes = {
        actualEnd: now,
        operativeReport: input.operativeReport,
        complications: input.complications || null,
        postOpInstructions: input.postOpInstructions,
        reportedById: activeUser.id,
        reportedAt: now,
      };
    } else {
      if (!input.reason) throw new Error("Le motif d'annulation est requis.");
      // Rien d'encaissé : la facture est clôturée avec l'intervention. Déjà réglé (même en
      // partie) : l'annulation passe par la caisse (contrepassation), jamais en silence ici.
      if (surgery.pendingInvoiceId) {
        const paid = await prisma.financialTransaction.count({ where: { pendingInvoiceId: surgery.pendingInvoiceId } });
        if (paid > 0) throw new Error("Cette intervention a déjà été (en partie) réglée : annulez d'abord le règlement à la caisse.");
      }
      changes = { cancelledById: activeUser.id, cancelledAt: now, cancelReason: input.reason };
    }

    const claim = await prisma.surgeryCase.updateMany({ where: { id: surgery.id, status: surgery.status }, data: { ...changes, status: transition.next } });
    if (claim.count === 0) throw new Error("L'intervention vient d'être modifiée par un autre utilisateur. Rechargez la page.");

    if (input.action === "CANCEL" && surgery.pendingInvoiceId) {
      await prisma.pendingInvoice.updateMany({
        where: { id: surgery.pendingInvoiceId, status: "PENDING" },
        data: { status: "CANCELLED", closedAt: now, closedById: activeUser.id },
      });
    }

    await logAuditAction(activeUser.id, `SURGERY_${input.action}`, "SurgeryCase", surgery.id, { from: surgery.status, to: transition.next });
    revalidateSurgery(surgery.organizationId, surgery.id);
    if (input.action === "CANCEL") revalidatePath("/dashboard/finance");
    return { success: true as const, data: { status: transition.next } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la mise à jour de l'intervention.") };
  }
}

const amendSchema = z.object({ caseId: z.string().min(1), ...reportFields });

// Correction du compte-rendu d'une intervention terminée — l'ancienne version reste dans le
// journal d'audit.
export async function amendOperativeReport(data: z.input<typeof amendSchema>) {
  try {
    const input = amendSchema.parse(data);
    const activeUser = await requireUser(SCHEDULE_ROLES, "Non autorisé.");
    const surgery = await prisma.surgeryCase.findUnique({ where: { id: input.caseId } });
    if (!surgery) throw new Error("Intervention introuvable.");
    if (!(await verifyPatientAccess(surgery.patientId, activeUser))) throw new Error("Non autorisé.");
    if (surgery.status !== "COMPLETED") throw new Error("Seul le compte-rendu d'une intervention terminée se corrige.");
    assertReportAuthor(activeUser, surgery.surgeonId);
    requireReport(input);

    await prisma.surgeryCase.update({
      where: { id: surgery.id },
      data: { operativeReport: input.operativeReport, complications: input.complications || null, postOpInstructions: input.postOpInstructions, reportedById: activeUser.id, reportedAt: new Date() },
    });
    await logAuditAction(activeUser.id, "AMEND_OPERATIVE_REPORT", "SurgeryCase", surgery.id, {
      previous: { operativeReport: surgery.operativeReport, complications: surgery.complications, postOpInstructions: surgery.postOpInstructions },
    });
    revalidateSurgery(surgery.organizationId, surgery.id);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la correction du compte-rendu.") };
  }
}

// --- Lecture ---

async function namesById(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
}

// Programme d'une journée (heure de la clinique) : salles actives et interventions qui y
// débordent, y compris celles commencées la veille.
export async function listSurgeryDay(clinicId: string, dateKey: string = clinicDateKey()) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    await assertClinicScope(clinicId, activeUser);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Date invalide.");
    const dayStart = clinicDateTimeToUtc(dateKey, "00:00");
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    const [rooms, cases] = await Promise.all([
      prisma.operatingRoom.findMany({ where: { organizationId: clinicId }, orderBy: { name: "asc" } }),
      prisma.surgeryCase.findMany({
        where: { organizationId: clinicId, scheduledStart: { lt: dayEnd }, scheduledEnd: { gt: dayStart } },
        orderBy: { scheduledStart: "asc" },
      }),
    ]);
    const patients = await prisma.patient.findMany({
      where: { id: { in: [...new Set(cases.map((c) => c.patientId))] } },
      select: { id: true, ipp: true, user: { select: { firstName: true, lastName: true } } },
    });
    const patientById = new Map(patients.map((p) => [p.id, p]));
    const names = await namesById(cases.flatMap((c) => [c.surgeonId, c.anesthetistId, c.scrubNurseId]));

    return {
      success: true as const,
      data: {
        date: dateKey,
        rooms: rooms.filter((r) => r.isActive || cases.some((c) => c.operatingRoomId === r.id)).map((r) => ({ id: r.id, name: r.name, isActive: r.isActive })),
        cases: cases.map((c) => {
          const p = patientById.get(c.patientId);
          const checklist = readChecklist(c.checklist);
          return {
            id: c.id,
            operatingRoomId: c.operatingRoomId,
            patientId: c.patientId,
            patientName: p?.user ? `${p.user.lastName} ${p.user.firstName}` : "Patient",
            ipp: p?.ipp ?? null,
            procedure: c.procedure,
            laterality: c.laterality,
            priority: c.priority,
            status: c.status,
            scheduledStart: c.scheduledStart.toISOString(),
            scheduledEnd: c.scheduledEnd.toISOString(),
            surgeonName: names.get(c.surgeonId) ?? null,
            anesthetistName: c.anesthetistId ? names.get(c.anesthetistId) ?? null : null,
            scrubNurseName: c.scrubNurseId ? names.get(c.scrubNurseId) ?? null : null,
            checklistDone: CHECKLIST_PHASES.filter((ph) => checklist[ph]).length,
          };
        }),
        canSchedule: SCHEDULE_ROLES.includes(activeUser.role),
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du programme opératoire.") };
  }
}

export async function getSurgeryCase(caseId: string) {
  try {
    z.string().min(1).parse(caseId);
    const activeUser = await requireUser(READ_ROLES);
    const surgery = await prisma.surgeryCase.findUnique({ where: { id: caseId } });
    if (!surgery) throw new Error("Intervention introuvable.");
    if (!(await verifyPatientAccess(surgery.patientId, activeUser))) throw new Error("Non autorisé.");

    const checklist = readChecklist(surgery.checklist);
    const [patient, organization, room, invoice, names] = await Promise.all([
      prisma.patient.findUnique({
        where: { id: surgery.patientId },
        select: { id: true, ipp: true, sex: true, dateOfBirth: true, allergies: true, bloodType: true, user: { select: { firstName: true, lastName: true } } },
      }),
      prisma.organization.findUnique({ where: { id: surgery.organizationId }, select: { name: true, logoUrl: true } }),
      prisma.operatingRoom.findUnique({ where: { id: surgery.operatingRoomId }, select: { name: true } }),
      surgery.pendingInvoiceId ? prisma.pendingInvoice.findUnique({ where: { id: surgery.pendingInvoiceId }, select: { status: true } }) : null,
      namesById([
        surgery.surgeonId,
        surgery.anesthetistId,
        surgery.scrubNurseId,
        surgery.reportedById,
        surgery.cancelledById,
        surgery.createdById,
        ...CHECKLIST_PHASES.map((ph) => checklist[ph]?.checkedById),
      ]),
    ]);
    const isSurgeonOrCoordinator = activeUser.role === "COORDINATOR" || activeUser.id === surgery.surgeonId;

    return {
      success: true as const,
      data: {
        id: surgery.id,
        organizationId: surgery.organizationId,
        procedure: surgery.procedure,
        indication: surgery.indication,
        laterality: surgery.laterality,
        anesthesiaType: surgery.anesthesiaType,
        priority: surgery.priority,
        status: surgery.status,
        fee: surgery.fee,
        operatingRoomId: surgery.operatingRoomId,
        roomName: room?.name ?? null,
        scheduledStart: surgery.scheduledStart.toISOString(),
        scheduledEnd: surgery.scheduledEnd.toISOString(),
        actualStart: surgery.actualStart?.toISOString() ?? null,
        actualEnd: surgery.actualEnd?.toISOString() ?? null,
        operativeReport: surgery.operativeReport,
        complications: surgery.complications,
        postOpInstructions: surgery.postOpInstructions,
        reportedAt: surgery.reportedAt?.toISOString() ?? null,
        reportedByName: surgery.reportedById ? names.get(surgery.reportedById) ?? null : null,
        cancelReason: surgery.cancelReason,
        cancelledAt: surgery.cancelledAt?.toISOString() ?? null,
        cancelledByName: surgery.cancelledById ? names.get(surgery.cancelledById) ?? null : null,
        createdByName: names.get(surgery.createdById) ?? null,
        surgeonName: names.get(surgery.surgeonId) ?? null,
        anesthetistName: surgery.anesthetistId ? names.get(surgery.anesthetistId) ?? null : null,
        scrubNurseName: surgery.scrubNurseId ? names.get(surgery.scrubNurseId) ?? null : null,
        checklist: Object.fromEntries(
          CHECKLIST_PHASES.filter((ph) => checklist[ph]).map((ph) => {
            const rec = checklist[ph]!;
            return [ph, { ...rec, checkedByName: names.get(rec.checkedById) ?? null }];
          })
        ) as Partial<Record<(typeof CHECKLIST_PHASES)[number], { answers: Record<string, "YES" | "NA">; notes: string | null; checkedAt: string; checkedByName: string | null }>>,
        patient: patient ? { ...patient, dateOfBirth: patient.dateOfBirth.toISOString() } : null,
        organization,
        invoiceStatus: invoice?.status ?? null,
        permissions: {
          schedule: SCHEDULE_ROLES.includes(activeUser.role),
          checklist: CHECKLIST_ROLES.includes(activeUser.role),
          report: SCHEDULE_ROLES.includes(activeUser.role) && isSurgeonOrCoordinator,
        },
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de l'intervention.") };
  }
}

export async function listPatientSurgeries(patientId: string) {
  try {
    z.string().min(1).parse(patientId);
    const activeUser = await requireUser(READ_ROLES);
    if (!(await verifyPatientAccess(patientId, activeUser))) throw new Error("Non autorisé.");
    const cases = await prisma.surgeryCase.findMany({ where: { patientId }, orderBy: { scheduledStart: "desc" }, take: 50 });
    const names = await namesById(cases.map((c) => c.surgeonId));
    return {
      success: true as const,
      data: cases.map((c) => ({
        id: c.id,
        organizationId: c.organizationId,
        procedure: c.procedure,
        status: c.status,
        scheduledStart: c.scheduledStart.toISOString(),
        surgeonName: names.get(c.surgeonId) ?? null,
      })),
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des interventions.") };
  }
}
