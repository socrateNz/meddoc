"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function sendMessage(data: {
  conversationId: string;
  content: string;
}) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    const message = await prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: currentUser.id,
        content: data.content,
      },
    });

    revalidatePath("/dashboard/messages");
    return { success: true, data: message };
  } catch (error: any) {
    console.error("Error sending message:", error);
    return { success: false, error: error.message || "Erreur lors de l'envoi du message" };
  }
}

export async function createConversation(targetUserId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    // Check if conversation already exists between these two users (for 1-to-1)
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: currentUser.id } } },
          { participants: { some: { userId: targetUserId } } }
        ]
      }
    });

    if (existing) {
      return { success: true, data: existing };
    }

    const conversation = await prisma.conversation.create({
      data: {
        participants: {
          create: [
            { userId: currentUser.id },
            { userId: targetUserId }
          ]
        }
      }
    });

    revalidatePath("/dashboard/messages");
    return { success: true, data: conversation };
  } catch (error: any) {
    console.error("Error creating conversation:", error);
    return { success: false, error: error.message || "Erreur de création de la conversation" };
  }
}
