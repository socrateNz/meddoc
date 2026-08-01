import { z } from "zod";

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1, "Le message ne peut pas être vide"),
});

export const createConversationSchema = z.object({
  targetUserId: z.string().min(1),
});
