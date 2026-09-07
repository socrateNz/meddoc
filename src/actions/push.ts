"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const subscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Upsert par endpoint (unique) : un même navigateur qui se réabonne met simplement à jour ses
// clés, et un autre utilisateur qui se connecte sur ce même appareil réassigne l'abonnement à son
// propre userId — pas de logique de désabonnement au logout nécessaire.
export async function subscribeToPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    const { endpoint, keys } = subscribeSchema.parse(subscription);

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: currentUser.id },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: currentUser.id },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors de l'abonnement aux notifications push." };
  }
}

export async function unsubscribeFromPush(endpoint: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    z.string().min(1).parse(endpoint);

    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: currentUser.id } });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Erreur lors du désabonnement des notifications push." };
  }
}
