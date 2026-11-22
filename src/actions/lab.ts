"use server";

import { can } from "@/lib/permissions-catalog";

import { runIdempotent, type IdempotentInput } from "@/lib/idempotency";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTargetOrgId } from "@/lib/org-scope";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { resolvePage } from "@/lib/pagination";
import { computeLabOrderStatus, isCriticalValue, orderSamples, testsWithoutSample } from "@/lib/lab-rules";
import { randomUUID } from "crypto";
import { assertPrenatalVisitOfPatient } from "@/lib/maternity-server";
import { patientServiceWhere, restrictedServiceIds } from "@/lib/service-access";
import { decrementStockForItems } from "@/lib/stock-decrement";
import { accountSafely, postPartnerLabSale, reversePartnerLabSale } from "@/lib/accounting/postings";
import { evaluateResult, hasAnyValue, parseTemplate, presetById, type ResultData, type ResultTemplate, type StoredResultData } from "@/lib/lab-templates";
import { z } from "zod";

// null efface le modèle ; undefined (champ absent) aussi : le formulaire du catalogue envoie
// toujours le modèle courant.
function templateJson(template: ResultTemplate | null | undefined) {
  return template ? (template as unknown as Prisma.InputJsonValue) : null;
}
import {
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  collectSampleSchema,
  recordLabResultSchema,
  createOrUpdateLabTestSchema,
} from "@/validators/lab";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { assertUserModule, modulesOfUser } from "@/lib/modules-server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// LABORANTIN (technicien) et CAREGIVER prélèvent, réceptionnent et saisissent les résultats bruts ;
// COORDINATOR et MEDECIN valident (maker-checker à deux rôles). ADMIN (holding) consulte en lecture
// seule ; PHARMACIST n'a pas accès au laboratoire.
// Prescrire un examen (autorité diagnostique) est réservé au médecin ; prélever, réceptionner
// et saisir un résultat brut restent des gestes opérationnels (infirmier(e), laborantin).

function assertLabReadRole(role: string) {
  if (!can(role, "lab.read")) throw new Error("Non autorisé.");
}

function assertLabOrderRole(role: string) {
  if (!can(role, "lab.order")) throw new Error("Non autorisé. Seul un coordinateur ou un médecin peut prescrire un examen.");
}

function assertLabOperateRole(role: string) {
  if (!can(role, "lab.operate")) throw new Error("Non autorisé. Réservé au personnel clinique.");
}

function assertLabValidateRole(role: string) {
  if (!can(role, "lab.validate")) throw new Error("Non autorisé. Seul un coordinateur ou un médecin peut valider un résultat.");
}

function assertLabAiRole(role: string) {
  if (!can(role, "lab.ai")) throw new Error("Non autorisé.");
}

