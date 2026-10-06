"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { MAX_PAGE_SIZE } from "@/lib/pagination";
import { sendMessageSchema, createConversationSchema, createChannelSchema } from "@/validators/messages";
import { revalidatePath } from "next/cache";
import {
  canCreateChannel,
  canSharePatient,
  isOrgInScope,
  MESSAGE_INCLUDE,
  orgScopeWhere,
} from "@/app/dashboard/messages/messages-data";

function assertChannelCreateRole(role: string) {
  if (!canCreateChannel(role)) {
    throw new Error("Non autorisé. Seuls le coordinateur et l'administrateur peuvent créer un canal.");
  }
}

// Autorisation réelle d'accéder à une conversation (lecture comme écriture) — pas seulement une
// liste filtrée côté client : un DM exige d'être participant, un CANAL exige d'appartenir à
// l'établissement du canal (cf. isOrgInScope). Avant ce contrôle, sendMessage acceptait n'importe
// quelle conversationId venant d'un utilisateur authentifié, y compris une conversation d'un autre
// établissement. Partagée par sendMessage et fetchRecentMessages (le sondage de nouveaux messages).
async function assertConversationAccess(currentUser: any, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, organizationId: true, participants: { select: { userId: true } } },
  });
  if (!conversation) throw new Error("Conversation introuvable.");

  if (conversation.type === "CHANNEL") {
    if (!isOrgInScope(currentUser, conversation.organizationId)) {
      throw new Error("Non autorisé. Ce canal n'appartient pas à votre établissement.");
    }
  } else if (!conversation.participants.some((p: { userId: string }) => p.userId === currentUser.id)) {
    throw new Error("Non autorisé. Vous ne faites pas partie de cette conversation.");
  }
  return conversation;
}

export async function sendMessage(data: {
  conversationId: string;
  content: string;
  sharedPatientId?: string;
}) {
  try {
    sendMessageSchema.parse(data);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    await assertConversationAccess(currentUser, data.conversationId);

    // Un patient partagé doit rester dans la portée de l'établissement de l'expéditeur — mêmes
    // règles que verifyPatientAccess (holding = soi + cliniques filles, clinique = soi-même).
    if (data.sharedPatientId) {
      if (!canSharePatient(currentUser.role)) {
        throw new Error("Non autorisé à partager un dossier patient.");
      }
      const scope = orgScopeWhere(currentUser);
      const patient = scope ? await prisma.patient.findFirst({ where: { id: data.sharedPatientId, ...scope } }) : null;
      if (!patient) throw new Error("Ce patient n'appartient pas à votre établissement.");
    }

    const message = await prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: currentUser.id,
        content: data.content,
        sharedPatientId: data.sharedPatientId || null,
      },
    });

    revalidatePath("/dashboard/messages");
    revalidatePath("/dashboard/clinics/[id]/messages", "page");
    return { success: true, data: message };
  } catch (error: any) {
    console.error("Error sending message:", error);
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'envoi du message") };
  }
}

export async function createConversation(targetUserId: string) {
  try {
    createConversationSchema.parse({ targetUserId });
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new Error("Non authentifié.");
    }

    // Le destinataire doit être dans la même portée d'établissement que l'expéditeur — la liste
    // affichée (otherUsers, cf. messages/page.tsx) est déjà filtrée ainsi, ce contrôle protège
    // contre un appel direct de l'action avec un id hors de cette liste.
    const scope = orgScopeWhere(currentUser);
    const target = scope ? await prisma.user.findFirst({ where: { id: targetUserId, ...scope } }) : null;
    if (!target) throw new Error("Ce destinataire n'appartient pas à votre établissement.");

    // Check if conversation already exists between these two users (for 1-to-1)
    const existing = await prisma.conversation.findFirst({
      where: {
        type: "DM",
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
        type: "DM",
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
    return { success: false, error: toErrorMessage(error, "Erreur de création de la conversation") };
  }
}

// Canal de discussion par service (#urgences, #garde-nuit...), ouvert à tout le personnel actif
// de l'établissement — cf. messages-data.ts pour les 3 canaux créés automatiquement par défaut.
export async function createChannel(data: { name: string; organizationId?: string }) {
  try {
    createChannelSchema.parse(data);
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");
    assertChannelCreateRole(currentUser.role);

    const targetOrgId = data.organizationId || currentUser.organizationId;
    if (!targetOrgId) throw new Error("Impossible de déterminer l'établissement cible.");
    if (!isOrgInScope(currentUser, targetOrgId)) {
      throw new Error("Non autorisé. Cet établissement n'est pas le vôtre.");
    }

    const name = data.name.trim();
    const existing = await prisma.conversation.findFirst({
      where: { organizationId: targetOrgId, type: "CHANNEL", title: { equals: name, mode: "insensitive" } },
    });
    if (existing) throw new Error(`Le canal « ${name} » existe déjà.`);

    const channel = await prisma.conversation.create({
      data: { title: name, type: "CHANNEL", organizationId: targetOrgId, createdById: currentUser.id },
    });

    revalidatePath("/dashboard/messages");
    revalidatePath("/dashboard/clinics/[id]/messages", "page");
    return { success: true, data: channel };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création du canal.") };
  }
}

// Recherche de patients pour le bouton "Partager un dossier" du composeur — volontairement une
// action à part (pas le gros listPatients des pages Patients) : seulement les champs nécessaires
// à l'aperçu de la carte partagée, et interrogée à la frappe plutôt que de charger tout le
// répertoire de l'établissement sur la page messagerie "au cas où".
export async function searchPatientsForShare(query: string, organizationId?: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");
    if (!canSharePatient(currentUser.role)) {
      return { success: true, data: [] }; // pas d'erreur bruyante : le bouton est de toute façon masqué pour ce rôle
    }

    const scope = orgScopeWhere(currentUser);
    if (!scope) return { success: true, data: [] };
    const targetOrgId = organizationId;

    const q = query.trim();
    const patients = await prisma.patient.findMany({
      where: {
        ...scope,
        ...(targetOrgId ? { organizationId: targetOrgId } : {}),
        ...(q
          ? {
              user: {
                OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }],
              },
            }
          : {}),
      },
      select: { id: true, dateOfBirth: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { user: { lastName: "asc" } },
      take: 8,
    });

    return { success: true, data: patients };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la recherche de patients.") };
  }
}

