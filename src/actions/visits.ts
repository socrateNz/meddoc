"use server";

import { can, type PermissionSubject } from "@/lib/permissions-catalog";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertClinicScope } from "@/lib/clinic-scope";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { clinicDateKey } from "@/lib/clinic-day";
import { nextSequenceValue } from "@/lib/ipp";
import {
  ACTIVE_VISIT_STATUSES,
  VISIT_DESTINATIONS,
  compareQueue,
  formatTicket,
  nextVisitStatus,
  type VisitAction,
} from "@/lib/visits";
import { assertUserModule } from "@/lib/modules-server";
import { VISIT_DESTINATION_MODULE } from "@/lib/modules";
import { canSeePatientService, restrictedServiceIds } from "@/lib/service-access";

// Accueil & file d'attente (étape C2 de l'audit d'évolution). Rôle dédié ACCUEIL ; dans les petites
// clinique le guichet reste aussi tenu par le personnel présent (soignants, caissier). ADMIN
// (holding) consulte en lecture seule.

// Prendre en charge / terminer un passage : le personnel soignant pour tout passage, plus le
// caissier pour le guichet administratif, le pharmacien pour la pharmacie et le laborantin pour
// le laboratoire. L'accueil oriente mais ne prend pas en charge.
function canHandle(subject: PermissionSubject, destination: string) {
  if (can(subject, "visits.handle.all")) return true;
  if (destination === "ADMINISTRATIVE") return can(subject, "visits.handle.admin");
  if (destination === "PHARMACY") return can(subject, "visits.handle.pharmacy");
  if (destination === "LAB") return can(subject, "visits.handle.lab");
  return false;
}

const registerVisitSchema = z.object({
  clinicId: z.string().min(1),
  patientId: z.string().min(1, "Patient requis"),
  destination: z.enum(VISIT_DESTINATIONS),
  priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  reason: z.string().trim().max(300).optional(),
  assignedToId: z.string().min(1).optional(),
  // Service d'orientation (consultation) : le dossier lui est confié (cf. ClinicService).
  serviceId: z.string().min(1).optional(),
});

