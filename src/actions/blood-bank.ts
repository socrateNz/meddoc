"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { assertClinicScope } from "@/lib/clinic-scope";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import {
  ABO_GROUPS,
  BLOOD_PRODUCTS,
  BLOOD_PRODUCT_LABELS,
  DISCARD_REASONS,
  REACTION_LABELS,
  RHESUS,
  SEVERE_REACTIONS,
  TRANSFUSION_REACTIONS,
  bedsideChecks,
  checkCompatibility,
  formatBloodGroup,
  isExpired,
  nextTransfusionStatus,
  parseBloodType,
  requiresCrossmatch,
  type AboGroup,
  type BloodProduct,
  type Rhesus,
} from "@/lib/blood-bank";
import { assertUserModule } from "@/lib/modules-server";

// Banque de sang (étape E2 de l'audit d'évolution), sans rôle dédié : le personnel soignant
// réceptionne et détruit les poches et pose les transfusions ; le médecin (ou le coordinateur)
// réserve une poche pour un patient après les contrôles de compatibilité ; l'admin de holding
// consulte. La poche est facturée à la pose (elle ne peut alors plus revenir en stock).
const READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const STOCK_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];
const RESERVE_ROLES = ["COORDINATOR", "MEDECIN"];
const ADMINISTER_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];

async function requireUser(roles: string[], message = "Non autorisé.") {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");
  assertUserModule(activeUser, "BANQUE_SANG");
  if (!roles.includes(activeUser.role)) throw new Error(message);
  return activeUser;
}

function revalidateBloodBank(organizationId: string, patientId?: string) {
  revalidatePath(`/dashboard/clinics/${organizationId}/banque-sang`);
  if (patientId) revalidatePath(`/dashboard/patients/${patientId}`);
}

// --- Stock ---

export async function listBloodStock(clinicId: string) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    await assertClinicScope(clinicId, activeUser);
    const units = await prisma.bloodUnit.findMany({
      where: { organizationId: clinicId, status: { in: ["AVAILABLE", "RESERVED"] } },
      orderBy: { expiresAt: "asc" },
    });
    return {
      success: true as const,
      data: units.map((u) => ({
        id: u.id,
        unitNumber: u.unitNumber,
        product: u.product,
        aboGroup: u.aboGroup,
        rhesus: u.rhesus,
        volumeMl: u.volumeMl,
        expiresAt: u.expiresAt.toISOString(),
        source: u.source,
        price: u.price,
        status: u.status,
      })),
      canManage: STOCK_ROLES.includes(activeUser.role),
      canReserve: RESERVE_ROLES.includes(activeUser.role),
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du stock de sang.") };
  }
}

const receiveSchema = z.object({
  clinicId: z.string().min(1),
  unitNumber: z.string().trim().min(3, "Numéro de poche requis").max(40),
  product: z.enum(BLOOD_PRODUCTS),
  aboGroup: z.enum(ABO_GROUPS),
  rhesus: z.enum(RHESUS),
  volumeMl: z.number().int().min(10).max(1000).optional(),
  collectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de péremption requise"),
  source: z.string().trim().max(120).optional(),
  price: z.number().finite().min(0, "Le tarif ne peut pas être négatif").default(0),
});