const ORDER_INCLUDE = {
  patient: { include: { user: { select: { firstName: true, lastName: true } } } },
  partner: { select: { id: true, name: true } },
  orderedBy: { select: { firstName: true, lastName: true } },
  sampleCollectedBy: { select: { firstName: true, lastName: true } },
  // Rendez-vous/consultation d'origine, quand connu — permet à la liste (listLabOrders, onglet
  // Laboratoire du dossier patient) de renvoyer vers cette consultation, comme le fait déjà le
  // dossier médical et l'ordonnance qui en sont issus (cf. patient-detail-view.tsx). getLabOrder
  // (détail d'une demande) le redemande avec un select plus riche, qui remplace celui-ci sans
  // conflit (spread puis override).
  appointment: { select: { id: true, title: true, scheduledAt: true } },
  // Statut de règlement réel (PENDING/PARTIAL/PAID) — seule source de vérité désormais pour
  // l'affichage (badge PaymentStatusBadge), plus de champ dédié sur LabOrder lui-même.
  pendingInvoice: { select: { status: true } },
  results: {
    include: {
      recordedBy: { select: { firstName: true, lastName: true } },
      validatedBy: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

// Prix d'un examen catalogué : le prix partenaire remplace le prix maison (base + produits
// consommés) pour une demande de partenaire, quand il est défini.
function labTestPrice(test: { totalPrice: number; partnerPrice?: number | null }, forPartner: boolean): number {
  return forPartner && test.partnerPrice != null ? test.partnerPrice : test.totalPrice;
}

async function findMatchingLabTest(testName: string, organizationId: string | null) {
  if (!organizationId) return null;
  return prisma.labTest.findFirst({
    where: { organizationId, isActive: true, name: { equals: testName, mode: "insensitive" } },
  });
}

// Résout, pour un lot de LabTest, le prix courant de chaque produit consommé (jamais mis en
// cache sur LabTest — cf. LabOrder.testDetails, qui fige ce prix au moment de CETTE commande
// précise). Un seul aller-retour pharmacyItem.findMany, quel que soit le nombre de
// tests/consommables du lot.
// Sans le module « Pharmacie & stock », les consommables ne sont ni facturés ni décomptés (le stock
// et la remise pharmacie n'existent pas pour cet établissement).
async function priceLabTests<T extends { id: string; name: string; basePrice: number; baseCost?: number; consumables: any }>(labTests: T[], includeConsumables = true) {
  const allIds = new Set<string>();
  for (const t of labTests) {
    for (const c of includeConsumables ? (t.consumables as { pharmacyItemId: string; name: string; quantity: number }[] | null) || [] : []) {
      allIds.add(c.pharmacyItemId);
    }
  }
  const products = allIds.size ? await prisma.pharmacyItem.findMany({ where: { id: { in: [...allIds] } } }) : [];
  const priceMap = new Map(products.map((p) => [p.id, p.unitPrice]));

  return labTests.map((t) => {
    const consumables = (includeConsumables ? (t.consumables as { pharmacyItemId: string; name: string; quantity: number }[] | null) || [] : []).map((c) => ({
      ...c,
      unitPrice: priceMap.get(c.pharmacyItemId) ?? 0,
    }));
    const totalPrice = Number(t.basePrice || 0) + consumables.reduce((sum, c) => sum + c.unitPrice * Number(c.quantity || 0), 0);
    return { ...t, consumables, totalPrice };
  });
}

// Fait avancer automatiquement le statut d'une demande selon l'état de ses résultats
// (jamais en arrière). Appelé après chaque saisie/validation de résultat.
async function advanceOrderStatus(labOrderId: string) {
  const order = await prisma.labOrder.findUnique({ where: { id: labOrderId }, include: { results: true } });
  if (!order) return;
  const nextStatus = computeLabOrderStatus(order);
  if (nextStatus !== order.status) {
    await prisma.labOrder.update({ where: { id: labOrderId }, data: { status: nextStatus } });
  }
}

export async function createLabOrder(data: Parameters<typeof createLabOrderOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createLabOrder", idempotencyKey, payload, () => createLabOrderOnce(payload));
}

async function createLabOrderOnce(data: {
  patientId: string;
  medicalRecordId?: string;
  appointmentId?: string;
  tests: string[];
  notes?: string;
  priority?: "ROUTINE" | "URGENT";
  prenatalVisitId?: string;
  partnerId?: string;
  partnerReference?: string;
}) {
  try {
    createLabOrderSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    // Sage-femme / infirmier(e) (CAREGIVER) : seulement le bilan d'une consultation prénatale,
    // comme dans le carnet de CPN. Toute autre demande reste réservée au médecin/coordinateur.
    // Examen externe d'un partenaire : la prescription vient du médecin du partenaire (bon de
    // demande), le laborantin l'enregistre.
    const prenatalByMidwife = !!data.prenatalVisitId && can(activeUser, "lab.order.prenatal");
    const partnerByLab = !!data.partnerId && can(activeUser, "lab.order.partner");
    if (!prenatalByMidwife && !partnerByLab) assertLabOrderRole(activeUser.role);

    const hasAccess = await verifyPatientAccess(data.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const patient = await prisma.patient.findUnique({
      where: { id: data.patientId },
      select: { organizationId: true },
    });
    const organizationId = patient?.organizationId || null;

    // Visite prénatale d'origine : doit appartenir à une grossesse de CETTE patiente.
    if (data.prenatalVisitId) await assertPrenatalVisitOfPatient(data.prenatalVisitId, data.patientId);

    const partner = data.partnerId
      ? await prisma.partner.findFirst({ where: { id: data.partnerId, organizationId: organizationId ?? undefined, isActive: true } })
      : null;
    if (data.partnerId && !partner) throw new Error("Partenaire introuvable ou désactivé.");

    // Résout le catalogue pour chaque examen avant création : le prix (base + produits
    // consommés) et la facturation en dépendent.
    const catalogTests = await Promise.all(data.tests.map((t) => findMatchingLabTest(t, organizationId)));
    const priced = await priceLabTests(catalogTests.filter((t): t is NonNullable<typeof t> => !!t), modulesOfUser(activeUser).includes("PHARMACIE"));
    const pricedByName = new Map(priced.map((t) => [t.name.toLowerCase(), t]));

    // Facturation automatique et instantané du tarif/de la recette : chaque examen catalogué
    // reconnu (même à 0 FCFA — être au catalogue reste le seul critère, comportement inchangé)
    // génère une ligne dans une facture en attente ET un instantané figé dans testDetails,
    // immunisé contre une modification ultérieure du catalogue (cf. dispensePendingInvoice).
    const items: any[] = [];
    const testDetails: any[] = [];
    data.tests.forEach((testName) => {
      const p = pricedByName.get(testName.toLowerCase());
      if (!p) return;
      // Partenaire : prix partenaire de l'examen s'il est défini, sinon prix maison.
      // Partenaire : son tarif propre (Partner.prices), sinon le prix partenaire commun, sinon le prix maison.
      const ownPrice = partner ? (partner.prices as Record<string, number> | null)?.[p.id] : undefined;
      const price = partner ? (typeof ownPrice === "number" ? ownPrice : labTestPrice(p, true)) : p.totalPrice;
      testDetails.push({
        testName,
        labTestId: p.id,
        basePrice: p.basePrice,
        baseCost: p.baseCost ?? 0,
        consumables: p.consumables,
        totalPrice: price,
        ...(partner ? { partnerPrice: p.partnerPrice ?? null, housePrice: p.totalPrice } : {}),
      });
      items.push({
        type: "LAB",
        description: `Analyse : ${p.name}${partner ? ` (${partner.name})` : ""}`,
        quantity: 1,
        unitPrice: price,
        amount: price,
      });
    });

    const labOrder = await prisma.labOrder.create({
      data: {
        patientId: data.patientId,
        medicalRecordId: data.medicalRecordId || null,
        appointmentId: data.appointmentId || null,
        prenatalVisitId: data.prenatalVisitId || null,
        organizationId,
        tests: data.tests,
        notes: data.notes || null,
        priority: data.priority || "ROUTINE",
        status: "PRESCRIBED",
        testDetails: testDetails.length > 0 ? testDetails : undefined,
        orderedById: activeUser.id,
        partnerId: partner?.id ?? null,
        partnerReference: partner ? data.partnerReference?.trim() || null : null,
      },
    });

    // Partenaire facturé en fin de mois : rien à régler à la caisse, l'examen figure sur son relevé.
    const billedToPartner = partner?.billing === "PARTNER";
    if (items.length > 0 && !billedToPartner) {
      const pendingInvoice = await prisma.pendingInvoice.create({
        data: {
          status: "PENDING",
          patientId: data.patientId,
          medicalRecordId: data.medicalRecordId || null,
          organizationId,
          items,
          createdById: activeUser.id,
        },
      });
      await prisma.labOrder.update({ where: { id: labOrder.id }, data: { pendingInvoiceId: pendingInvoice.id } });
    }

    // Vente à crédit au partenaire (D 4111 / C 7062) : la comptabilité n'empêche jamais la demande,
    // une écriture manquée est rattrapée par « Générer les écritures manquantes ».
    if (billedToPartner && items.length > 0) {
      await accountSafely(`Examens partenaire ${labOrder.id}`, organizationId, () => postPartnerLabSale(labOrder.id));
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

type ActiveLabUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type LabOrderListOptions = {
  patientId?: string;
  organizationId?: string;
  orderedById?: string;
  page?: number;
  pageSize?: number;
  // "ALL" ou absent = tous les statuts.
  status?: string;
  // Demandes URGENT, ou ayant au moins un résultat anormal non encore validé.
  urgentOnly?: boolean;
  // Patient, prescripteur, ou nom d'une analyse du catalogue.
  search?: string;
  // Paillasse (LabTest.department) : file de travail de la paillasse.
  bench?: string;
};

// Périmètre commun à la liste paginée et aux statistiques : un patient précis (avec contrôle
// d'accès), une clinique, la vue holding, ou les demandes d'un prescripteur.
async function labOrderScope(activeUser: ActiveLabUser, options: LabOrderListOptions): Promise<Prisma.LabOrderWhereInput[]> {
  const conditions: Prisma.LabOrderWhereInput[] = [];

  if (options.patientId) {
    const hasAccess = await verifyPatientAccess(options.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");
    conditions.push({ patientId: options.patientId });
  } else if (activeUser.organization?.type === "HOLDING" && !options.organizationId) {
    conditions.push({
      OR: [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ],
    });
  } else {
    const targetOrgId = await resolveTargetOrgId(activeUser, options.organizationId);
    conditions.push({ organizationId: targetOrgId ? targetOrgId : { in: [] } });
  }

  if (options.orderedById) conditions.push({ orderedById: options.orderedById });
  // Médecin/infirmier rattaché à des services : demandes des patients de ses services seulement
  // (cf. src/lib/service-access.ts ; le laborantin n'est pas restreint).
  const myServices = await restrictedServiceIds(activeUser);
  if (myServices) conditions.push({ patient: patientServiceWhere(myServices) });
  return conditions;
}

// Recherche : patient, prescripteur, ou analyses du catalogue dont le nom contient le terme.
// `tests` est une liste de libellés (pas de recherche par sous-chaîne possible en base), on passe
// donc par le catalogue pour retrouver les libellés correspondants.
async function labOrderSearch(term: string): Promise<Prisma.LabOrderWhereInput> {
  const matchingTests = await prisma.labTest.findMany({
    where: { name: { contains: term, mode: "insensitive" } },
    select: { name: true },
  });
  const person: Prisma.UserWhereInput = {
    OR: [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
    ],
  };
  return {
    OR: [
      { patient: { user: person } },
      { orderedBy: person },
      ...(matchingTests.length > 0 ? [{ tests: { hasSome: matchingTests.map((t) => t.name) } }] : []),
    ],
  };
}

const PENDING_LAB_STATUSES = ["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB"];
const CLOSED_LAB_STATUSES = ["DELIVERED", "CANCELLED"];

// Liste paginée (20 par page maximum), filtres appliqués côté serveur : une recherche ou un filtre
// doit porter sur TOUTES les demandes, pas seulement sur la page affichée.
export async function listLabOrders(options?: LabOrderListOptions) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabReadRole(activeUser.role);

    const conditions = await labOrderScope(activeUser, options ?? {});
    if (options?.status && options.status !== "ALL") conditions.push({ status: options.status });
    if (options?.urgentOnly) {
      conditions.push({
        OR: [{ priority: "URGENT" }, { results: { some: { isAbnormal: true, validatedAt: null } } }],
      });
    }
    const term = options?.search?.trim();
    if (term) conditions.push(await labOrderSearch(term));
    // File de travail d'une paillasse : demandes contenant au moins un examen du catalogue rattaché
    // à cette paillasse (LabTest.department).
    if (options?.bench) {
      const benchTests = await prisma.labTest.findMany({
        where: { department: { equals: options.bench, mode: "insensitive" }, ...(options.organizationId ? { organizationId: options.organizationId } : {}) },
        select: { name: true },
      });
      conditions.push({ tests: { hasSome: benchTests.map((t) => t.name) } });
    }

    const where: Prisma.LabOrderWhereInput = { AND: conditions };
    const { page, pageSize, skip, take } = resolvePage(options);
    const [labOrders, total] = await Promise.all([
      prisma.labOrder.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.labOrder.count({ where }),
    ]);

    return { success: true as const, data: labOrders, total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: error.message || "Erreur lors du chargement des demandes d'analyse." };
  }
}

// Compteurs des tableaux de bord : calculés en base sur tout le périmètre, jamais à partir de la
// page affichée (qui ne contient que 20 demandes au plus).
export async function getLabOrderStats(options?: { organizationId?: string; orderedById?: string }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabReadRole(activeUser.role);

    const scope = await labOrderScope(activeUser, { organizationId: options?.organizationId, orderedById: options?.orderedById });
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const countWhere = (extra: Prisma.LabOrderWhereInput) => prisma.labOrder.count({ where: { AND: [...scope, extra] } });

    const [pending, inAnalysis, toValidate, validatedToday, urgent, critical, open] = await Promise.all([
      countWhere({ status: { in: PENDING_LAB_STATUSES } }),
      countWhere({ status: "IN_ANALYSIS" }),
      countWhere({ status: "TO_VALIDATE" }),
      countWhere({ status: { in: ["VALIDATED", "DELIVERED"] }, updatedAt: { gte: startOfToday } }),
      countWhere({ priority: "URGENT", status: { notIn: CLOSED_LAB_STATUSES } }),
      countWhere({ results: { some: { isAbnormal: true, validatedAt: null } } }),
      countWhere({ status: { notIn: CLOSED_LAB_STATUSES } }),
    ]);

    return { success: true as const, data: { pending, inAnalysis, toValidate, validatedToday, urgent, critical, open } };
  } catch (error: any) {
    return { success: false as const, error: error.message || "Erreur lors du calcul des indicateurs de laboratoire." };
  }
}

export async function getLabOrder(labOrderId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabReadRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        ...ORDER_INCLUDE,
        patient: {
          include: { user: true },
        },
        medicalRecord: { select: { title: true, diagnosisLabel: true, description: true } },
        appointment: { select: { id: true, title: true, scheduledAt: true, type: true } },
        prenatalVisit: { select: { id: true, visitDate: true, cpnNumber: true, gestationalWeeks: true } },
        organization: { select: { name: true, logoUrl: true } },
        // Examen d'un partenaire : son en-tête remplace celui de la clinique sur le rapport.
        partner: { select: { id: true, name: true, logoUrl: true, address: true, phone: true, email: true, billing: true } },
      },
    });
    if (!order) throw new Error("Demande d'analyse introuvable.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    // Modèles de compte rendu des examens demandés (catalogue actuel), pour la saisie des résultats.
    const catalog = order.organizationId
      ? await prisma.labTest.findMany({
          where: { organizationId: order.organizationId, name: { in: order.tests } },
          select: { name: true, resultTemplate: true },
        })
      : [];
    const templates: Record<string, ResultTemplate> = {};
    for (const t of catalog) {
      const template = parseTemplate(t.resultTemplate);
      if (template) templates[t.name] = template;
    }

    return { success: true, data: { ...order, templates } };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du chargement de la demande d'analyse." };
  }
}

// Un prélèvement (tube) couvre un ou plusieurs examens de la demande : on peut faire un tube
// commun ou un tube par examen. Sans `tests`, le tube couvre tous les examens encore sans
// prélèvement. La demande passe à « Échantillon prélevé » dès le premier tube.
export async function collectSample(data: {
  labOrderId: string;
  sampleType: "BLOOD" | "URINE" | "STOOL" | "SALIVA" | "BIOPSY" | "CSF" | "OTHER";
  tests?: string[];
  sampleQuantity?: string;
  sampleCondition?: string;
}) {
  try {
    collectSampleSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabOperateRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({ where: { id: data.labOrderId }, include: { sampleCollectedBy: { select: { firstName: true, lastName: true } } } });
    if (!order) throw new Error("Demande d'analyse introuvable.");
    if (["CANCELLED", "VALIDATED", "DELIVERED"].includes(order.status)) throw new Error("Cette demande n'accepte plus de prélèvement.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    const remaining = testsWithoutSample(order);
    if (remaining.length === 0) throw new Error("Tous les examens de cette demande ont déjà un prélèvement.");
    const tests = data.tests && data.tests.length > 0 ? [...new Set(data.tests)] : remaining;
    const invalid = tests.filter((t) => !remaining.includes(t));
    if (invalid.length > 0) throw new Error(`Déjà prélevé ou absent de la demande : ${invalid.join(", ")}.`);

    // Le prélèvement n'est plus gaté par le règlement (vente à crédit possible, comme en
    // pharmacie) et ne décompte plus le stock lui-même — cf. dispensePendingInvoice dans
    // finance.ts, qui décompte les produits consommés (LabOrder.testDetails) au moment où le
    // patient les récupère au comptoir pharmacie, exactement comme pour un médicament.
    const now = new Date();
    // Une ancienne demande prélevée une seule fois garde son tube, repris dans la liste.
    const existing = order.samples.length > 0 ? order.samples : orderSamples(order).map((s) => ({
      id: randomUUID(),
      sampleType: s.sampleType,
      tests: s.tests,
      quantity: s.quantity,
      condition: s.condition,
      collectedAt: new Date(s.collectedAt),
      collectedById: order.sampleCollectedById || activeUser.id,
      collectedByName: s.collectedByName,
      receivedAt: s.receivedAt ? new Date(s.receivedAt) : null,
    }));
    const sample = {
      id: randomUUID(),
      sampleType: data.sampleType,
      tests,
      quantity: data.sampleQuantity || null,
      condition: data.sampleCondition || null,
      collectedAt: now,
      collectedById: activeUser.id,
      collectedByName: [activeUser.firstName, activeUser.lastName].filter(Boolean).join(" ") || null,
      receivedAt: null,
    };
    const first = existing.length === 0;

    const updated = await prisma.labOrder.update({
      where: { id: data.labOrderId },
      data: {
        samples: [...existing, sample],
        ...(order.status === "PRESCRIBED" ? { status: "SAMPLE_COLLECTED" } : {}),
        // Champs historiques = premier prélèvement (HL7, compte-rendu).
        ...(first
          ? {
              sampleType: data.sampleType,
              sampleQuantity: data.sampleQuantity || null,
              sampleCondition: data.sampleCondition || null,
              sampleCollectedAt: now,
              sampleCollectedById: activeUser.id,
            }
          : {}),
      },
    });

    // Examen facturé au partenaire en fin de mois : aucun ticket de caisse, donc aucune remise en
    // pharmacie pour décompter les produits consommés — ils sortent du stock au premier
    // prélèvement, une seule fois. Un stock insuffisant n'empêche pas le prélèvement : il est
    // signalé, à régulariser par la pharmacie.
    let stockWarning: string | null = null;
    if (order.partnerId && !order.pendingInvoiceId && !order.consumablesConsumedAt) {
      const consumables = ((order.testDetails as any[]) || []).flatMap((td) =>
        ((td.consumables as any[]) || []).map((c) => ({
          type: "PHARMACY" as const,
          pharmacyItemId: c.pharmacyItemId as string,
          description: c.name as string,
          quantity: Number(c.quantity) || 0,
        }))
      );
      if (consumables.length > 0) {
        try {
          const alerts = await prisma.$transaction(async (tx) => {
            const claimed = await tx.labOrder.updateMany({ where: { id: order.id, consumablesConsumedAt: null }, data: { consumablesConsumedAt: new Date() } });
            if (claimed.count === 0) return [];
            return decrementStockForItems(tx, consumables, order.organizationId);
          });
          if (alerts.length > 0) {
            const { appEvents } = await import("@/lib/events");
            for (const alert of alerts) appEvents.emit("stock.low", alert);
          }
        } catch (e) {
          stockWarning = `Produits consommés non décomptés du stock : ${toErrorMessage(e, "erreur inconnue")}`;
        }
      }
    }

    await logAuditAction(activeUser.id, "COLLECT_LAB_SAMPLE", "LabOrder", data.labOrderId, { sampleType: data.sampleType, tests, stockWarning });

    revalidatePath("/dashboard/lab");
    revalidatePath(`/dashboard/lab/${data.labOrderId}`);

    return { success: true, data: updated, stockWarning };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'enregistrement du prélèvement.") };
  }
}

// Réception au laboratoire d'un tube (sampleId) ou de tous les tubes en attente. La demande passe
// à « Reçu au laboratoire » quand tous ses examens sont prélevés et tous les tubes reçus.
export async function receiveAtLab(labOrderId: string, sampleId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabOperateRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({ where: { id: labOrderId } });
    if (!order) throw new Error("Demande d'analyse introuvable.");
    if (["PRESCRIBED", "CANCELLED", "DELIVERED"].includes(order.status) && order.samples.length === 0) {
      throw new Error("Cette demande n'est pas au stade du prélèvement.");
    }

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const now = new Date();
    let samples = order.samples;
    if (samples.length > 0) {
      if (sampleId && !samples.some((s) => s.id === sampleId)) throw new Error("Prélèvement introuvable.");
      samples = samples.map((s) => (!s.receivedAt && (!sampleId || s.id === sampleId) ? { ...s, receivedAt: now } : s));
    } else if (order.status !== "SAMPLE_COLLECTED") {
      throw new Error("Cette demande n'est pas au stade du prélèvement.");
    }

    const allReceived = samples.every((s) => s.receivedAt);
    const allCollected = testsWithoutSample({ ...order, samples }).length === 0;
    const advance = order.status === "SAMPLE_COLLECTED" && allReceived && allCollected;

    const updated = await prisma.labOrder.update({
      where: { id: labOrderId },
      data: { ...(order.samples.length > 0 ? { samples } : {}), ...(advance ? { status: "RECEIVED_AT_LAB" } : {}) },
    });
    revalidatePath("/dashboard/lab");
    revalidatePath(`/dashboard/lab/${labOrderId}`);
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la réception au laboratoire.") };
  }
}

export async function recordLabResult(data: Parameters<typeof recordLabResultOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("recordLabResult", idempotencyKey, payload, () => recordLabResultOnce(payload));
}

async function recordLabResultOnce(data: {
  labOrderId: string;
  testName: string;
  value?: string;
  data?: ResultData;
  unit?: string;
  referenceRange?: string;
  isAbnormal?: boolean;
  notes?: string;
}) {
  try {
    recordLabResultSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabOperateRole(activeUser.role);

    const order = await prisma.labOrder.findUnique({ where: { id: data.labOrderId } });
    if (!order) throw new Error("Demande d'analyse introuvable.");
    if (order.status === "CANCELLED") throw new Error("Cette demande a été annulée.");

    const hasAccess = await verifyPatientAccess(order.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé. Ce patient ne fait pas partie de votre établissement.");

    // Détection de valeur critique par correspondance avec le catalogue.
    const catalogTest = await findMatchingLabTest(data.testName, order.organizationId);

    // Compte rendu structuré : le modèle actuel de l'examen au catalogue est figé avec les valeurs,
    // la valeur texte devient le résumé et les anomalies sont calculées sur les références du modèle.
    let structured: StoredResultData | null = null;
    let value = data.value?.trim() ?? "";
    let templateAbnormal = false;
    if (data.data) {
      const template = parseTemplate(catalogTest?.resultTemplate);
      if (!template) throw new Error("Cet examen n'a pas de modèle de compte rendu au catalogue.");
      if (!hasAnyValue(template, data.data)) throw new Error("Saisissez au moins un résultat.");
      const evaluation = evaluateResult(template, data.data);
      structured = { ...data.data, template };
      value = evaluation.summary;
      templateAbnormal = evaluation.isAbnormal;
    }

    const isCritical = structured ? false : isCriticalValue(catalogTest, value);
    const isAbnormal = !!data.isAbnormal || isCritical || templateAbnormal;

    const derivedReferenceRange =
      data.referenceRange ||
      (catalogTest?.criticalLow != null && catalogTest?.criticalHigh != null
        ? `${catalogTest.criticalLow} - ${catalogTest.criticalHigh}`
        : null);

    const result = await prisma.labResult.create({
      data: {
        labOrderId: data.labOrderId,
        testName: data.testName,
        value,
        unit: structured ? null : data.unit || null,
        referenceRange: structured ? null : derivedReferenceRange,
        isAbnormal,
        notes: data.notes || null,
        data: structured ? (structured as unknown as Prisma.InputJsonValue) : undefined,
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
          value,
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
    assertUserModule(activeUser, "LABORATOIRE");
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
    assertUserModule(activeUser, "LABORATOIRE");
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
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabOperateRole(activeUser.role);

    const existing = await prisma.labOrder.findUnique({ where: { id: labOrderId } });
    if (!existing) throw new Error("Demande d'analyse introuvable.");

    const hasAccess = await verifyPatientAccess(existing.patientId, activeUser);
    if (!hasAccess) throw new Error("Non autorisé.");

    const updated = await prisma.labOrder.update({ where: { id: labOrderId }, data: { status } });

    // Examen facturé au partenaire puis annulé : sa vente (créance 4111) est contrepassée.
    if (status === "CANCELLED" && existing.status !== "CANCELLED" && existing.partnerId && !existing.pendingInvoiceId && existing.organizationId) {
      const orgId = existing.organizationId;
      await accountSafely(`Annulation examens partenaire ${labOrderId}`, orgId, () => reversePartnerLabSale(orgId, labOrderId));
    }

    await logAuditAction(activeUser.id, "UPDATE_LAB_ORDER_STATUS", "LabOrder", labOrderId, { status });
    revalidatePath("/dashboard/lab");
    revalidatePath(`/dashboard/patients/${existing.patientId}`);

    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du statut.") };
  }
}

// --- Catalogue d'examens (COORDINATOR uniquement) ---

export async function listLabTests(organizationId?: string, options?: { page?: number; pageSize?: number; search?: string }) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    assertLabReadRole(activeUser.role);

    const targetOrgId = await resolveTargetOrgId(activeUser, organizationId);
    const where: any = { isActive: true };
    if (targetOrgId) where.organizationId = targetOrgId;

    // Recherche sur le nom, faite en base : une recherche porte sur TOUT le catalogue.
    const term = options?.search?.trim();
    if (term) where.name = { contains: term, mode: "insensitive" };

    const { page, pageSize, skip, take } = resolvePage(options);
    const [labTests, total] = await Promise.all([
      prisma.labTest.findMany({ where, orderBy: { name: "asc" }, skip, take }),
      prisma.labTest.count({ where }),
    ]);
    return { success: true as const, data: await priceLabTests(labTests, modulesOfUser(activeUser).includes("PHARMACIE")), total, page, pageSize };
  } catch (error: any) {
    return { success: false as const, error: error.message || "Erreur lors du chargement du catalogue." };
  }
}

export async function createOrUpdateLabTest(data: {
  id?: string;
  name: string;
  department?: string;
  basePrice?: number;
  baseCost?: number;
  partnerPrice?: number | null;
  resultTemplate?: ResultTemplate | null;
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
    assertUserModule(activeUser, "LABORATOIRE");
    if (!can(activeUser, "lab.catalog")) throw new Error("Non autorisé. Réservé aux coordinateurs.");

    const targetOrgId = await resolveTargetOrgId(activeUser, data.organizationId);

    let labTest;
    if (data.id) {
      labTest = await prisma.labTest.update({
        where: { id: data.id },
        data: {
          name: data.name,
          department: data.department || null,
          basePrice: data.basePrice ?? 0,
          baseCost: data.baseCost ?? 0,
          partnerPrice: data.partnerPrice ?? null,
          resultTemplate: templateJson(data.resultTemplate),
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
          basePrice: data.basePrice ?? 0,
          baseCost: data.baseCost ?? 0,
          partnerPrice: data.partnerPrice ?? null,
          resultTemplate: templateJson(data.resultTemplate),
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

const importLabTestsSchema = z.object({
  organizationId: z.string().optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        department: z.string().trim().max(60).optional(),
        basePrice: z.number().min(0),
        baseCost: z.number().min(0).optional(),
        partnerPrice: z.number().min(0).optional(),
        durationMinutes: z.number().min(0).optional(),
        templateId: z.string().optional(),
      })
    )
    .min(1, "Aucune ligne à importer")
    .max(2000),
});

// Import CSV du catalogue d'examens. Rapprochement par NOM (insensible à la casse) : un examen
// déjà au catalogue est mis à jour (prix, paillasse, durée, modèle si fourni) — réimporter la
// grille de prix ne crée pas de doublons. Les consommables et seuils critiques se règlent
// ensuite examen par examen.
export async function importLabTests(input: z.input<typeof importLabTestsSchema>) {
  try {
    const data = importLabTestsSchema.parse(input);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    if (!can(activeUser, "lab.catalog")) throw new Error("Non autorisé. Réservé aux coordinateurs.");
    const organizationId = await resolveTargetOrgId(activeUser, data.organizationId);
    if (!organizationId) throw new Error("Établissement requis.");

    const existing = await prisma.labTest.findMany({ where: { organizationId }, select: { id: true, name: true } });
    const idByName = new Map(existing.map((t) => [t.name.trim().toLowerCase(), t.id]));
    const seen = new Set<string>();
    const failures: { name: string; error: string }[] = [];
    let created = 0;
    let updated = 0;

    for (const item of data.items) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) {
        failures.push({ name: item.name, error: "En double dans le fichier : seule la première ligne est prise en compte." });
        continue;
      }
      seen.add(key);
      const preset = item.templateId ? presetById(item.templateId) : undefined;
      if (item.templateId && !preset) {
        failures.push({ name: item.name, error: `Modèle de compte rendu inconnu (« ${item.templateId} »).` });
        continue;
      }
      const fields = {
        name: item.name,
        department: item.department || preset?.bench || null,
        basePrice: item.basePrice,
        ...(item.baseCost != null ? { baseCost: item.baseCost } : {}),
        ...(item.partnerPrice != null ? { partnerPrice: item.partnerPrice } : {}),
        ...(item.durationMinutes != null ? { durationMinutes: item.durationMinutes } : {}),
        ...(preset ? { resultTemplate: preset.template as unknown as Prisma.InputJsonValue } : {}),
        isActive: true,
      };
      try {
        const id = idByName.get(key);
        if (id) {
          await prisma.labTest.update({ where: { id }, data: fields });
          updated++;
        } else {
          await prisma.labTest.create({ data: { ...fields, organizationId, consumables: [] } });
          created++;
        }
      } catch (error) {
        failures.push({ name: item.name, error: toErrorMessage(error, "Erreur inconnue") });
      }
    }

    await logAuditAction(activeUser.id, "IMPORT_LAB_TESTS_CSV", "LabTest", "bulk", { created, updated, failures: failures.length });
    revalidatePath("/dashboard/lab/catalog");
    return { success: true as const, data: { created, updated, failures } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'import du catalogue.") };
  }
}

export async function deactivateLabTest(id: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "LABORATOIRE");
    if (!can(activeUser, "lab.catalog")) throw new Error("Non autorisé. Réservé aux coordinateurs.");

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
    assertUserModule(activeUser, "LABORATOIRE");
    assertUserModule(activeUser, "IA");
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
