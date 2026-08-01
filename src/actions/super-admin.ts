"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
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
        const usersCount = await prisma.user.count({
          where: {
            OR: [
              { organizationId: holding.id },
              { organization: { parentId: holding.id } }
            ]
          }
        });

        const patientsCount = await prisma.patient.count({
          where: {
            OR: [
              { organizationId: holding.id },
              { organization: { parentId: holding.id } }
            ]
          }
        });

        return {
          ...holding,
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
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  licenseExpiresAt?: Date | null;
  paymentAmount?: number | null;
  paymentFrequency?: PaymentFrequency | null;
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
        plan: data.plan,
        subscriptionStatus: data.status,
        licenseExpiresAt: data.licenseExpiresAt,
        paymentAmount: data.paymentAmount ?? null,
        paymentFrequency: data.paymentFrequency ?? null,
      }
    });

    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: toErrorMessage(error, "Failed to update holding") };
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

    const [activeHoldingsForMrr, planGroups, watchExpiring, watchInactive, recentHoldings, recentContactMessages] = await Promise.all([
      prisma.organization.findMany({
        where: { type: "HOLDING", subscriptionStatus: "ACTIVE", paymentAmount: { not: null } },
        select: { paymentAmount: true, paymentFrequency: true },
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

    const mrr = activeHoldingsForMrr.reduce((sum, h) => {
      const amount = h.paymentAmount || 0;
      return sum + (h.paymentFrequency === "YEARLY" ? amount / 12 : amount);
    }, 0);

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
        mrr,
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
