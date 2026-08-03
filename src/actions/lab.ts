"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  collectSampleSchema,
  recordLabResultSchema,
  createOrUpdateLabTestSchema,
} from "@/validators/lab";
import { consumeStockLots } from "@/actions/stock";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Pas de rôle « technicien/biologiste » dédié dans la hiérarchie actuelle : COORDINATOR et
// CAREGIVER prescrivent, prélèvent et saisissent les résultats bruts. Seul COORDINATOR valide
// (maker-checker à deux rôles) et gère le catalogue d'examens. ADMIN (holding) consulte en
// lecture seule ; PHARMACIST n'a pas accès au laboratoire.
const LAB_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
// Prescrire un examen (autorité diagnostique) est réservé au médecin ; prélever, réceptionner
// et saisir un résultat brut restent des gestes opérationnels que l'infirmier(e) garde.
const LAB_ORDER_ROLES = ["COORDINATOR", "MEDECIN"];
const LAB_OPERATE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER"];
const LAB_VALIDATE_ROLES = ["COORDINATOR", "MEDECIN"];
const LAB_AI_ROLES = ["COORDINATOR", "MEDECIN"];

function assertLabReadRole(role: string) {
  if (!LAB_READ_ROLES.includes(role)) throw new Error("Non autorisé.");
}

function assertLabOrderRole(role: string) {
  if (!LAB_ORDER_ROLES.includes(role)) throw new Error("Non autorisé. Seul un coordinateur ou un médecin peut prescrire un examen.");
}

function assertLabOperateRole(role: string) {
  if (!LAB_OPERATE_ROLES.includes(role)) throw new Error("Non autorisé. Réservé au personnel clinique.");
}

function assertLabValidateRole(role: string) {
  if (!LAB_VALIDATE_ROLES.includes(role)) throw new Error("Non autorisé. Seul un coordinateur ou un médecin peut valider un résultat.");
}

function assertLabAiRole(role: string) {
  if (!LAB_AI_ROLES.includes(role)) throw new Error("Non autorisé.");
}

