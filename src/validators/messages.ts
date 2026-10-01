import { z } from "zod";

// Un message peut ne porter aucun texte s'il porte un patient partagé (ex: "partager ce dossier"
// sans commentaire) — le .refine ci-dessous n'exige un contenu que si rien d'autre n'est attaché.
export const sendMessageSchema = z
  .object({
    conversationId: z.string().min(1),
    content: z.string().max(4000, "Le message est trop long (4000 caractères maximum)."),
    sharedPatientId: z.string().min(1).optional(),
  })
  .refine((data) => data.content.trim().length > 0 || !!data.sharedPatientId, {
    message: "Le message ne peut pas être vide.",
    path: ["content"],
  });

export const createConversationSchema = z.object({
  targetUserId: z.string().min(1),
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom du canal doit contenir au moins 2 caractères.")
    .max(40, "Le nom du canal est trop long (40 caractères maximum)."),
  organizationId: z.string().optional(),
});
