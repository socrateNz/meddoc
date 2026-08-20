"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { createAppointmentSchema, completeConsultationSchema, saveConsultationDraftSchema } from "@/validators/appointments";
import { revalidatePath } from "next/cache";
import { runInteractionCheck } from "@/actions/prescriptions";

// Planifier un RDV reste large (le personnel infirmier organise aussi l'agenda) ; clôturer une
// consultation (diagnostic + ordonnance) est réservé à l'autorité clinique complète — ADMIN
// (holding) et PHARMACIST restent en lecture seule dans les deux cas.
const APPOINTMENT_SCHEDULE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];
const CONSULTATION_WRITE_ROLES = ["COORDINATOR", "MEDECIN"];

function assertScheduleAccess(role: string) {
  if (!APPOINTMENT_SCHEDULE_ROLES.includes(role)) {
    throw new Error("Non autorisé. Seuls un coordinateur, un médecin ou un infirmier(e) peuvent effectuer cette action.");
  }
}

function assertConsultationWriteAccess(role: string) {
  if (!CONSULTATION_WRITE_ROLES.includes(role)) {
    throw new Error("Non autorisé. Seuls un coordinateur ou un médecin peuvent clôturer une consultation.");
  }
}

export async function createAppointment(data: {
  patientId: string;
  caregiverId?: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  type: string;
  status?: string;
}) {
  try {
    createAppointmentSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }
    assertScheduleAccess(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        caregiverId: data.caregiverId || null,
        title: data.title,
        scheduledAt: new Date(data.scheduledAt),
        durationMinutes: Number(data.durationMinutes),
        type: data.type,
        status: data.status || "SCHEDULED",
      },
    });

    // Emit event for notification
    if (appointment.caregiverId) {
      try {
        const { appEvents } = await import("@/lib/events");
        appEvents.emit("appointment.scheduled", {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          caregiverId: appointment.caregiverId,
          title: appointment.title,
        });
      } catch (e) {
        console.error("Failed to emit appointment.scheduled event:", e);
      }
    }

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "SCHEDULE_APPOINTMENT",
      "Appointment",
      appointment.id,
      { patientId: data.patientId, scheduledAt: data.scheduledAt }
    );

    revalidatePath("/dashboard/appointments");
    return { success: true, data: appointment };
  } catch (error: any) {
    console.error("Error creating appointment:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la planification du rendez-vous") };
  }
}