const ORDER_INCLUDE = {
  patient: { include: { user: { select: { firstName: true, lastName: true } } } },
  orderedBy: { select: { firstName: true, lastName: true } },
  sampleCollectedBy: { select: { firstName: true, lastName: true } },
  results: {
    include: {
      recordedBy: { select: { firstName: true, lastName: true } },
      validatedBy: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

async function findMatchingLabTest(testName: string, organizationId: string | null) {
  if (!organizationId) return null;
  return prisma.labTest.findFirst({
    where: { organizationId, isActive: true, name: { equals: testName, mode: "insensitive" } },
  });
}

// Décompte automatiquement les consommables (tubes, aiguilles, gants...) définis dans le
// catalogue pour chaque examen prélevé. Ne bloque jamais le prélèvement si le stock est
// insuffisant — consomme au mieux, comme consumeStockLots le fait déjà pour les ventes.
async function consumeLabTestConsumables(tx: any, testNames: string[], organizationId: string | null) {
  const lowStockAlerts: { pharmacyItemId: string; itemName: string; stockQuantity: number; reorderLevel: number; organizationId: string | null }[] = [];
  if (!organizationId) return lowStockAlerts;
  for (const testName of testNames) {
    const catalogTest = await tx.labTest.findFirst({
      where: { organizationId, isActive: true, name: { equals: testName, mode: "insensitive" } },
    });
    const consumables = (catalogTest?.consumables as { pharmacyItemId: string; name: string; quantity: number }[] | null) || [];
    for (const c of consumables) {
      const item = await tx.pharmacyItem.findUnique({ where: { id: c.pharmacyItemId } });
      if (!item) continue;
      const qty = Math.min(Number(c.quantity) || 0, item.stockQuantity);
      if (qty <= 0) continue;
      await tx.pharmacyItem.update({ where: { id: c.pharmacyItemId }, data: { stockQuantity: { decrement: qty } } });
      await consumeStockLots(tx, c.pharmacyItemId, qty);

      // Alerte de rupture uniquement au franchissement du seuil.
      const newQty = item.stockQuantity - qty;
      if (item.stockQuantity > item.reorderLevel && newQty <= item.reorderLevel) {
        lowStockAlerts.push({ pharmacyItemId: item.id, itemName: item.name, stockQuantity: newQty, reorderLevel: item.reorderLevel, organizationId });
      }
    }
  }
  return lowStockAlerts;
}

// Fait avancer automatiquement le statut d'une demande selon l'état de ses résultats
// (jamais en arrière). Appelé après chaque saisie/validation de résultat.
async function advanceOrderStatus(labOrderId: string) {
  const order = await prisma.labOrder.findUnique({ where: { id: labOrderId }, include: { results: true } });
  if (!order || order.status === "CANCELLED" || order.status === "DELIVERED") return;

  const allTestsHaveResult = order.tests.every((t) => order.results.some((r) => r.testName === t));
  const allTestsValidated = order.tests.every((t) => order.results.some((r) => r.testName === t && r.validatedAt));

  let nextStatus = order.status;
  if (allTestsValidated && order.results.length > 0) {
    nextStatus = "VALIDATED";
  } else if (allTestsHaveResult) {
    nextStatus = "TO_VALIDATE";
  } else if (order.results.length > 0 && ["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB"].includes(order.status)) {
    nextStatus = "IN_ANALYSIS";
  }

  if (nextStatus !== order.status) {
    await prisma.labOrder.update({ where: { id: labOrderId }, data: { status: nextStatus } });
  }
}

export async function createLabOrder(data: {
  patientId: string;
  medicalRecordId?: string;
  tests: string[];
  notes?: string;
  priority?: "ROUTINE" | "URGENT";
}) {
  try {
    createLabOrderSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabOrderRole(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      select: { organizationId: true },
    });
    const organizationId = patient?.organizationId || null;

    const labOrder = await prisma.labOrder.create({
      data: {
        patientId: data.patientId,
        medicalRecordId: data.medicalRecordId || null,
        organizationId,
        tests: data.tests,
        notes: data.notes || null,
        priority: data.priority || "ROUTINE",
        status: "PRESCRIBED",
        orderedById: activeUser.id,
      },
    });

    // Facturation automatique : chaque examen catalogué et tarifé génère une ligne dans une
    // facture en attente (même mécanisme que la clôture de consultation — cf. completeConsultation).
    const items: any[] = [];
    for (const testName of data.tests) {
      const catalogTest = await findMatchingLabTest(testName, organizationId);
      if (catalogTest?.price) {
        items.push({
          type: "SERVICE",
          description: `Analyse : ${catalogTest.name}`,
          quantity: 1,
          unitPrice: catalogTest.price,
          amount: catalogTest.price,
        });
      }
    }
    if (items.length > 0) {
      await prisma.pendingInvoice.create({
        data: {
          status: "PENDING",
          patientId: data.patientId,
          medicalRecordId: data.medicalRecordId || null,
          organizationId,
          items,
          createdById: activeUser.id,
        },
      });
    }

    await logAuditAction(activeUser.id, "CREATE_LAB_ORDER", "LabOrder", labOrder.id, { patientId: data.patientId, tests: data.tests });

    revalidatePath("/dashboard/lab");
    revalidatePath("/dashboard/finance");
    revalidatePath(`/dashboard/patients/${data.patientId}`);

    return { success: true, data: labOrder, invoiceCreated: items.length > 0 };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de la demande d'analyse.") };
  }
}

export async function listLabOrders(options?: { patientId?: string; organizationId?: string; orderedById?: string }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabReadRole(activeUser.role);

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

    if (options?.orderedById) where.orderedById = options.orderedById;

    const labOrders = await prisma.labOrder.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: labOrders };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement des demandes d'analyse." };
  }
}

export async function getLabOrder(labOrderId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabReadRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        ...ORDER_INCLUDE,
        patient: {
          include: { user: true },
        },
        medicalRecord: { select: { title: true, diagnosisLabel: true, description: true } },
        organization: { select: { name: true } },
      },
    });
    if (!order) throw new Error("Demande d'analyse introuvable.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    return { success: true, data: order };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement de la demande d'analyse." };
  }
}