export async function receiveBloodUnit(data: z.input<typeof receiveSchema>) {
  try {
    const input = receiveSchema.parse(data);
    const activeUser = await requireUser(STOCK_ROLES, "Non autorisé. Réservé au personnel soignant.");
    await assertClinicScope(input.clinicId, activeUser);

    // Une poche périme à la fin de sa date de péremption.
    const expiresAt = new Date(`${input.expiresAt}T23:59:59.000Z`);
    if (isExpired(expiresAt)) throw new Error("Cette poche est déjà périmée : elle ne peut pas entrer en stock.");
    const duplicate = await prisma.bloodUnit.findFirst({ where: { organizationId: input.clinicId, unitNumber: input.unitNumber } });
    if (duplicate) throw new Error("Une poche porte déjà ce numéro dans cette clinique.");

    const unit = await prisma.bloodUnit.create({
      data: {
        organizationId: input.clinicId,
        unitNumber: input.unitNumber,
        product: input.product,
        aboGroup: input.aboGroup,
        rhesus: input.rhesus,
        volumeMl: input.volumeMl ?? null,
        collectedAt: input.collectedAt ? new Date(`${input.collectedAt}T00:00:00.000Z`) : null,
        expiresAt,
        source: input.source || null,
        price: input.price,
        receivedById: activeUser.id,
      },
    });
    await logAuditAction(activeUser.id, "RECEIVE_BLOOD_UNIT", "BloodUnit", unit.id, {
      unitNumber: unit.unitNumber,
      product: unit.product,
      group: formatBloodGroup({ abo: unit.aboGroup, rh: unit.rhesus }),
    });
    revalidateBloodBank(input.clinicId);
    return { success: true as const, data: { id: unit.id } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la réception de la poche.") };
  }
}

const discardSchema = z.object({ unitId: z.string().min(1), reason: z.enum(DISCARD_REASONS), details: z.string().trim().max(300).optional() });

export async function discardBloodUnit(data: z.input<typeof discardSchema>) {
  try {
    const input = discardSchema.parse(data);
    const activeUser = await requireUser(STOCK_ROLES, "Non autorisé. Réservé au personnel soignant.");
    const unit = await prisma.bloodUnit.findUnique({ where: { id: input.unitId } });
    if (!unit) throw new Error("Poche introuvable.");
    await assertClinicScope(unit.organizationId, activeUser);

    const reason = input.details ? `${input.reason} — ${input.details}` : input.reason;
    const claim = await prisma.bloodUnit.updateMany({
      where: { id: unit.id, status: "AVAILABLE" },
      data: { status: "DISCARDED", discardReason: reason, discardedById: activeUser.id, discardedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("Seule une poche disponible (non réservée) peut être détruite.");

    await logAuditAction(activeUser.id, "DISCARD_BLOOD_UNIT", "BloodUnit", unit.id, { unitNumber: unit.unitNumber, reason });
    revalidateBloodBank(unit.organizationId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la destruction de la poche.") };
  }
}

// --- Réservation (contrôles pré-transfusionnels) ---

const groupSchema = { patientAboGroup: z.enum(ABO_GROUPS), patientRhesus: z.enum(RHESUS) };

// Poches disponibles, non périmées et compatibles avec le groupe du patient, pour un produit.
export async function listCompatibleUnits(data: { patientId: string; product: BloodProduct; patientAboGroup: AboGroup; patientRhesus: Rhesus }) {
  try {
    z.object({ patientId: z.string().min(1), product: z.enum(BLOOD_PRODUCTS), ...groupSchema }).parse(data);
    const activeUser = await requireUser(RESERVE_ROLES);
    if (!(await verifyPatientAccess(data.patientId, activeUser))) throw new Error("Non autorisé.");
    const patient = await prisma.patient.findUnique({ where: { id: data.patientId }, select: { organizationId: true } });
    if (!patient?.organizationId) throw new Error("Patient introuvable.");

    const recipient = { abo: data.patientAboGroup, rh: data.patientRhesus };
    const units = await prisma.bloodUnit.findMany({
      where: { organizationId: patient.organizationId, status: "AVAILABLE", product: data.product, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
    });
    return {
      success: true as const,
      data: units
        .map((u) => ({ unit: u, check: checkCompatibility(data.product, { abo: u.aboGroup as AboGroup, rh: u.rhesus as Rhesus }, recipient) }))
        .filter((x) => x.check.compatible)
        .map(({ unit, check }) => ({
          id: unit.id,
          unitNumber: unit.unitNumber,
          group: formatBloodGroup({ abo: unit.aboGroup, rh: unit.rhesus }),
          expiresAt: unit.expiresAt.toISOString(),
          volumeMl: unit.volumeMl,
          price: unit.price,
          warning: check.warning ?? null,
        })),
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la recherche de poches compatibles.") };
  }
}

const reserveSchema = z.object({
  patientId: z.string().min(1),
  unitId: z.string().min(1),
  indication: z.string().trim().min(3, "Indication requise").max(500),
  ...groupSchema,
  antibodyScreen: z.enum(["NEGATIVE", "POSITIVE"]),
  crossmatch: z.enum(["COMPATIBLE", "INCOMPATIBLE", "NOT_REQUIRED"]),
});

export async function reserveBloodUnit(data: z.input<typeof reserveSchema>) {
  try {
    const input = reserveSchema.parse(data);
    const activeUser = await requireUser(RESERVE_ROLES, "Non autorisé. Seul un médecin ou un coordinateur réserve une poche.");
    if (!(await verifyPatientAccess(input.patientId, activeUser))) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }
    const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { organizationId: true, bloodType: true } });
    if (!patient?.organizationId) throw new Error("Patient introuvable.");

    // Le groupe saisi doit concorder avec celui du dossier : une discordance impose un nouveau
    // groupage, jamais une correction silencieuse.
    const recipient = { abo: input.patientAboGroup, rh: input.patientRhesus };
    const recorded = parseBloodType(patient.bloodType);
    if (patient.bloodType && !recorded) throw new Error(`Groupe sanguin du dossier illisible (« ${patient.bloodType} ») : corrigez-le d'abord.`);
    if (recorded && (recorded.abo !== recipient.abo || recorded.rh !== recipient.rh)) {
      throw new Error(`Discordance de groupe : le dossier indique ${formatBloodGroup(recorded)}. Refaites le groupage avant toute transfusion.`);
    }

    const unit = await prisma.bloodUnit.findUnique({ where: { id: input.unitId } });
    if (!unit || unit.organizationId !== patient.organizationId) throw new Error("Poche introuvable.");
    if (unit.status !== "AVAILABLE") throw new Error("Cette poche n'est plus disponible.");
    if (isExpired(unit.expiresAt)) throw new Error("Cette poche est périmée.");
    const compat = checkCompatibility(unit.product as BloodProduct, { abo: unit.aboGroup as AboGroup, rh: unit.rhesus as Rhesus }, recipient);
    if (!compat.compatible) throw new Error(compat.reason);
    if (requiresCrossmatch(unit.product)) {
      if (input.crossmatch !== "COMPATIBLE") throw new Error("Cross-match compatible exigé pour un produit contenant des globules rouges.");
    } else if (input.crossmatch === "INCOMPATIBLE") {
      throw new Error("Cross-match incompatible : poche refusée.");
    }

    const transfusion = await prisma.$transaction(async (tx) => {
      const claim = await tx.bloodUnit.updateMany({ where: { id: unit.id, status: "AVAILABLE" }, data: { status: "RESERVED" } });
      if (claim.count === 0) throw new Error("Cette poche vient d'être réservée pour un autre patient.");
      if (!patient.bloodType) await tx.patient.update({ where: { id: input.patientId }, data: { bloodType: formatBloodGroup(recipient) } });
      return tx.transfusion.create({
        data: {
          organizationId: patient.organizationId!,
          patientId: input.patientId,
          bloodUnitId: unit.id,
          indication: input.indication,
          patientAboGroup: recipient.abo,
          patientRhesus: recipient.rh,
          antibodyScreen: input.antibodyScreen,
          crossmatch: requiresCrossmatch(unit.product) ? "COMPATIBLE" : "NOT_REQUIRED",
          requestedById: activeUser.id,
        },
      });
    });

    await logAuditAction(activeUser.id, "RESERVE_BLOOD_UNIT", "Transfusion", transfusion.id, {
      patientId: input.patientId,
      unitNumber: unit.unitNumber,
      antibodyScreen: input.antibodyScreen,
      warning: compat.warning ?? null,
    });
    revalidateBloodBank(patient.organizationId, input.patientId);
    return { success: true as const, data: { id: transfusion.id } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la réservation de la poche.") };
  }
}

// --- Pose et surveillance ---

const startSchema = z.object({
  transfusionId: z.string().min(1),
  checks: z.record(z.string(), z.boolean()),
  preVitals: z.string().trim().min(3, "Constantes de départ requises").max(300),
});

export async function startTransfusion(data: z.input<typeof startSchema>) {
  try {
    const input = startSchema.parse(data);
    const activeUser = await requireUser(ADMINISTER_ROLES, "Non autorisé. Réservé au personnel soignant.");
    const transfusion = await prisma.transfusion.findUnique({ where: { id: input.transfusionId } });
    if (!transfusion) throw new Error("Transfusion introuvable.");
    if (!(await verifyPatientAccess(transfusion.patientId, activeUser))) throw new Error("Non autorisé.");
    if (!nextTransfusionStatus(transfusion.status, "START")) throw new Error("Cette transfusion ne peut plus être commencée.");

    const unit = await prisma.bloodUnit.findUnique({ where: { id: transfusion.bloodUnitId } });
    if (!unit) throw new Error("Poche introuvable.");
    if (isExpired(unit.expiresAt)) throw new Error("La poche est périmée : ne pas transfuser. Annulez la réservation et détruisez la poche.");
    const missing = bedsideChecks(unit.product).find((c) => input.checks[c.key] !== true);
    if (missing) throw new Error(`Contrôle ultime non validé : « ${missing.label} ». Ne pas transfuser.`);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const claim = await tx.transfusion.updateMany({
        where: { id: transfusion.id, status: "RESERVED" },
        data: { status: "IN_PROGRESS", startedAt: now, bedsideCheckById: activeUser.id, preVitals: input.preVitals },
      });
      if (claim.count === 0) throw new Error("La transfusion vient d'être modifiée par un autre utilisateur. Rechargez la page.");
      const unitClaim = await tx.bloodUnit.updateMany({ where: { id: unit.id, status: "RESERVED" }, data: { status: "TRANSFUSED" } });
      if (unitClaim.count === 0) throw new Error("La poche n'est plus réservée pour ce patient.");
      if (unit.price > 0) {
        const invoice = await tx.pendingInvoice.create({
          data: {
            status: "PENDING",
            patientId: transfusion.patientId,
            organizationId: transfusion.organizationId,
            items: [
              { type: "SERVICE", description: `Transfusion : ${BLOOD_PRODUCT_LABELS[unit.product as BloodProduct] ?? unit.product} n° ${unit.unitNumber}`, quantity: 1, unitPrice: unit.price, amount: unit.price },
            ] as unknown as Prisma.InputJsonValue,
            createdById: activeUser.id,
          },
        });
        await tx.transfusion.update({ where: { id: transfusion.id }, data: { pendingInvoiceId: invoice.id } });
      }
    });

    await logAuditAction(activeUser.id, "START_TRANSFUSION", "Transfusion", transfusion.id, { unitNumber: unit.unitNumber, checks: input.checks });
    revalidateBloodBank(transfusion.organizationId, transfusion.patientId);
    if (unit.price > 0) revalidatePath("/dashboard/finance");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du début de la transfusion.") };
  }
}

const completeSchema = z.object({
  transfusionId: z.string().min(1),
  reaction: z.enum(TRANSFUSION_REACTIONS),
  reactionDetails: z.string().trim().max(1000).optional(),
  postVitals: z.string().trim().min(3, "Constantes de fin requises").max(300),
});

export async function completeTransfusion(data: z.input<typeof completeSchema>) {
  try {
    const input = completeSchema.parse(data);
    const activeUser = await requireUser(ADMINISTER_ROLES, "Non autorisé. Réservé au personnel soignant.");
    const transfusion = await prisma.transfusion.findUnique({ where: { id: input.transfusionId } });
    if (!transfusion) throw new Error("Transfusion introuvable.");
    if (!(await verifyPatientAccess(transfusion.patientId, activeUser))) throw new Error("Non autorisé.");
    if (!nextTransfusionStatus(transfusion.status, "COMPLETE")) throw new Error("Cette transfusion n'est pas en cours.");
    if (input.reaction !== "NONE" && !input.reactionDetails) throw new Error("Décrivez l'effet indésirable observé.");

    const claim = await prisma.transfusion.updateMany({
      where: { id: transfusion.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", endedAt: new Date(), completedById: activeUser.id, postVitals: input.postVitals, reaction: input.reaction, reactionDetails: input.reactionDetails || null },
    });
    if (claim.count === 0) throw new Error("La transfusion vient d'être modifiée par un autre utilisateur. Rechargez la page.");

    // Hémovigilance : tout effet indésirable est déclaré comme incident du patient.
    let incidentId: string | null = null;
    if (input.reaction !== "NONE") {
      const unit = await prisma.bloodUnit.findUnique({ where: { id: transfusion.bloodUnitId }, select: { unitNumber: true, product: true } });
      const incident = await prisma.incident.create({
        data: {
          patientId: transfusion.patientId,
          reportedById: activeUser.id,
          title: `Hémovigilance : ${REACTION_LABELS[input.reaction]}`,
          description: `Poche n° ${unit?.unitNumber ?? "?"} (${unit ? BLOOD_PRODUCT_LABELS[unit.product as BloodProduct] ?? unit.product : "?"}). ${input.reactionDetails}`,
          priority: SEVERE_REACTIONS.includes(input.reaction) ? "CRITICAL" : "HIGH",
        },
      });
      incidentId = incident.id;
      await prisma.transfusion.update({ where: { id: transfusion.id }, data: { incidentId } });
    }

    await logAuditAction(activeUser.id, "COMPLETE_TRANSFUSION", "Transfusion", transfusion.id, { reaction: input.reaction, incidentId });
    revalidateBloodBank(transfusion.organizationId, transfusion.patientId);
    if (incidentId) revalidatePath(`/dashboard/clinics/${transfusion.organizationId}/incidents`);
    return { success: true as const, data: { incidentId } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la clôture de la transfusion.") };
  }
}

const cancelSchema = z.object({ transfusionId: z.string().min(1), reason: z.string().trim().min(3, "Motif requis").max(500) });

// Annulation avant la pose : la poche retourne en stock (sauf si elle a périmé entre-temps).
export async function cancelTransfusion(data: z.input<typeof cancelSchema>) {
  try {
    const input = cancelSchema.parse(data);
    const activeUser = await requireUser(RESERVE_ROLES, "Non autorisé.");
    const transfusion = await prisma.transfusion.findUnique({ where: { id: input.transfusionId } });
    if (!transfusion) throw new Error("Transfusion introuvable.");
    if (!(await verifyPatientAccess(transfusion.patientId, activeUser))) throw new Error("Non autorisé.");
    if (!nextTransfusionStatus(transfusion.status, "CANCEL")) throw new Error("Une transfusion commencée ne peut plus être annulée.");

    await prisma.$transaction(async (tx) => {
      const claim = await tx.transfusion.updateMany({
        where: { id: transfusion.id, status: "RESERVED" },
        data: { status: "CANCELLED", cancelledById: activeUser.id, cancelledAt: new Date(), cancelReason: input.reason },
      });
      if (claim.count === 0) throw new Error("La transfusion vient d'être modifiée par un autre utilisateur. Rechargez la page.");
      await tx.bloodUnit.updateMany({ where: { id: transfusion.bloodUnitId, status: "RESERVED" }, data: { status: "AVAILABLE" } });
    });

    await logAuditAction(activeUser.id, "CANCEL_TRANSFUSION", "Transfusion", transfusion.id, { reason: input.reason });
    revalidateBloodBank(transfusion.organizationId, transfusion.patientId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'annulation de la transfusion.") };
  }
}

// --- Lecture ---

export async function listTransfusions(options: { clinicId?: string; patientId?: string; activeOnly?: boolean }) {
  try {
    const activeUser = await requireUser(READ_ROLES);
    const where: Prisma.TransfusionWhereInput = {};
    if (options.patientId) {
      if (!(await verifyPatientAccess(options.patientId, activeUser))) throw new Error("Non autorisé.");
      where.patientId = options.patientId;
    } else if (options.clinicId) {
      await assertClinicScope(options.clinicId, activeUser);
      where.organizationId = options.clinicId;
    } else {
      throw new Error("Clinique ou patient requis.");
    }
    if (options.activeOnly) where.status = { in: ["RESERVED", "IN_PROGRESS"] };

    const transfusions = await prisma.transfusion.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    const [units, patients] = await Promise.all([
      prisma.bloodUnit.findMany({ where: { id: { in: transfusions.map((t) => t.bloodUnitId) } } }),
      prisma.patient.findMany({
        where: { id: { in: [...new Set(transfusions.map((t) => t.patientId))] } },
        select: { id: true, ipp: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const userIds = [...new Set(transfusions.flatMap((t) => [t.requestedById, t.bedsideCheckById, t.completedById, t.cancelledById]).filter((id): id is string => !!id))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const unitById = new Map(units.map((u) => [u.id, u]));
    const patientById = new Map(patients.map((p) => [p.id, p]));

    return {
      success: true as const,
      data: transfusions.map((t) => {
        const unit = unitById.get(t.bloodUnitId);
        const p = patientById.get(t.patientId);
        return {
          id: t.id,
          patientId: t.patientId,
          patientName: p?.user ? `${p.user.lastName} ${p.user.firstName}` : "Patient",
          ipp: p?.ipp ?? null,
          patientGroup: formatBloodGroup({ abo: t.patientAboGroup, rh: t.patientRhesus }),
          unitNumber: unit?.unitNumber ?? "-",
          product: unit?.product ?? "RBC",
          unitGroup: unit ? formatBloodGroup({ abo: unit.aboGroup, rh: unit.rhesus }) : "-",
          unitExpiresAt: unit?.expiresAt.toISOString() ?? null,
          indication: t.indication,
          antibodyScreen: t.antibodyScreen,
          crossmatch: t.crossmatch,
          status: t.status,
          createdAt: t.createdAt.toISOString(),
          startedAt: t.startedAt?.toISOString() ?? null,
          endedAt: t.endedAt?.toISOString() ?? null,
          preVitals: t.preVitals,
          postVitals: t.postVitals,
          reaction: t.reaction,
          reactionDetails: t.reactionDetails,
          incidentId: t.incidentId,
          cancelReason: t.cancelReason,
          requestedByName: nameById.get(t.requestedById) ?? null,
          bedsideCheckByName: t.bedsideCheckById ? nameById.get(t.bedsideCheckById) ?? null : null,
          completedByName: t.completedById ? nameById.get(t.completedById) ?? null : null,
        };
      }),
      permissions: { reserve: RESERVE_ROLES.includes(activeUser.role), administer: ADMINISTER_ROLES.includes(activeUser.role) },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des transfusions.") };
  }
}
