"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  createPrescriptionSchema,
  renewPrescriptionSchema,
  createPrescriptionTemplateSchema,
} from "@/validators/prescriptions";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Rédiger/renouveler une ordonnance ou gérer un modèle est réservé à l'autorité clinique
// complète (COORDINATOR/MEDECIN) — l'infirmier(e) consulte mais ne prescrit pas en autonomie.
// PHARMACIST est en lecture seule (nécessaire pour préparer/importer une ordonnance en caisse).
const PRESCRIPTION_WRITE_ROLES = ["COORDINATOR", "MEDECIN"];
const PRESCRIPTION_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST"];

type PrescriptionItemInput = {
  pharmacyItemId?: string;
  drugName: string;
  dosage: string;
  frequency: string;
  duration?: string;
  instructions?: string;
  quantity?: number;
};

function assertPrescriptionWriteRole(role: string) {
  if (!PRESCRIPTION_WRITE_ROLES.includes(role)) {
    throw new Error("Non autorisé. Seul un coordinateur ou un médecin peut rédiger une ordonnance.");
  }
}

function assertPrescriptionReadRole(role: string) {
  if (!PRESCRIPTION_READ_ROLES.includes(role)) throw new Error("Non autorisé.");
}

function toItemCreateData(item: PrescriptionItemInput) {
  return {
    pharmacyItemId: item.pharmacyItemId || null,
    drugName: item.drugName,
    dosage: item.dosage,
    frequency: item.frequency,
    duration: item.duration || null,
    instructions: item.instructions || null,
    quantity: item.quantity ?? null,
  };
}

// Vérification IA des interactions — jamais bloquante. Appelée après la création/le
// renouvellement d'une ordonnance (jamais dans la même transaction : une panne Gemini ne doit
// jamais faire échouer une ordonnance). Avale toute erreur et retombe sur severity "NONE".
// Exportée pour être réutilisée par completeConsultation (src/actions/appointments.ts).
export async function runInteractionCheck(prescriptionId: string) {
  try {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!prescription) return;

    const otherActivePrescriptions = await prisma.prescription.findMany({
      where: {
        patientId: prescription.patientId,
        id: { not: prescriptionId },
        status: { in: ["ACTIVE", "SENT_TO_PHARMACY", "DISPENSED"] },
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const currentDrugs = prescription.items
      .map((i) => `- ${i.drugName} (${i.dosage}, ${i.frequency})`)
      .join("\n");
    const otherDrugs =
      otherActivePrescriptions.flatMap((p) => p.items.map((i) => i.drugName)).join(", ") ||
      "Aucun autre traitement actif connu.";
    const allergies = prescription.patient.allergies?.join(", ") || "Aucune allergie déclarée.";

    const prompt = `
Vous êtes un assistant pharmaceutique clinique. Votre rôle est UNIQUEMENT informatif : vous
identifiez des risques d'interactions médicamenteuses ou de contre-indications potentielles,
jamais un diagnostic ni une décision thérapeutique définitive.

PATIENT : ${prescription.patient.user.lastName} ${prescription.patient.user.firstName}
ALLERGIES CONNUES : ${allergies}

NOUVELLE ORDONNANCE :
${currentDrugs}

AUTRES TRAITEMENTS ACTIFS CONNUS DU PATIENT :
${otherDrugs}

Générez une analyse au format JSON strict :
{
  "severity": "NONE" | "LOW" | "MODERATE" | "HIGH",
  "warnings": [{ "drugs": ["Médicament A", "Médicament B"], "description": "Description du risque identifié" }]
}
Règle impérative : ne formulez jamais de diagnostic. Basez-vous strictement sur les médicaments
et allergies listés ci-dessus. Si aucun risque identifié, renvoyez severity "NONE" et warnings vide.
    `;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
    const response = await model.generateContent(prompt);
    const parsed = JSON.parse(response.response.text());

    const interactionCheck = {
      severity: ["NONE", "LOW", "MODERATE", "HIGH"].includes(parsed.severity) ? parsed.severity : "NONE",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      checkedAt: new Date().toISOString(),
    };

    await prisma.prescription.update({ where: { id: prescriptionId }, data: { interactionCheck } });

    if (interactionCheck.severity === "HIGH") {
      const { appEvents } = await import("@/lib/events");
      appEvents.emit("prescription.interaction.high", {
        prescriptionId,
        patientId: prescription.patientId,
        prescribedById: prescription.prescribedById,
        organizationId: prescription.organizationId,
        warnings: interactionCheck.warnings,
      });
    }
  } catch (error: any) {
    console.error("Drug interaction check error:", error);
    try {
      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: {
          interactionCheck: {
            severity: "NONE",
            warnings: [],
            checkedAt: new Date().toISOString(),
            error: error?.message || "Erreur lors de la vérification IA.",
          },
        },
      });
    } catch {
      // Vérification best-effort — une erreur ici ne doit jamais remonter à l'appelant.
    }
  }
}