export async function collectSample(data: {
  labOrderId: string;
  sampleType: "BLOOD" | "URINE" | "STOOL" | "SALIVA" | "BIOPSY" | "CSF" | "OTHER";
  sampleQuantity?: string;
  sampleCondition?: string;
}) {
  try {
    collectSampleSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabOperateRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({ where: { id: data.labOrderId } });
    if (!order) throw new Error("Demande d'analyse introuvable.");
    if (order.status !== "PRESCRIBED") throw new Error("Le prélèvement a déjà été enregistré pour cette demande.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const { result: updated, lowStockAlerts } = await prisma.$transaction(async (tx) => {
      const result = await tx.labOrder.update({
        where: { id: data.labOrderId },
        data: {
          status: "SAMPLE_COLLECTED",
          sampleType: data.sampleType,
          sampleQuantity: data.sampleQuantity || null,
          sampleCondition: data.sampleCondition || null,
          sampleCollectedAt: new Date(),
          sampleCollectedById: activeUser.id,
        },
      });
      const lowStockAlerts = await consumeLabTestConsumables(tx, order.tests, order.organizationId);
      return { result, lowStockAlerts };
    });

    await logAuditAction(activeUser.id, "COLLECT_LAB_SAMPLE", "LabOrder", data.labOrderId, { sampleType: data.sampleType });

    if (lowStockAlerts.length > 0) {
      const { appEvents } = await import("@/lib/events");
      for (const alert of lowStockAlerts) appEvents.emit("stock.low", alert);
    }

    revalidatePath("/dashboard/lab");

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement du prélèvement.") };
  }
}

export async function receiveAtLab(labOrderId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabOperateRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({ where: { id: labOrderId } });
    if (!order) throw new Error("Demande d'analyse introuvable.");
    if (order.status !== "SAMPLE_COLLECTED") throw new Error("Cette demande n'est pas au stade du prélèvement.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const updated = await prisma.labOrder.update({ where: { id: labOrderId }, data: { status: "RECEIVED_AT_LAB" } });
    revalidatePath("/dashboard/lab");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la réception au laboratoire.") };
  }
}