export async function registerVisit(data: z.input<typeof registerVisitSchema>) {
  try {
    const input = registerVisitSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "ACCUEIL");
    if (!can(activeUser, "visits.register")) throw new Error("Non autorisé.");
    await assertClinicScope(input.clinicId, activeUser);
    // Orientation vers un service dont le module n'est pas dans la licence : refusée.
    const destinationModule = VISIT_DESTINATION_MODULE[input.destination];
    if (destinationModule) assertUserModule(activeUser, destinationModule);

    const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { organizationId: true, serviceId: true } });
    if (!patient || patient.organizationId !== input.clinicId) {
      throw new Error("Ce patient n'est pas enregistré dans cette clinique.");
    }

    // Consultation : la clinique qui a créé ses services oriente obligatoirement vers l'un d'eux.
    const serviceId = input.destination === "CONSULTATION" ? input.serviceId : undefined;
    if (input.destination === "CONSULTATION") {
      const activeServices = await prisma.clinicService.count({ where: { organizationId: input.clinicId, isActive: true, isTransversal: false } });
      if (activeServices > 0 && !serviceId) throw new Error("Choisissez le service vers lequel orienter le patient.");
    }
    const service = serviceId
      ? await prisma.clinicService.findFirst({
          where: { id: serviceId, organizationId: input.clinicId, isActive: true, isTransversal: false },
          select: { id: true, name: true, consultationPrice: true },
        })
      : null;
    if (serviceId && !service) throw new Error("Service invalide pour cette clinique.");
    // Clinique qui fait payer la consultation avant de voir le médecin : ticket de caisse dès l'arrivée.
    const clinic = await prisma.organization.findUnique({ where: { id: input.clinicId }, select: { consultationBilling: true } });
    const billOnArrival = input.destination === "CONSULTATION" && clinic?.consultationBilling === "ON_ARRIVAL";

    if (input.assignedToId) {
      const doctor = await prisma.user.findUnique({ where: { id: input.assignedToId }, select: { role: true, organizationId: true, isActive: true, serviceIds: true } });
      if (!doctor || doctor.role !== "MEDECIN" || doctor.organizationId !== input.clinicId || !doctor.isActive) {
        throw new Error("Médecin invalide pour cette clinique.");
      }
      if (serviceId && doctor.serviceIds.length > 0 && !doctor.serviceIds.includes(serviceId)) {
        throw new Error("Ce médecin n'est pas rattaché au service choisi.");
      }
    }

    const visitDate = clinicDateKey();
    const alreadyQueued = await prisma.visit.findFirst({
      where: { patientId: input.patientId, organizationId: input.clinicId, visitDate, status: { in: ACTIVE_VISIT_STATUSES } },
      select: { ticketNumber: true },
    });
    if (alreadyQueued) {
      throw new Error(`Ce patient est déjà dans la file d'aujourd'hui (ticket ${formatTicket(alreadyQueued.ticketNumber)}).`);
    }

    // Ticket du jour : compteur atomique par clinique et par jour de la clinique.
    const ticketNumber = await nextSequenceValue(`visit-${input.clinicId}-${visitDate}`);
    const reoriented = !!serviceId && patient.serviceId !== serviceId;
    const visit = await prisma.$transaction(async (tx) => {
      const created = await tx.visit.create({
        data: {
          organizationId: input.clinicId,
          patientId: input.patientId,
          visitDate,
          ticketNumber,
          destination: input.destination,
          priority: input.priority,
          reason: input.reason || null,
          assignedToId: input.assignedToId || null,
          serviceId: serviceId || null,
          createdById: activeUser.id,
        },
      });
      // Consultation payée à l'arrivée : ticket au tarif du service (0 si le service n'a pas de tarif,
      // la caisse saisit alors le montant), relié au passage.
      if (billOnArrival) {
        const price = service?.consultationPrice ?? 0;
        const invoice = await tx.pendingInvoice.create({
          data: {
            status: "PENDING",
            patientId: input.patientId,
            organizationId: input.clinicId,
            items: [{ type: "SERVICE", description: service ? `Consultation — ${service.name}` : "Frais de consultation", quantity: 1, unitPrice: price, amount: price }],
            createdById: activeUser.id,
          },
        });
        await tx.visit.update({ where: { id: created.id }, data: { pendingInvoiceId: invoice.id } });
      }
      // Orienté vers un autre service que celui qui suit le dossier : le dossier lui est confié,
      // et le changement est tracé comme une orientation.
      if (reoriented) {
        await tx.patient.update({ where: { id: input.patientId }, data: { serviceId } });
        await tx.patientTransfer.create({
          data: {
            patientId: input.patientId,
            fromServiceId: patient.serviceId ?? null,
            toServiceId: serviceId!,
            kind: "ORIENTATION",
            reason: input.reason || null,
            transferredById: activeUser.id,
          },
        });
      }
      return created;
    });

    await logAuditAction(activeUser.id, "REGISTER_VISIT", "Visit", visit.id, {
      patientId: input.patientId,
      ticket: formatTicket(ticketNumber),
      destination: input.destination,
      priority: input.priority,
      serviceId: serviceId ?? null,
      reoriented,
    });
    revalidatePath(`/dashboard/clinics/${input.clinicId}/accueil`);
    if (billOnArrival) revalidatePath(`/dashboard/clinics/${input.clinicId}/caisse`);
    return { success: true as const, data: { id: visit.id, ticket: formatTicket(ticketNumber), billedOnArrival: billOnArrival } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'arrivée.") };
  }
}