export async function createPrescription(data: {
  patientId: string;
  medicalRecordId?: string;
  appointmentId?: string;
  templateId?: string;
  items: PrescriptionItemInput[];
  notes?: string;
}) {
  try {
    createPrescriptionSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPrescriptionWriteRole(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const patient = await prisma.patient.findUnique({ where: { id: data.patientId }, select: { organizationId: true } });

    const prescription = await prisma.prescription.create({
      data: {
        patientId: data.patientId,
        prescribedById: activeUser.id,
        medicalRecordId: data.medicalRecordId || null,
        appointmentId: data.appointmentId || null,
        organizationId: patient?.organizationId || null,
        templateId: data.templateId || null,
        notes: data.notes || null,
        status: "ACTIVE",
        items: { create: data.items.map(toItemCreateData) },
      },
      include: { items: true },
    });

    await logAuditAction(activeUser.id, "CREATE_PRESCRIPTION", "Prescription", prescription.id, { patientId: data.patientId });
    revalidatePath(`/dashboard/patients/${data.patientId}`);

    await runInteractionCheck(prescription.id);
    const updated = await prisma.prescription.findUnique({ where: { id: prescription.id }, include: { items: true } });

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de l'ordonnance.") };
  }
}

export async function renewPrescription(prescriptionId: string, overrides?: { items?: PrescriptionItemInput[]; notes?: string }) {
  try {
    renewPrescriptionSchema.parse({ prescriptionId, items: overrides?.items, notes: overrides?.notes });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPrescriptionWriteRole(activeUser.role);

    const source = await prisma.prescription.findUnique({ where: { id: prescriptionId }, include: { items: true } });
    if (!source) throw new Error("Ordonnance introuvable.");

    const hasAccess = await verifyPatientAccess(source.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const itemsToUse: PrescriptionItemInput[] =
      overrides?.items && overrides.items.length > 0
        ? overrides.items
        : source.items.map((i) => ({
            pharmacyItemId: i.pharmacyItemId || undefined,
            drugName: i.drugName,
            dosage: i.dosage,
            frequency: i.frequency,
            duration: i.duration || undefined,
            instructions: i.instructions || undefined,
            quantity: i.quantity ?? undefined,
          }));

    const renewed = await prisma.$transaction(async (tx) => {
      const newPrescription = await tx.prescription.create({
        data: {
          patientId: source.patientId,
          prescribedById: activeUser.id,
          organizationId: source.organizationId,
          renewedFromId: source.id,
          notes: overrides?.notes ?? source.notes,
          status: "ACTIVE",
          items: { create: itemsToUse.map(toItemCreateData) },
        },
        include: { items: true },
      });

      await tx.prescription.update({ where: { id: source.id }, data: { status: "SUPERSEDED" } });

      return newPrescription;
    });

    await logAuditAction(activeUser.id, "RENEW_PRESCRIPTION", "Prescription", renewed.id, { renewedFromId: source.id });
    revalidatePath(`/dashboard/patients/${source.patientId}`);

    await runInteractionCheck(renewed.id);
    const updated = await prisma.prescription.findUnique({ where: { id: renewed.id }, include: { items: true } });

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du renouvellement de l'ordonnance.") };
  }
}

export async function createPrescriptionTemplate(data: {
  name: string;
  pathology?: string;
  items: PrescriptionItemInput[];
  isShared?: boolean;
}) {
  try {
    createPrescriptionTemplateSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPrescriptionWriteRole(activeUser.role);

    const template = await prisma.prescriptionTemplate.create({
      data: {
        name: data.name,
        pathology: data.pathology || null,
        createdById: activeUser.id,
        organizationId: activeUser.organizationId || null,
        isShared: data.isShared ?? false,
        items: data.items,
      },
    });

    await logAuditAction(activeUser.id, "CREATE_PRESCRIPTION_TEMPLATE", "PrescriptionTemplate", template.id, { name: data.name });

    return { success: true, data: template };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du modèle.") };
  }
}

// Modèles visibles : ceux marqués partagés pour la clinique, plus les modèles personnels du médecin connecté.
export async function listPrescriptionTemplates(options?: { pathology?: string }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPrescriptionWriteRole(activeUser.role);

    const where: any = {
      OR: [
        { isShared: true, organizationId: activeUser.organizationId },
        { createdById: activeUser.id },
      ],
    };
    if (options?.pathology) where.pathology = { contains: options.pathology, mode: "insensitive" };

    const templates = await prisma.prescriptionTemplate.findMany({ where, orderBy: { name: "asc" } });

    return { success: true, data: templates };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des modèles.") };
  }
}

export async function listPrescriptions(options?: {
  patientId?: string;
  prescribedById?: string;
  organizationId?: string;
  status?: string;
}) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPrescriptionReadRole(activeUser.role);

    const where: any = {};

    if (options?.patientId) {
      const hasAccess = await verifyPatientAccess(options.patientId, activeUser);
      if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
      where.patientId = options.patientId;
    } else if (activeUser.organization?.type === "HOLDING" && !options?.organizationId) {
      where.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else {
      const targetOrgId = options?.organizationId || activeUser.organizationId;
      where.organizationId = targetOrgId ? targetOrgId : { in: [] };
    }

    if (options?.prescribedById) where.prescribedById = options.prescribedById;
    if (options?.status) where.status = options.status;

    const prescriptions = await prisma.prescription.findMany({
      where,
      include: {
        items: true,
        prescribedBy: { select: { firstName: true, lastName: true } },
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        appointment: { select: { id: true, title: true, scheduledAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return { success: true, data: prescriptions };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des prescriptions.") };
  }
}

// Réutilise exactement le mécanisme PendingInvoice déjà en place (pas de nouveau système de
// réservation) : rapprochement par nom avec le catalogue, le stock n'est décrémenté qu'à la
// finalisation (finalizePendingInvoice → recordMultiItemInvoice), inchangé.
export async function sendPrescriptionToPharmacy(prescriptionId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertPrescriptionWriteRole(activeUser.role);

    const prescription = await prisma.prescription.findUnique({ where: { id: prescriptionId }, include: { items: true } });
    if (!prescription) throw new Error("Ordonnance introuvable.");
    if (prescription.status !== "ACTIVE") {
      throw new Error("Cette ordonnance a déjà été envoyée à la pharmacie ou n'est plus active.");
    }

    const hasAccess = await verifyPatientAccess(prescription.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    if (!prescription.organizationId) throw new Error("Impossible de déterminer l'établissement du patient.");

    const items: any[] = [
      { type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 0, amount: 0 },
    ];
    const unavailable: string[] = [];

    for (const item of prescription.items) {
      const pharmacyItem = item.pharmacyItemId
        ? await prisma.pharmacyItem.findUnique({ where: { id: item.pharmacyItemId } })
        : await prisma.pharmacyItem.findFirst({
            where: { organizationId: prescription.organizationId, name: { equals: item.drugName, mode: "insensitive" } },
          });

      if (pharmacyItem) {
        const qty = item.quantity || 1;
        items.push({
          type: "PHARMACY",
          pharmacyItemId: pharmacyItem.id,
          description: `${pharmacyItem.name}${pharmacyItem.dosage ? ` (${pharmacyItem.dosage})` : ""}`,
          quantity: qty,
          unitPrice: pharmacyItem.unitPrice,
          amount: pharmacyItem.unitPrice * qty,
        });
        if (pharmacyItem.stockQuantity < qty) unavailable.push(pharmacyItem.name);
      }
    }

    const pendingInvoice = await prisma.pendingInvoice.create({
      data: {
        status: "PENDING",
        patientId: prescription.patientId,
        medicalRecordId: prescription.medicalRecordId,
        organizationId: prescription.organizationId,
        items,
        createdById: activeUser.id,
      },
    });

    await prisma.prescription.update({
      where: { id: prescriptionId },
      data: { status: "SENT_TO_PHARMACY", pendingInvoiceId: pendingInvoice.id, sentToPharmacyAt: new Date() },
    });

    await logAuditAction(activeUser.id, "SEND_PRESCRIPTION_TO_PHARMACY", "Prescription", prescriptionId, {
      pendingInvoiceId: pendingInvoice.id,
    });
    revalidatePath(`/dashboard/patients/${prescription.patientId}`);
    revalidatePath("/dashboard/finance");

    return { success: true, data: { pendingInvoiceId: pendingInvoice.id, unavailable } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'envoi vers la pharmacie.") };
  }
}
