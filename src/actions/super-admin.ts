"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { Role, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

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
}) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    if (!data.name || !data.adminEmail || !data.adminFirstName || !data.adminLastName) {
      throw new Error("All fields are required");
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
    return { holding: null, error: error.message || "Failed to create holding" };
  }
}

export async function updateHoldingSubscription(holdingId: string, data: { plan: SubscriptionPlan, status: SubscriptionStatus, licenseExpiresAt?: Date | null }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const holding = await prisma.organization.update({
      where: { id: holdingId },
      data: {
        plan: data.plan,
        subscriptionStatus: data.status,
        licenseExpiresAt: data.licenseExpiresAt
      }
    });

    revalidatePath("/dashboard/holdings");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: error.message || "Failed to update holding" };
  }
}
