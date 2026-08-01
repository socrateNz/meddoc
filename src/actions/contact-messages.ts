"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";

function assertSuperAdmin(activeUser: any) {
  if (!activeUser) throw new Error("Non authentifié.");
  if (activeUser.role !== "SUPER_ADMIN") {
    throw new Error("Non autorisé. Réservé au super-administrateur.");
  }
}

export async function listContactMessages() {
  try {
    const activeUser = await getCurrentUser();
    assertSuperAdmin(activeUser);

    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: messages };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des messages.") };
  }
}

export async function updateContactMessageStatus(messageId: string, status: "NEW" | "READ" | "ARCHIVED") {
  try {
    z.string().min(1).parse(messageId);
    z.enum(["NEW", "READ", "ARCHIVED"]).parse(status);

    const activeUser = await getCurrentUser();
    assertSuperAdmin(activeUser);

    const updated = await prisma.contactMessage.update({
      where: { id: messageId },
      data: { status },
    });

    revalidatePath("/dashboard/contact-messages");
    return { success: true, data: updated };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la mise à jour du message.") };
  }
}
