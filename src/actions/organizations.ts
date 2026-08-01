"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { createClinicSchema, updateClinicSchema } from "@/validators/organizations";
import { revalidatePath } from "next/cache";

export async function getClinics() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN" || user.organization?.type !== "HOLDING") {
      throw new Error("Unauthorized");
    }

    if (!user.organizationId) {
       throw new Error("User does not belong to a holding");
    }

    const clinics = await prisma.organization.findMany({
      where: {
        parentId: user.organizationId,
        type: "CLINIC"
      },
      include: {
        _count: {
          select: { users: true, patients: true }
        }
      },
      orderBy: {
        name: "asc"
      }
    });

    return { clinics, error: null };
  } catch (error: any) {
    console.error("Error fetching clinics:", error);
    return { clinics: [], error: error.message || "Failed to fetch clinics" };
  }
}

export async function createClinic(data: { name: string }) {
  try {
    createClinicSchema.parse(data);
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN" || user.organization?.type !== "HOLDING") {
      throw new Error("Unauthorized");
    }

    if (!user.organizationId) {
      throw new Error("User does not belong to a holding");
    }

    const clinic = await prisma.organization.create({
      data: {
        name: data.name,
        type: "CLINIC",
        parentId: user.organizationId
      }
    });

    revalidatePath("/dashboard/clinics");
    return { clinic, error: null };
  } catch (error: any) {
    console.error("Error creating clinic:", error);
    return { clinic: null, error: toErrorMessage(error, "Failed to create clinic") };
  }
}

export async function setClinicActive(id: string, isActive: boolean) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN" || user.organization?.type !== "HOLDING") {
      throw new Error("Unauthorized");
    }

    const existing = await prisma.organization.findFirst({
      where: { id, parentId: user.organizationId, type: "CLINIC" }
    });

    if (!existing) {
      throw new Error("Clinic not found or unauthorized");
    }

    const clinic = await prisma.organization.update({
      where: { id },
      data: { isActive }
    });

    revalidatePath(`/dashboard/clinics/${id}`);
    revalidatePath("/dashboard/clinics");
    return { clinic, error: null };
  } catch (error: any) {
    console.error("Error updating clinic status:", error);
    return { clinic: null, error: toErrorMessage(error, "Failed to update clinic status") };
  }
}

export async function updateClinic(id: string, data: { name: string }) {
  try {
    updateClinicSchema.parse({ id, name: data.name });
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    // Le coordinateur gère les paramètres de sa propre clinique ; l'admin de
    // holding garde la main sur toutes les cliniques qu'il détient.
    let existing;
    if (user.role === "ADMIN" && user.organization?.type === "HOLDING") {
      existing = await prisma.organization.findFirst({
        where: { id, parentId: user.organizationId, type: "CLINIC" }
      });
    } else if (user.role === "COORDINATOR" && user.organizationId === id) {
      existing = await prisma.organization.findFirst({ where: { id, type: "CLINIC" } });
    } else {
      throw new Error("Unauthorized");
    }

    if (!existing) {
      throw new Error("Clinic not found or unauthorized");
    }

    const clinic = await prisma.organization.update({
      where: { id },
      data: { name: data.name }
    });

    revalidatePath(`/dashboard/clinics/${id}`);
    revalidatePath("/dashboard/clinics");
    return { clinic, error: null };
  } catch (error: any) {
    console.error("Error updating clinic:", error);
    return { clinic: null, error: toErrorMessage(error, "Failed to update clinic") };
  }
}

