"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertClinicScope } from "@/lib/clinic-scope";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { clinicDateKey } from "@/lib/clinic-day";
import { formatTicket, ACTIVE_VISIT_STATUSES } from "@/lib/visits";
import { VITAL_BOUNDS, compareEmergency, isPlausibleBloodPressure } from "@/lib/triage";
import { assertUserModule } from "@/lib/modules-server";

// Tri des urgences (étape D2 de l'audit d'évolution) sur les passages de l'accueil orientés
// « Urgences ». Tri par le personnel soignant ; lecture aussi pour l'admin de holding.
const READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const TRIAGE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

const bounded = (key: keyof typeof VITAL_BOUNDS, label: string, integer = false) => {
  const [min, max] = VITAL_BOUNDS[key];
  const base = integer ? z.number().int() : z.number();
  return base.min(min, `${label} invraisemblable`).max(max, `${label} invraisemblable`).optional();
};

const triageSchema = z.object({
  visitId: z.string().min(1),
  level: z.number().int().min(1).max(5),
  chiefComplaint: z.string().trim().min(3, "Motif de recours requis").max(300),
  temperature: bounded("temperature", "Température"),
  bloodPressure: z
    .string()
    .trim()
    .refine((v) => v === "" || isPlausibleBloodPressure(v), "Tension invraisemblable (format attendu : 120/80)")
    .optional(),
  heartRate: bounded("heartRate", "Fréquence cardiaque", true),
  respiratoryRate: bounded("respiratoryRate", "Fréquence respiratoire", true),
  oxygenSaturation: bounded("oxygenSaturation", "Saturation", true),
  bloodSugar: bounded("bloodSugar", "Glycémie"),
  painScore: bounded("painScore", "Douleur (EVA)", true),
  glasgow: bounded("glasgow", "Score de Glasgow", true),
  notes: z.string().trim().max(1000).optional(),
});

export async function triageVisit(data: z.input<typeof triageSchema>) {
  try {
    const input = triageSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "URGENCES");
    if (!TRIAGE_ROLES.includes(activeUser.role)) throw new Error("Non autorisé. Le tri est réservé au personnel soignant.");

    const visit = await prisma.visit.findUnique({ where: { id: input.visitId } });
    if (!visit) throw new Error("Passage introuvable.");
    await assertClinicScope(visit.organizationId, activeUser);
    if (visit.destination !== "EMERGENCY") throw new Error("Seuls les passages orientés aux urgences sont triés.");
    if (!ACTIVE_VISIT_STATUSES.includes(visit.status as (typeof ACTIVE_VISIT_STATUSES)[number])) {
      throw new Error("Ce passage est terminé : il ne peut plus être trié.");
    }

    const bloodPressure = input.bloodPressure ? input.bloodPressure.replace(/\s/g, "") : null;
    const vitals = {
      temperature: input.temperature ?? null,
      bloodPressure,
      heartRate: input.heartRate ?? null,
      oxygenSaturation: input.oxygenSaturation ?? null,
      bloodSugar: input.bloodSugar ?? null,
      painScore: input.painScore ?? null,
    };
    const hasVitals = Object.values(vitals).some((v) => v != null);
    const now = new Date();

    const triage = await prisma.$transaction(async (tx) => {
      // Les constantes du tri alimentent aussi le dossier du patient.
      const vitalSign = hasVitals
        ? await tx.vitalSign.create({ data: { patientId: visit.patientId, recordedById: activeUser.id, ...vitals, notes: "Relevé au tri des urgences" } })
        : null;
      const created = await tx.emergencyTriage.create({
        data: {
          visitId: visit.id,
          patientId: visit.patientId,
          organizationId: visit.organizationId,
          level: input.level,
          chiefComplaint: input.chiefComplaint,
          ...vitals,
          respiratoryRate: input.respiratoryRate ?? null,
          glasgow: input.glasgow ?? null,
          notes: input.notes || null,
          vitalSignId: vitalSign?.id ?? null,
          triagedById: activeUser.id,
          triagedAt: now,
        },
      });
      // Niveaux 1-2 : passent aussi en tête de la file générale de l'accueil.
      await tx.visit.update({
        where: { id: visit.id },
        data: { triageLevel: input.level, triagedAt: now, ...(input.level <= 2 ? { priority: "URGENT" } : {}) },
      });
      return created;
    });

    await logAuditAction(activeUser.id, "TRIAGE_VISIT", "Visit", visit.id, { level: input.level, previousLevel: visit.triageLevel ?? null });
    revalidatePath(`/dashboard/clinics/${visit.organizationId}/urgences`);
    revalidatePath(`/dashboard/clinics/${visit.organizationId}/accueil`);
    return { success: true as const, data: { id: triage.id } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement du tri.") };
  }
}

