"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { logAuditAction } from "@/middlewares/auditLogger";
import { createHoldingSchema, updateHoldingSubscriptionSchema } from "@/validators/super-admin";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { Role, SubscriptionPlan, SubscriptionStatus, PaymentFrequency } from "@prisma/client";

export async function getHoldings() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const rawHoldings = await prisma.organization.findMany({
      where: {
        type: "HOLDING"
      },
      include: {
        _count: {
          select: { children: true }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const holdings = await Promise.all(
      rawHoldings.map(async (holding) => {
        const [usersCount, patientsCount, adminUser] = await Promise.all([
          prisma.user.count({
            where: {
              OR: [
                { organizationId: holding.id },
                { organization: { parentId: holding.id } }
              ]
            }
          }),
          prisma.patient.count({
            where: {
              OR: [
                { organizationId: holding.id },
                { organization: { parentId: holding.id } }
              ]
            }
          }),
          // Premier administrateur de la holding — affiché sur la fiche détaillée et sur le
          // reçu/facture téléchargeable (cf. holding-actions-menu.tsx).
          prisma.user.findFirst({
            where: { organizationId: holding.id, role: "ADMIN" },
            orderBy: { createdAt: "asc" },
            select: { firstName: true, lastName: true, email: true },
          }),
        ]);

        return {
          ...holding,
          adminUser,
          _count: {
            children: holding._count.children,
            users: usersCount,
            patients: patientsCount
          }
        };
      })
    );

    return { holdings, error: null };
  } catch (error: any) {
    console.error("Error fetching holdings:", error);
    return { holdings: [], error: error.message || "Failed to fetch holdings" };
  }
}

export async function createHolding(data: {
  name: string;
  plan: SubscriptionPlan;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  licenseExpiresAt?: Date | null;
  paymentAmount?: number | null;
  paymentFrequency?: PaymentFrequency | null;
}) {
  try {
    createHoldingSchema.parse(data);
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.adminEmail }
    });

    if (existingUser) {
      throw new Error("Un utilisateur avec cet email existe déjà.");
    }

    const holding = await prisma.$transaction(async (tx) => {
      // 1. Create the holding
      const newHolding = await tx.organization.create({
        data: {
          name: data.name,
          type: "HOLDING",
          plan: data.plan,
          subscriptionStatus: "TRIALING",
          licenseExpiresAt: data.licenseExpiresAt,
          paymentAmount: data.paymentAmount ?? null,
          paymentFrequency: data.paymentFrequency ?? null,
        }
      });

      // 2. Create the first admin for this holding
      const hashedPassword = await bcrypt.hash("admin123", 10);
      
      await tx.user.create({
        data: {
          email: data.adminEmail,
          passwordHash: hashedPassword,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          role: Role.ADMIN,
          organizationId: newHolding.id,
          isActive: true,
          requiresPasswordChange: true,
        }
      });

      return newHolding;
    });

    revalidatePath("/dashboard/holdings");
    return { holding, error: null };
  } catch (error: any) {
    console.error("Error creating holding:", error);
    return { holding: null, error: toErrorMessage(error, "Failed to create holding") };
  }
}

export async function updateHoldingSubscription(holdingId: string, data: {
  name: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  licenseExpiresAt?: Date | null;
  paymentAmount?: number | null;
  paymentFrequency?: PaymentFrequency | null;
  maxClinics: number;
  maxUsers: number;
}) {
  try {
    updateHoldingSubscriptionSchema.parse({ holdingId, ...data });
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const holding = await prisma.organization.update({
      where: { id: holdingId },
      data: {
        name: data.name,
        plan: data.plan,
        subscriptionStatus: data.status,
        licenseExpiresAt: data.licenseExpiresAt,
        paymentAmount: data.paymentAmount ?? null,
        paymentFrequency: data.paymentFrequency ?? null,
        maxClinics: data.maxClinics,
        maxUsers: data.maxUsers,
      }
    });

    await logAuditAction(user.id, "UPDATE_HOLDING", "Organization", holdingId, { name: data.name, plan: data.plan, status: data.status });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: toErrorMessage(error, "Failed to update holding") };
  }
}

// Suspend l'accès d'une holding sans rien supprimer — réversible via reactivateHolding.
// Équivalent rapide (un clic) à changer le statut vers INACTIVE depuis "Modifier l'abonnement".
export async function deactivateHolding(holdingId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const holding = await prisma.organization.update({
      where: { id: holdingId, type: "HOLDING" },
      data: { subscriptionStatus: "INACTIVE" },
    });

    await logAuditAction(user.id, "DEACTIVATE_HOLDING", "Organization", holdingId, { name: holding.name });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: toErrorMessage(error, "Erreur lors de la désactivation.") };
  }
}