export async function completeConsultation(data: {
  appointmentId?: string;
  patientId: string;
  symptoms: string;
  diagnosis: string;
  plan: string;
  medications?: { name: string; dosage: string; frequency: string; instructions: string }[];
  diagnosisCode?: string;
  diagnosisLabel?: string;
}) {
  try {
    completeConsultationSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) {
      throw new Error("Non authentifié.");
    }
    assertConsultationWriteAccess(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) {
      throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    }

    // Le plan de traitement / l'ordonnance ne doivent pas être figés avant que le médecin ait
    // vu les résultats des analyses qu'il a lui-même demandées pendant cette consultation.
    // Contrôle limité aux demandes rattachées à ce rendez-vous (appointmentId) — pas de moyen
    // fiable de faire ce lien pour une consultation ad-hoc sans rendez-vous.
    if (data.appointmentId) {
      const pendingLabOrders = await prisma.labOrder.count({
        where: {
          appointmentId: data.appointmentId,
          status: { notIn: ["VALIDATED", "DELIVERED", "CANCELLED"] },
        },
      });
      if (pendingLabOrders > 0) {
        throw new Error(
          `Impossible de clôturer : ${pendingLabOrders} demande(s) d'analyse de cette consultation sont encore en attente de résultats validés. Utilisez "Enregistrer" pour sauvegarder vos notes sans clôturer, en attendant le retour du laboratoire.`
        );
      }
    }

    let description = `**Symptômes / Observations :**\n${data.symptoms}\n\n**Diagnostic / Évaluation :**\n${data.diagnosis}\n\n**Plan de traitement / Recommandations :**\n${data.plan}`;
    if (data.diagnosisCode && data.diagnosisLabel) {
      description = `**Diagnostic CIM-10 :** ${data.diagnosisCode} — ${data.diagnosisLabel}\n\n${description}`;
    }

    const result = await prisma.$transaction(async (tx) => {
      let appointment = null;
      // 1. Update appointment status if appointmentId is provided
      if (data.appointmentId) {
        appointment = await tx.appointment.update({
          where: { id: data.appointmentId },
          data: { status: "COMPLETED" },
        });
      }

      // 2. Create medical record with structured notes in description
      const medicalRecord = await tx.medicalRecord.create({
        data: {
          patientId: data.patientId,
          appointmentId: data.appointmentId || null,
          title: `Consultation du ${new Date().toLocaleDateString('fr-FR')}`,
          description: description,
          diagnosisCode: data.diagnosisCode || null,
          diagnosisLabel: data.diagnosisLabel || null,
          createdById: activeUser.id,
        },
      });

      const patientRecord = await tx.patient.findUnique({
        where: { id: data.patientId },
        select: { organizationId: true },
      });

      // 3. Ordonnance électronique : un médicament reconnu au catalogue pharmacie (par nom,
      // insensible à la casse) est rapproché une seule fois et réutilisé à la fois pour la
      // ligne PrescriptionItem et la ligne de facturation ci-dessous.
      let prescription = null;
      const pharmacyMatches: { pharmacyItemId: string; unitPrice: number; name: string; dosage: string | null }[] = [];
      if (data.medications && data.medications.length > 0) {
        for (const med of data.medications) {
          const pharmacyItem = patientRecord?.organizationId
            ? await tx.pharmacyItem.findFirst({
                where: {
                  organizationId: patientRecord.organizationId,
                  name: { equals: med.name, mode: "insensitive" },
                },
              })
            : null;
          pharmacyMatches.push(
            pharmacyItem
              ? { pharmacyItemId: pharmacyItem.id, unitPrice: pharmacyItem.unitPrice, name: pharmacyItem.name, dosage: pharmacyItem.dosage }
              : { pharmacyItemId: "", unitPrice: 0, name: med.name, dosage: null }
          );
        }

        prescription = await tx.prescription.create({
          data: {
            patientId: data.patientId,
            prescribedById: activeUser.id,
            medicalRecordId: medicalRecord.id,
            appointmentId: data.appointmentId || null,
            organizationId: patientRecord?.organizationId || null,
            status: "ACTIVE",
            items: {
              create: data.medications.map((med, i) => ({
                pharmacyItemId: pharmacyMatches[i].pharmacyItemId || null,
                drugName: med.name,
                dosage: med.dosage,
                frequency: med.frequency,
                instructions: med.instructions || null,
              })),
            },
          },
        });
      }

      // 4. Facture en attente : un CAREGIVER/MEDECIN ne peut pas toucher la caisse
      // (recordMultiItemInvoice est réservé à COORDINATOR/PHARMACIST), donc la clôture crée une
      // facture à finaliser plutôt que d'enregistrer directement une transaction financière.
      let pendingInvoice = null;
      if (patientRecord?.organizationId) {
        const items: any[] = [
          {
            type: "SERVICE",
            description: "Frais de consultation",
            quantity: 1,
            unitPrice: 0,
            amount: 0,
          },
        ];

        for (const match of pharmacyMatches) {
          if (!match.pharmacyItemId) continue;
          items.push({
            type: "PHARMACY",
            pharmacyItemId: match.pharmacyItemId,
            description: `${match.name}${match.dosage ? ` (${match.dosage})` : ""}`,
            quantity: 1,
            unitPrice: match.unitPrice,
            amount: match.unitPrice,
          });
        }

        pendingInvoice = await tx.pendingInvoice.create({
          data: {
            status: "PENDING",
            patientId: data.patientId,
            medicalRecordId: medicalRecord.id,
            organizationId: patientRecord.organizationId,
            items,
            createdById: activeUser.id,
          },
        });

        if (prescription) {
          prescription = await tx.prescription.update({
            where: { id: prescription.id },
            data: { status: "SENT_TO_PHARMACY", pendingInvoiceId: pendingInvoice.id, sentToPharmacyAt: new Date() },
          });
        }
      }

      // Le brouillon de cette consultation n'a plus lieu d'être une fois clôturée.
      const draftWhere = data.appointmentId
        ? { appointmentId: data.appointmentId }
        : { patientId: data.patientId, appointmentId: null, createdById: activeUser.id };
      await tx.consultationDraft.deleteMany({ where: draftWhere });

      return { appointment, medicalRecord, pendingInvoice, prescription };
    });

    // Write Audit Log
    await logAuditAction(
      activeUser.id,
      "COMPLETE_CONSULTATION",
      data.appointmentId ? "Appointment" : "Patient",
      data.appointmentId || data.patientId,
      { status: "COMPLETED", medicalRecordId: result.medicalRecord.id }
    );

    revalidatePath("/dashboard/appointments");
    revalidatePath(`/dashboard/patients/${data.patientId}`);
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard", "layout");

    // Vérification IA des interactions — jamais bloquante, exécutée après la transaction.
    if (result.prescription) {
      await runInteractionCheck(result.prescription.id);
    }

    return { success: true, data: result, pendingInvoiceCreated: !!result.pendingInvoice };
  } catch (error: any) {
    console.error("Error completing consultation:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de la clôture de la consultation") };
  }
}