// File du jour de la clinique, dans l'ordre de passage (urgences d'abord, puis arrivée).
export async function listTodayVisits(clinicId: string) {
  try {
    z.string().min(1).parse(clinicId);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "ACCUEIL");
    if (!can(activeUser, "visits.read")) throw new Error("Non autorisé.");
    await assertClinicScope(clinicId, activeUser);

    // Médecin/infirmier rattaché à des services : il ne voit que les consultations de ses services
    // (les autres passages — urgences, soins, labo... — restent visibles de tous).
    const myServices = await restrictedServiceIds(activeUser);
    const visits = (
      await prisma.visit.findMany({ where: { organizationId: clinicId, visitDate: clinicDateKey() }, include: { service: { select: { name: true } } } })
    ).filter((v) => canSeePatientService(myServices, v.serviceId));
    const patientIds = [...new Set(visits.map((v) => v.patientId))];
    const userIds = [...new Set(visits.flatMap((v) => [v.assignedToId, v.handledById]).filter((id): id is string => !!id))];
    const [patients, users] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, ipp: true, sex: true, dateOfBirth: true, user: { select: { firstName: true, lastName: true } } },
      }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const patientById = new Map(patients.map((p) => [p.id, p]));
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const data = visits
      .map((v) => {
        const p = patientById.get(v.patientId);
        return {
          id: v.id,
          ticket: formatTicket(v.ticketNumber),
          status: v.status,
          destination: v.destination,
          priority: v.priority,
          reason: v.reason,
          arrivedAt: v.arrivedAt.toISOString(),
          calledAt: v.calledAt?.toISOString() ?? null,
          startedAt: v.startedAt?.toISOString() ?? null,
          completedAt: v.completedAt?.toISOString() ?? null,
          patientId: v.patientId,
          patientName: p?.user ? `${p.user.lastName} ${p.user.firstName}` : "Patient",
          ipp: p?.ipp ?? null,
          assignedToId: v.assignedToId,
          assignedToName: v.assignedToId ? nameById.get(v.assignedToId) ?? null : null,
          handledByName: v.handledById ? nameById.get(v.handledById) ?? null : null,
          serviceId: v.serviceId,
          serviceName: v.service?.name ?? null,
          canHandle: canHandle(activeUser, v.destination),
        };
      })
      .sort(compareQueue);

    return { success: true as const, data, canRegister: can(activeUser, "visits.register") };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de la file d'attente.") };
  }
}

export async function updateVisitStatus(data: { visitId: string; action: VisitAction }) {
  try {
    z.object({ visitId: z.string().min(1), action: z.enum(["CALL", "START", "COMPLETE", "CANCEL", "REQUEUE"]) }).parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "ACCUEIL");

    const visit = await prisma.visit.findUnique({ where: { id: data.visitId } });
    if (!visit) throw new Error("Passage introuvable.");
    await assertClinicScope(visit.organizationId, activeUser);

    const handling = data.action === "START" || data.action === "COMPLETE";
    if (handling ? !canHandle(activeUser, visit.destination) : !can(activeUser, "visits.register")) {
      throw new Error("Non autorisé pour ce passage.");
    }
    if (handling && !canSeePatientService(await restrictedServiceIds(activeUser), visit.serviceId)) {
      throw new Error("Ce patient est orienté vers un autre service.");
    }

    const next = nextVisitStatus(visit.status, data.action);
    if (!next) throw new Error("Action impossible dans l'état actuel du passage. Rechargez la file.");

    const now = new Date();
    const stamp =
      data.action === "CALL"
        ? { calledAt: now }
        : data.action === "START"
          ? { startedAt: now, handledById: activeUser.id }
          : data.action === "COMPLETE" || data.action === "CANCEL"
            ? { completedAt: now }
            : {};
    // Conditionné au statut lu : deux postes qui appellent le même patient en même temps ne
    // peuvent pas tous les deux réussir.
    const claim = await prisma.visit.updateMany({ where: { id: visit.id, status: visit.status }, data: { status: next, ...stamp } });
    if (claim.count === 0) throw new Error("Ce passage vient d'être modifié par un autre poste. Rechargez la file.");

    await logAuditAction(activeUser.id, "UPDATE_VISIT_STATUS", "Visit", visit.id, { from: visit.status, to: next });
    revalidatePath(`/dashboard/clinics/${visit.organizationId}/accueil`);
    return { success: true as const, data: { status: next } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la mise à jour du passage.") };
  }
}