// Battement de présence — appelé périodiquement par <PresenceHeartbeat /> (montée dans le layout
// dashboard) tant qu'un onglet reste ouvert. Volontairement une écriture minimale (un seul champ),
// jamais combinée à getCurrentUser() lui-même (cf. commentaire sur User.lastActiveAt, schema.prisma).
export async function heartbeat() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Non authentifié." };
    await prisma.user.update({ where: { id: currentUser.id }, data: { lastActiveAt: new Date() } });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur de présence.") };
  }
}

// Rafraîchit uniquement lastActiveAt des utilisateurs visibles (liste de discussions + en-tête de
// conversation) — appelée en sondage léger par ChatPanel pour que les puces de présence avancent
// sans recharger toute la page. Jamais hors de la portée établissement de l'appelant.
export async function getPresenceSnapshot(userIds: string[]) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");
    if (userIds.length === 0) return { success: true, data: {} };

    const scope = orgScopeWhere(currentUser);
    if (!scope) return { success: true, data: {} };

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, ...scope },
      select: { id: true, lastActiveAt: true },
    });

    const snapshot: Record<string, string | null> = {};
    for (const u of users) snapshot[u.id] = u.lastActiveAt ? u.lastActiveAt.toISOString() : null;
    return { success: true, data: snapshot };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de la présence.") };
  }
}

// Sondage léger des messages reçus depuis la dernière synchro — il n'y a pas d'infrastructure
// temps réel (WebSocket) dans cette appli, encore moins envisageable sur des fonctions Vercel sans
// état persistant : ChatPanel rappelle cette action toutes les ~8s tant qu'une conversation est
// ouverte et n'ajoute que les messages strictement postérieurs à `afterCreatedAt`, ce qui reste
// une requête indexée bon marché (cf. @@index([conversationId, createdAt]) sur Message) plutôt
// qu'un rechargement complet de la conversation à chaque sondage.
export async function fetchRecentMessages(conversationId: string, afterCreatedAt?: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    await assertConversationAccess(currentUser, conversationId);

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(afterCreatedAt ? { createdAt: { gt: new Date(afterCreatedAt) } } : {}),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "asc" },
      take: MAX_PAGE_SIZE,
    });

    return { success: true as const, data: messages };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des messages.") };
  }
}

// Messages plus anciens qu'un repère, par tranches de 20 (bouton « Charger les messages précédents »).
// `hasMore` indique qu'il reste des messages plus anciens à charger.
export async function fetchOlderMessages(conversationId: string, beforeCreatedAt: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    await assertConversationAccess(currentUser, conversationId);

    const rows = await prisma.message.findMany({
      where: { conversationId, createdAt: { lt: new Date(beforeCreatedAt) } },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: MAX_PAGE_SIZE + 1,
    });

    const hasMore = rows.length > MAX_PAGE_SIZE;
    const page = rows.slice(0, MAX_PAGE_SIZE).reverse();
    return { success: true as const, data: page, hasMore };
  } catch (error: any) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des messages précédents.") };
  }
}