export async function reactivateHolding(holdingId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const holding = await prisma.organization.update({
      where: { id: holdingId, type: "HOLDING" },
      data: { subscriptionStatus: "ACTIVE" },
    });

    await logAuditAction(user.id, "REACTIVATE_HOLDING", "Organization", holdingId, { name: holding.name });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: toErrorMessage(error, "Erreur lors de la réactivation.") };
  }
}

// Suppression définitive — irréversible, contrairement à deactivateHolding. Bloquée tant que la
// holding a encore des cliniques rattachées : au-delà de ce garde-fou, la suppression en cascade
// entraînerait la perte de patients, dossiers médicaux et mouvements financiers réels. Une fois
// ce garde-fou passé, seule la holding elle-même et ses utilisateurs directement rattachés
// (généralement son seul administrateur) sont supprimés.
export async function deleteHolding(holdingId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const holding = await prisma.organization.findFirst({
      where: { id: holdingId, type: "HOLDING" },
      include: { _count: { select: { children: true } } },
    });
    if (!holding) throw new Error("Holding introuvable.");
    if (holding._count.children > 0) {
      throw new Error(
        "Impossible de supprimer : cette holding possède encore des cliniques rattachées. Retirez-les d'abord."
      );
    }

    await prisma.$transaction([
      prisma.user.deleteMany({ where: { organizationId: holdingId } }),
      prisma.organization.delete({ where: { id: holdingId } }),
    ]);

    await logAuditAction(user.id, "DELETE_HOLDING", "Organization", holdingId, { name: holding.name });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (error: any) {
    return { error: toErrorMessage(error, "Erreur lors de la suppression.") };
  }
}

export async function getSuperAdminOverview() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [allHoldingsForRevenue, planGroups, watchExpiring, watchInactive, recentHoldings, recentContactMessages] = await Promise.all([
      // Somme brute du coût de licence de TOUTES les holdings (peu importe le statut d'abonnement
      // ou la fréquence de paiement) — remplace l'ancien MRR (revenu mensuel récurrent, réservé aux
      // holdings ACTIVE et normalisé par mois) par un total cumulé plus simple, tel que demandé.
      prisma.organization.findMany({
        where: { type: "HOLDING", paymentAmount: { not: null } },
        select: { paymentAmount: true },
      }),
      prisma.organization.groupBy({
        by: ["plan"],
        where: { type: "HOLDING" },
        _count: { _all: true },
      }),
      prisma.organization.findMany({
        // MongoDB trie `null` avant toute date : sans `not: null` explicite,
        // `lte` remonte aussi les holdings à licence illimitée.
        where: { type: "HOLDING", licenseExpiresAt: { not: null, lte: in30Days } },
        select: { id: true, name: true, licenseExpiresAt: true, subscriptionStatus: true },
        orderBy: { licenseExpiresAt: "asc" },
      }),
      prisma.organization.findMany({
        where: { type: "HOLDING", subscriptionStatus: { in: ["INACTIVE", "CANCELLED"] } },
        select: { id: true, name: true, licenseExpiresAt: true, subscriptionStatus: true },
      }),
      prisma.organization.findMany({
        where: { type: "HOLDING" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, plan: true, createdAt: true },
      }),
      prisma.contactMessage.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const totalRevenue = allHoldingsForRevenue.reduce((sum, h) => sum + (h.paymentAmount || 0), 0);

    const planBreakdown = planGroups.map((g) => ({ plan: g.plan, count: g._count._all }));

    // Fusionne les deux listes de surveillance (licence proche + abonnement inactif),
    // dédupliquées par holding, avec la ou les raisons associées.
    const watchMap = new Map<string, { id: string; name: string; licenseExpiresAt: Date | null; subscriptionStatus: string; reasons: string[] }>();
    for (const h of watchExpiring) {
      watchMap.set(h.id, { ...h, reasons: ["EXPIRING"] });
    }
    for (const h of watchInactive) {
      const existing = watchMap.get(h.id);
      if (existing) {
        existing.reasons.push("INACTIVE");
      } else {
        watchMap.set(h.id, { ...h, reasons: ["INACTIVE"] });
      }
    }

    return {
      success: true,
      data: {
        totalRevenue,
        planBreakdown,
        holdingsToWatch: Array.from(watchMap.values()),
        recentHoldings,
        recentContactMessages,
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de la vue d'ensemble.") };
  }
}
