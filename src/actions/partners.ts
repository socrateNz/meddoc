"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { assertOrganizationAccess } from "@/lib/org-scope";
import { assertUserModule } from "@/lib/modules-server";

// Cliniques partenaires (cf. modèle Partner) : leurs patients font leurs examens au laboratoire,
// les résultats sortent à leur en-tête et les examens leur sont facturés au prix partenaire.

// Choisir un partenaire sur une demande : ceux qui enregistrent les demandes.
const PARTNER_PICK_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "LABORANTIN", "CAREGIVER"];
// Relevé (montants dus) : direction et comptabilité.
const STATEMENT_ROLES = ["ADMIN", "COORDINATOR", "COMPTABLE"];

const savePartnerSchema = z.object({
  clinicId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(2, "Nom du partenaire requis").max(80),
  // Data URI d'image redimensionnée côté client (comme le logo de la clinique).
  logoUrl: z
    .string()
    .max(400_000, "Logo trop volumineux")
    .refine((v) => v === "" || v.startsWith("data:image/"), "Logo invalide")
    .optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(120).optional(),
  billing: z.enum(["PARTNER", "PATIENT"]),
  isActive: z.boolean().default(true),
});

export async function listPartners(clinicId: string, options?: { includeInactive?: boolean }) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");
    assertUserModule(user, "LABORATOIRE");
    if (!PARTNER_PICK_ROLES.includes(user.role) && !STATEMENT_ROLES.includes(user.role)) throw new Error("Non autorisé.");
    await assertOrganizationAccess(user, clinicId);
    const partners = await prisma.partner.findMany({
      where: { organizationId: clinicId, ...(options?.includeInactive ? {} : { isActive: true }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true, address: true, phone: true, email: true, billing: true, isActive: true },
    });
    return { success: true as const, data: partners };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des partenaires.") };
  }
}

export async function savePartner(input: z.input<typeof savePartnerSchema>) {
  try {
    const data = savePartnerSchema.parse(input);
    const user = await getCurrentUser();
    if (!user || user.role !== "COORDINATOR" || user.organizationId !== data.clinicId) {
      throw new Error("Non autorisé. Seul le coordinateur de la clinique gère les partenaires.");
    }
    const duplicate = await prisma.partner.findFirst({
      where: { organizationId: data.clinicId, name: { equals: data.name, mode: "insensitive" }, ...(data.id ? { NOT: { id: data.id } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new Error(`Un partenaire « ${data.name} » existe déjà.`);

    const fields = {
      name: data.name,
      logoUrl: data.logoUrl || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      billing: data.billing,
      isActive: data.isActive,
    };
    let partner;
    if (data.id) {
      const existing = await prisma.partner.findFirst({ where: { id: data.id, organizationId: data.clinicId }, select: { id: true } });
      if (!existing) throw new Error("Partenaire introuvable.");
      partner = await prisma.partner.update({ where: { id: data.id }, data: fields });
    } else {
      partner = await prisma.partner.create({ data: { ...fields, organizationId: data.clinicId } });
    }
    await logAuditAction(user.id, data.id ? "UPDATE_PARTNER" : "CREATE_PARTNER", "Partner", partner.id);
    revalidatePath(`/dashboard/clinics/${data.clinicId}`, "layout");
    return { success: true as const, data: { id: partner.id, name: partner.name } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement du partenaire.") };
  }
}

type TestDetail = { testName: string; totalPrice?: number };

// Relevé d'un partenaire sur un mois (AAAA-MM) : chaque demande, ses examens au prix figé à la
// commande (LabOrder.testDetails), et le total dû. Les demandes annulées sont exclues.
export async function getPartnerStatement(input: { partnerId: string; month: string }) {
  try {
    const data = z.object({ partnerId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/, "Mois invalide") }).parse(input);
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");
    assertUserModule(user, "LABORATOIRE");
    if (!STATEMENT_ROLES.includes(user.role)) throw new Error("Non autorisé.");
    const partner = await prisma.partner.findUnique({ where: { id: data.partnerId } });
    if (!partner) throw new Error("Partenaire introuvable.");
    await assertOrganizationAccess(user, partner.organizationId);

    const [y, m] = data.month.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    const orders = await prisma.labOrder.findMany({
      where: { partnerId: partner.id, createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        tests: true,
        testDetails: true,
        partnerReference: true,
        pendingInvoiceId: true,
        patient: { select: { ipp: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });

    const rows = orders.map((o) => {
      const details = (o.testDetails as unknown as TestDetail[] | null) ?? [];
      const priceByTest = new Map(details.map((d) => [d.testName, Number(d.totalPrice) || 0]));
      const exams = o.tests.map((t) => ({ name: t, price: priceByTest.get(t) ?? 0 }));
      return {
        id: o.id,
        date: o.createdAt.toISOString(),
        status: o.status,
        reference: o.partnerReference,
        patientName: o.patient?.user ? `${o.patient.user.lastName} ${o.patient.user.firstName}` : "Patient",
        ipp: o.patient?.ipp ?? null,
        exams,
        total: exams.reduce((sum, e) => sum + e.price, 0),
        // Réglé par le patient à la caisse (partenaire en mode PATIENT au moment de la demande).
        paidByPatient: !!o.pendingInvoiceId,
      };
    });
    const total = rows.filter((r) => !r.paidByPatient).reduce((sum, r) => sum + r.total, 0);

    return {
      success: true as const,
      data: {
        partner: { id: partner.id, name: partner.name, billing: partner.billing },
        month: data.month,
        rows,
        total,
        examCount: rows.reduce((sum, r) => sum + r.exams.length, 0),
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du calcul du relevé.") };
  }
}