// Tableau des urgences du jour : passages orientés « Urgences », avec leur dernière fiche de tri.
export async function listEmergencyBoard(clinicId: string) {
  try {
    z.string().min(1).parse(clinicId);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "URGENCES");
    if (!READ_ROLES.includes(activeUser.role)) throw new Error("Non autorisé.");
    await assertClinicScope(clinicId, activeUser);

    const visits = await prisma.visit.findMany({ where: { organizationId: clinicId, visitDate: clinicDateKey(), destination: "EMERGENCY" } });
    const ids = visits.map((v) => v.id);
    const [patients, triages] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: [...new Set(visits.map((v) => v.patientId))] } },
        select: { id: true, ipp: true, sex: true, dateOfBirth: true, allergies: true, user: { select: { firstName: true, lastName: true } } },
      }),
      ids.length ? prisma.emergencyTriage.findMany({ where: { visitId: { in: ids } }, orderBy: { triagedAt: "desc" } }) : [],
    ]);
    const patientById = new Map(patients.map((p) => [p.id, p]));
    const latestTriage = new Map<string, (typeof triages)[number]>();
    for (const t of triages) if (!latestTriage.has(t.visitId)) latestTriage.set(t.visitId, t);
    const userIds = [...new Set([...triages.map((t) => t.triagedById), ...visits.map((v) => v.handledById)].filter((id): id is string => !!id))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const data = visits
      .map((v) => {
        const p = patientById.get(v.patientId);
        const t = latestTriage.get(v.id);
        return {
          id: v.id,
          ticket: formatTicket(v.ticketNumber),
          status: v.status,
          arrivedAt: v.arrivedAt.toISOString(),
          startedAt: v.startedAt?.toISOString() ?? null,
          reason: v.reason,
          patientId: v.patientId,
          patientName: p?.user ? `${p.user.lastName} ${p.user.firstName}` : "Patient",
          ipp: p?.ipp ?? null,
          sex: p?.sex ?? null,
          dateOfBirth: p?.dateOfBirth.toISOString() ?? null,
          allergies: p?.allergies ?? [],
          triageLevel: v.triageLevel ?? null,
          handledByName: v.handledById ? nameById.get(v.handledById) ?? null : null,
          triage: t
            ? {
                level: t.level,
                chiefComplaint: t.chiefComplaint,
                temperature: t.temperature,
                bloodPressure: t.bloodPressure,
                heartRate: t.heartRate,
                respiratoryRate: t.respiratoryRate,
                oxygenSaturation: t.oxygenSaturation,
                bloodSugar: t.bloodSugar,
                painScore: t.painScore,
                glasgow: t.glasgow,
                notes: t.notes,
                triagedAt: t.triagedAt.toISOString(),
                triagedBy: nameById.get(t.triagedById) ?? null,
              }
            : null,
        };
      })
      .sort(compareEmergency);

    return { success: true as const, data, canTriage: TRIAGE_ROLES.includes(activeUser.role) };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du tableau des urgences.") };
  }
}