export async function recordLabResult(data: {
  labOrderId: string;
  testName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  isAbnormal?: boolean;
  notes?: string;
}) {
  try {
    recordLabResultSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabOperateRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({ where: { id: data.labOrderId } });
    if (!order) throw new Error("Demande d'analyse introuvable.");
    if (order.status === "CANCELLED") throw new Error("Cette demande a été annulée.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    // Détection de valeur critique par correspondance avec le catalogue.
    let isAbnormal = !!data.isAbnormal;
    const catalogTest = await findMatchingLabTest(data.testName, order.organizationId);
    const numericValue = parseFloat(data.value);
    let isCritical = false;
    if (catalogTest && !isNaN(numericValue)) {
      if ((catalogTest.criticalLow != null && numericValue < catalogTest.criticalLow) ||
          (catalogTest.criticalHigh != null && numericValue > catalogTest.criticalHigh)) {
        isAbnormal = true;
        isCritical = true;
      }
    }

    const derivedReferenceRange =
      data.referenceRange ||
      (catalogTest?.criticalLow != null && catalogTest?.criticalHigh != null
        ? `${catalogTest.criticalLow} - ${catalogTest.criticalHigh}`
        : null);

    const result = await prisma.labResult.create({
      data: {
        labOrderId: data.labOrderId,
        testName: data.testName,
        value: data.value,
        unit: data.unit || null,
        referenceRange: derivedReferenceRange,
        isAbnormal,
        notes: data.notes || null,
        recordedById: activeUser.id,
      },
    });

    await advanceOrderStatus(data.labOrderId);

    if (isCritical) {
      try {
        const { appEvents } = await import("@/lib/events");
        appEvents.emit("lab.result.critical", {
          labOrderId: data.labOrderId,
          labResultId: result.id,
          patientId: order.patientId,
          orderedById: order.orderedById,
          organizationId: order.organizationId,
          testName: data.testName,
          value: data.value,
        });
      } catch (e) {
        console.error("Failed to emit lab.result.critical event:", e);
      }
    }

    await logAuditAction(activeUser.id, "RECORD_LAB_RESULT", "LabResult", result.id, { labOrderId: data.labOrderId, testName: data.testName, isCritical });

    revalidatePath("/dashboard/lab");
    revalidatePath(`/dashboard/patients/${order.patientId}`);

    return { success: true, data: result, isCritical };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement du résultat.") };
  }
}

export async function validateLabResult(resultId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabValidateRole(activeUser.role);

    const result = await prisma.labResult.findUnique({ where: { id: resultId }, include: { labOrder: true } });
    if (!result) throw new Error("Résultat introuvable.");
    if (result.validatedAt) throw new Error("Ce résultat est déjà validé et verrouillé.");

    const hasAccess = await verifyPatientAccess(result.labOrder.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const updated = await prisma.labResult.update({
      where: { id: resultId },
      data: { validatedById: activeUser.id, validatedAt: new Date() },
    });

    await advanceOrderStatus(result.labOrderId);

    await logAuditAction(activeUser.id, "VALIDATE_LAB_RESULT", "LabResult", resultId, { labOrderId: result.labOrderId });

    revalidatePath("/dashboard/lab");
    revalidatePath(`/dashboard/patients/${result.labOrder.patientId}`);

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la validation du résultat.") };
  }
}

export async function markDelivered(labOrderId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabOperateRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({ where: { id: labOrderId } });
    if (!order) throw new Error("Demande d'analyse introuvable.");
    if (order.status !== "VALIDATED") throw new Error("Tous les résultats doivent être validés avant la livraison.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const updated = await prisma.labOrder.update({ where: { id: labOrderId }, data: { status: "DELIVERED" } });
    revalidatePath("/dashboard/lab");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de la livraison.") };
  }
}

export async function updateLabOrderStatus(labOrderId: string, status: "PRESCRIBED" | "SAMPLE_COLLECTED" | "RECEIVED_AT_LAB" | "IN_ANALYSIS" | "TO_VALIDATE" | "VALIDATED" | "DELIVERED" | "CANCELLED") {
  try {
    updateLabOrderStatusSchema.parse({ labOrderId, status });
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabOperateRole(activeUser.role);

    const existing = await prisma.labOrder.findUnique({ where: { id: labOrderId } });
    if (!existing) throw new Error("Demande d'analyse introuvable.");

    const hasAccess = await verifyPatientAccess(existing.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const updated = await prisma.labOrder.update({ where: { id: labOrderId }, data: { status } });

    await logAuditAction(activeUser.id, "UPDATE_LAB_ORDER_STATUS", "LabOrder", labOrderId, { status });
    revalidatePath("/dashboard/lab");
    revalidatePath(`/dashboard/patients/${existing.patientId}`);

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du statut.") };
  }
}

// --- Catalogue d'examens (COORDINATOR uniquement) ---

export async function listLabTests(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabReadRole(activeUser.role);

    const targetOrgId = organizationId || activeUser.organizationId;
    const where: any = { isActive: true };
    if (targetOrgId) where.organizationId = targetOrgId;

    const labTests = await prisma.labTest.findMany({ where, orderBy: { name: "asc" } });
    return { success: true, data: labTests };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement du catalogue." };
  }
}

export async function createOrUpdateLabTest(data: {
  id?: string;
  name: string;
  department?: string;
  price?: number;
  durationMinutes?: number;
  criticalLow?: number;
  criticalHigh?: number;
  isActive?: boolean;
  organizationId?: string;
  consumables?: { pharmacyItemId: string; name: string; quantity: number }[];
}) {
  try {
    createOrUpdateLabTestSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    if (activeUser.role !== "COORDINATOR") throw new Error("Non autorisé. Réservé aux coordinateurs.");

    const targetOrgId = data.organizationId || activeUser.organizationId;

    let labTest;
    if (data.id) {
      labTest = await prisma.labTest.update({
        where: { id: data.id },
        data: {
          name: data.name,
          department: data.department || null,
          price: data.price ?? null,
          durationMinutes: data.durationMinutes ?? null,
          criticalLow: data.criticalLow ?? null,
          criticalHigh: data.criticalHigh ?? null,
          isActive: data.isActive ?? true,
          consumables: data.consumables ?? [],
        },
      });
    } else {
      labTest = await prisma.labTest.create({
        data: {
          name: data.name,
          department: data.department || null,
          price: data.price ?? null,
          durationMinutes: data.durationMinutes ?? null,
          criticalLow: data.criticalLow ?? null,
          criticalHigh: data.criticalHigh ?? null,
          organizationId: targetOrgId || null,
          consumables: data.consumables ?? [],
        },
      });
    }

    await logAuditAction(activeUser.id, data.id ? "UPDATE_LAB_TEST" : "CREATE_LAB_TEST", "LabTest", labTest.id, { name: data.name });
    revalidatePath("/dashboard/lab/catalog");

    return { success: true, data: labTest };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement de l'examen.") };
  }
}

export async function deactivateLabTest(id: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    if (activeUser.role !== "COORDINATOR") throw new Error("Non autorisé. Réservé aux coordinateurs.");

    const labTest = await prisma.labTest.update({ where: { id }, data: { isActive: false } });
    revalidatePath("/dashboard/lab/catalog");
    return { success: true, data: labTest };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la désactivation de l'examen.") };
  }
}

