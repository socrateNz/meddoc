"use server";

import { runIdempotent, type IdempotentInput } from "@/lib/idempotency";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { createCalendarEventSchema, updateCalendarEventSchema } from "@/validators/calendar-events";
import { revalidatePath } from "next/cache";

// Événement libre, toujours strictement personnel (cf. plan « Calendrier unifié » — getCalendarItems
// ne les élargit jamais, même pour COORDINATOR) : n'importe quel utilisateur authentifié peut en
// créer pour lui-même, aucun rôle particulier requis. userId est toujours fixé ici à
// activeUser.id, jamais accepté depuis le client.

export async function createCalendarEvent(data: Parameters<typeof createCalendarEventOnce>[0] & IdempotentInput) {
  const { idempotencyKey, ...payload } = data;
  return runIdempotent("createCalendarEvent", idempotencyKey, payload, () => createCalendarEventOnce(payload));
}

async function createCalendarEventOnce(data: { title: string; description?: string; startAt: string; endAt?: string; allDay?: boolean }) {
  try {
    createCalendarEventSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const event = await prisma.calendarEvent.create({
      data: {
        userId: activeUser.id,
        title: data.title,
        description: data.description || null,
        startAt: new Date(data.startAt),
        endAt: data.endAt ? new Date(data.endAt) : null,
        allDay: data.allDay ?? false,
      },
    });

    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard/clinics/[id]/appointments", "page");

    return { success: true, data: event };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de l'événement.") };
  }
}

export async function updateCalendarEvent(data: { id: string; title?: string; description?: string; startAt?: string; endAt?: string | null; allDay?: boolean }) {
  try {
    updateCalendarEventSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const existing = await prisma.calendarEvent.findUnique({ where: { id: data.id } });
    if (!existing) throw new Error("Événement introuvable.");
    if (existing.userId !== activeUser.id) throw new Error("Non autorisé.");

    const updatePayload: {
      title?: string;
      description?: string | null;
      startAt?: Date;
      endAt?: Date | null;
      allDay?: boolean;
    } = {};
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description || null;
    if (data.startAt !== undefined) updatePayload.startAt = new Date(data.startAt);
    if (data.endAt !== undefined) updatePayload.endAt = data.endAt ? new Date(data.endAt) : null;
    if (data.allDay !== undefined) updatePayload.allDay = data.allDay;

    const updated = await prisma.calendarEvent.update({ where: { id: data.id }, data: updatePayload });

    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard/clinics/[id]/appointments", "page");

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour de l'événement.") };
  }
}

export async function deleteCalendarEvent(id: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new Error("Événement introuvable.");
    if (existing.userId !== activeUser.id) throw new Error("Non autorisé.");

    await prisma.calendarEvent.delete({ where: { id } });

    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard/clinics/[id]/appointments", "page");

    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la suppression de l'événement.") };
  }
}