// Enregistre/actualise le brouillon d'une consultation en cours, sans la clôturer : ni
// MedicalRecord, ni Prescription, ni PendingInvoice ne sont créés. Un seul brouillon actif à la
// fois par consultation — cf. le modèle ConsultationDraft pour la logique d'identification
// (appointmentId si rendez-vous planifié, sinon patientId + auteur pour le flux ad-hoc).
export async function saveConsultationDraft(data: {
  appointmentId?: string;
  patientId: string;
  symptoms?: string;
  diagnosis?: string;
  plan?: string;
  medications?: { name: string; dosage: string; frequency: string; instructions: string }[];
  diagnosisCode?: string;
  diagnosisLabel?: string;
}) {
  try {
    saveConsultationDraftSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertConsultationWriteAccess(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const where = data.appointmentId
      ? { appointmentId: data.appointmentId }
      : { patientId: data.patientId, appointmentId: null, createdById: activeUser.id };

    const existing = await prisma.consultationDraft.findFirst({ where });

    const payload = {
      patientId: data.patientId,
      appointmentId: data.appointmentId || null,
      createdById: activeUser.id,
      symptoms: data.symptoms || null,
      diagnosis: data.diagnosis || null,
      plan: data.plan || null,
      diagnosisCode: data.diagnosisCode || null,
      diagnosisLabel: data.diagnosisLabel || null,
      medications: data.medications || [],
    };

    const draft = existing
      ? await prisma.consultationDraft.update({ where: { id: existing.id }, data: payload })
      : await prisma.consultationDraft.create({ data: payload });

    return { success: true, data: draft };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement du brouillon.") };
  }
}

export async function getConsultationDraft(options: { appointmentId?: string; patientId: string }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertConsultationWriteAccess(activeUser.role);

    const hasAccess = await verifyPatientAccess(options.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const where = options.appointmentId
      ? { appointmentId: options.appointmentId }
      : { patientId: options.patientId, appointmentId: null, createdById: activeUser.id };

    const draft = await prisma.consultationDraft.findFirst({ where });
    return { success: true, data: draft };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement du brouillon.") };
  }
}