// Analyse IA à titre indicatif uniquement : compare les résultats de la demande aux résultats
// historiques du patient pour les mêmes analyses et produit un résumé clinique + des tendances.
// Jamais enregistré ni auto-inséré dans le dossier — purement consultatif côté équipe soignante.
export async function analyzeLabResults(labOrderId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertLabAiRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        results: true,
      },
    });
    if (!order) throw new Error("Demande d'analyse introuvable.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    if (order.results.length === 0) {
      throw new Error("Aucun résultat saisi pour cette demande — rien à analyser pour le moment.");
    }

    const historicalOrders = await prisma.labOrder.findMany({
      where: { patientId: order.patientId, id: { not: order.id }, status: { in: ["VALIDATED", "DELIVERED"] } },
      include: { results: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const currentSummary = order.results
      .map((r) => `- ${r.testName} : ${r.value} ${r.unit || ""} (réf: ${r.referenceRange || "n/a"})${r.isAbnormal ? " [ANORMAL]" : ""}`)
      .join("\n");

    const historySummary = historicalOrders
      .flatMap((o) =>
        o.results
          .filter((r) => order.tests.includes(r.testName))
          .map((r) => `[${o.createdAt.toLocaleDateString("fr-FR")}] ${r.testName} : ${r.value} ${r.unit || ""}${r.isAbnormal ? " [ANORMAL]" : ""}`)
      )
      .join("\n") || "Aucun résultat antérieur comparable pour ce patient.";

    const prompt = `
Vous êtes un assistant de laboratoire clinique. Votre rôle est UNIQUEMENT informatif : vous aidez le personnel soignant à repérer des tendances, jamais un diagnostic définitif.

PATIENT : ${order.patient.user.lastName} ${order.patient.user.firstName}

RÉSULTATS ACTUELS (demande en cours) :
${currentSummary}

HISTORIQUE DES RÉSULTATS ANTÉRIEURS (mêmes analyses, demandes validées précédentes) :
${historySummary}

Générez une analyse au format JSON strict :
{
  "summary": "Résumé clinique court (en français, ~80 mots) : évolution générale, points de vigilance",
  "trends": ["Ex: Glycémie en hausse constante sur les 3 dernières mesures", "..."],
  "flags": ["Ex: NFS hors normes à surveiller de près", "..."]
}
Règle impérative : ne formulez jamais de diagnostic ni de prescription. Basez-vous strictement sur les valeurs fournies. Si l'historique est insuffisant pour dégager une tendance, indiquez-le clairement dans "summary" et laissez "trends" vide.
    `;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const response = await model.generateContent(prompt);
    const parsed = JSON.parse(response.response.text());

    return {
      success: true,
      data: {
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        trends: Array.isArray(parsed.trends) ? parsed.trends : [],
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      },
    };
  } catch (error: any) {
    console.error("Lab AI analysis error:", error);

    if (error?.status === 429) {
      const retryInfo = error?.errorDetails?.find(
        (d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
      );
      const delayStr: string = retryInfo?.retryDelay ?? "60s";
      const retryAfterSeconds = parseInt(delayStr, 10) || 60;
      return {
        success: false,
        rateLimited: true,
        retryAfterSeconds,
        error: `Quota IA dépassé — réessayez dans ${retryAfterSeconds} secondes.`,
      };
    }

    if (error?.status === 503) {
      return {
        success: false,
        serviceUnavailable: true,
        error: "Le service IA est momentanément surchargé. Veuillez réessayer dans quelques instants.",
      };
    }

    return { success: false, error: toErrorMessage(error, "Impossible de générer l'analyse IA.") };
  }
}
