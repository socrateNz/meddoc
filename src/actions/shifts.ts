"use server";

import { runIdempotent, type IdempotentInput } from "@/lib/idempotency";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { createShiftSchema, updateShiftSchema } from "@/validators/shifts";
import { revalidatePath } from "next/cache";

// Seul COORDINATOR planifie le personnel (cf. plan « Calendrier unifié ») — même principe que
// CONTRACT_WRITE_ROLES dans contracts.ts : ADMIN reste en lecture seule, y compris sur ses
// propres gardes si jamais il en avait une.
const SHIFT_WRITE_ROLES = ["COORDINATOR"];

function assertShiftWrite(activeUser: { role: string } | null) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (!SHIFT_WRITE_ROLES.includes(activeUser.role)) {
    throw new Error("Non autorisé. Réservé aux coordinateurs.");
  }
}

// Empêche un COORDINATOR d'affecter une garde à un membre du personnel d'une autre clinique —
// Shift.userId pointe vers N'IMPORTE QUEL rôle de staff (pas seulement Caregiver), donc pas de
// verifyPatientAccess/verifyPatientAccess-équivalent existant à réutiliser ici.
async function verifyUserInOrg(userId: string, activeUser: { organizationId: string | null }) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
  return !!target && target.organizationId === activeUser.organizationId;
}

export async function createShift(data: Parameters<typeof createShiftOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createShift", idempotencyKey, payload, () => createShiftOnce(payload));
}

async function createShiftOnce(data: { userId: string; title: string; startAt: string; endAt: string; notes?: string }) {
  try {
    createShiftSchema.parse(data);
    const activeUser = await getCurrentUser();
    assertShiftWrite(activeUser);

    const inOrg = await verifyUserInOrg(data.userId, activeUser!);
    if (!inOrg) throw new Error("Non autorisé. Ce membre du personnel ne fait pas partie de votre établissement.");

    const shift = await prisma.shift.create({
      data: {
        userId: data.userId,
        createdById: activeUser!.id,
        title: data.title,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        notes: data.notes || null,
      },
    });

    await logAuditAction(activeUser!.id, "CREATE_SHIFT", "Shift", shift.id, { userId: data.userId });

    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard/clinics/[id]/appointments", "page");

    return { success: true, data: shift };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de la garde.") };
  }
}

export async function updateShift(data: { id: string; userId?: string; title?: string; startAt?: string; endAt?: string; notes?: string }) {
  try {
    updateShiftSchema.parse(data);
    const activeUser = await getCurrentUser();
    assertShiftWrite(activeUser);

    const existing = await prisma.shift.findUnique({ where: { id: data.id } });
    if (!existing) throw new Error("Garde introuvable.");

    const inOrg = await verifyUserInOrg(existing.userId, activeUser!);
    if (!inOrg) throw new Error("Non autorisé.");

    if (data.userId && data.userId !== existing.userId) {
      const targetInOrg = await verifyUserInOrg(data.userId, activeUser!);
      if (!targetInOrg) throw new Error("Non autorisé. Ce membre du personnel ne fait pas partie de votre établissement.");
    }

    const updatePayload: {
      userId?: string;
      title?: string;
      startAt?: Date;
      endAt?: Date;
      notes?: string | null;
    } = {};
    if (data.userId !== undefined) updatePayload.userId = data.userId;
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.startAt !== undefined) updatePayload.startAt = new Date(data.startAt);
    if (data.endAt !== undefined) updatePayload.endAt = new Date(data.endAt);
    if (data.notes !== undefined) updatePayload.notes = data.notes || null;

    const updated = await prisma.shift.update({ where: { id: data.id }, data: updatePayload });

    await logAuditAction(activeUser!.id, "UPDATE_SHIFT", "Shift", data.id, {});

    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard/clinics/[id]/appointments", "page");

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour de la garde.") };
  }
}

export async function deleteShift(id: string) {
  try {
    const activeUser = await getCurrentUser();
    assertShiftWrite(activeUser);

    const existing = await prisma.shift.findUnique({ where: { id } });
    if (!existing) throw new Error("Garde introuvable.");

    const inOrg = await verifyUserInOrg(existing.userId, activeUser!);
    if (!inOrg) throw new Error("Non autorisé.");

    await prisma.shift.delete({ where: { id } });

    await logAuditAction(activeUser!.id, "DELETE_SHIFT", "Shift", id, {});

    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard/clinics/[id]/appointments", "page");

    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la suppression de la garde.") };
  }
}
