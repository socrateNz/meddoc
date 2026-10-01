// Logique de données partagée par les deux pages de messagerie (/dashboard/messages et
// /dashboard/clinics/[id]/messages, même principe que patient-detail-data.ts pour le dossier
// patient — cf. ce fichier pour l'explication complète du pourquoi) et par les actions serveur
// (src/actions/messages.ts) qui ont besoin des mêmes règles de portée organisation/présence.
//
// Module volontairement SANS directive "use server"/"use client" : fonctions pures ou lectures
// serveur, importées par des Server Components et par des actions serveur, jamais appelées
// depuis le navigateur directement.

import { prisma } from "@/lib/db";

export const DEFAULT_CHANNEL_NAMES = ["urgences", "garde-nuit", "staff-médical"] as const;

// Rôles pouvant créer un canal SUPPLÉMENTAIRE (les 3 par défaut existent déjà pour tout
// établissement, cf. ensureDefaultChannels) — volontairement restreint à l'encadrement plutôt
// qu'ouvert à tous, pour éviter une prolifération de canaux. N'importe qui peut en revanche
// ÉCRIRE dans n'importe quel canal de son établissement une fois qu'il existe (cf. sendMessage,
// src/actions/messages.ts).
export const CHANNEL_CREATE_ROLES = ["COORDINATOR", "ADMIN"];
export const canCreateChannel = (role: string) => CHANNEL_CREATE_ROLES.includes(role);

// Rôles autorisés à partager un dossier patient dans un message — les mêmes qui ont accès au
// dossier clinique lui-même (cf. verifyPatientAccess, src/lib/auth.ts ; PHARMACIST est bloqué sur
// un autre critère par la page /dashboard/patients/[id], CASHIER n'a aucune activité clinique).
// SUPER_ADMIN est explicitement exclu comme verifyPatientAccess l'exclut toujours.
export const PATIENT_SHARE_ROLES = ["COORDINATOR", "MEDECIN", "CAREGIVER", "ADMIN"];
export const canSharePatient = (role: string) => PATIENT_SHARE_ROLES.includes(role);

// Battement envoyé par PresenceHeartbeat toutes les ~45s (cf. presence-heartbeat.tsx) : la marge
// sous le seuil "en ligne" (2 min) tolère un battement manqué sans faire clignoter le statut.
export const PRESENCE_ONLINE_MS = 2 * 60 * 1000;
export const PRESENCE_RECENT_MS = 15 * 60 * 1000;

export type PresenceStatus = "online" | "recent" | "offline";

export function presenceStatus(lastActiveAt: Date | string | null | undefined, now: Date = new Date()): PresenceStatus {
  if (!lastActiveAt) return "offline";
  const diffMs = now.getTime() - new Date(lastActiveAt).getTime();
  if (diffMs < 0) return "online"; // horloge client légèrement en avance : jamais pire qu'"en ligne"
  if (diffMs <= PRESENCE_ONLINE_MS) return "online";
  if (diffMs <= PRESENCE_RECENT_MS) return "recent";
  return "offline";
}

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: "En ligne",
  recent: "Vu récemment",
  offline: "Hors ligne",
};

export const PRESENCE_DOT_CLASS: Record<PresenceStatus, string> = {
  online: "bg-emerald-500",
  recent: "bg-amber-400",
  offline: "bg-slate-300 dark:bg-slate-600",
};

interface OrgScopedUser {
  organizationId?: string | null;
  organization?: { type?: string | null } | null;
}

// Même règle que verifyPatientAccess/getOrgScopeWhere : une holding voit sa propre organisation ET
// toutes ses cliniques filles, une clinique ne voit qu'elle-même. Utilisée ici pour déterminer
// quels canaux (organizationId d'un Conversation CHANNEL) un utilisateur peut lire/écrire.
export function isOrgInScope(currentUser: OrgScopedUser, targetOrganizationId: string | null | undefined): boolean {
  if (!targetOrganizationId || !currentUser.organizationId) return false;
  if (currentUser.organization?.type === "HOLDING") return true; // résolu via la requête Prisma (OR), jamais ici seul
  return currentUser.organizationId === targetOrganizationId;
}

export function orgScopeWhere(currentUser: OrgScopedUser): { organizationId: string } | { OR: Array<Record<string, unknown>> } | null {
  if (!currentUser.organizationId) return null;
  if (currentUser.organization?.type === "HOLDING") {
    return { OR: [{ organizationId: currentUser.organizationId }, { organization: { parentId: currentUser.organizationId } }] };
  }
  return { organizationId: currentUser.organizationId };
}

const USER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  avatarUrl: true,
  lastActiveAt: true,
} as const;

// Inclusion complète d'un message, partagée par la lecture initiale (page.tsx) et le sondage de
// nouveaux messages (fetchRecentMessages, src/actions/messages.ts) — pour que les deux rendent
// exactement la même forme de données (pièce jointe, patient partagé compris).
export const MESSAGE_INCLUDE = {
  sender: { select: USER_SUMMARY_SELECT },
  sharedPatient: {
    select: {
      id: true,
      dateOfBirth: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

export interface FetchMessagingPageDataOptions {
  currentUser: { id: string; role: string; organizationId?: string | null; organization?: { type?: string | null } | null };
  // Établissement dont les CANAUX sont affichés : celui de l'utilisateur pour /dashboard/messages,
  // ou la clinique choisie pour /dashboard/clinics/[id]/messages. Les canaux sont toujours propres
  // à un seul établissement (jamais fusionnés) — null si l'utilisateur n'a pas d'établissement.
  channelsOrganizationId: string | null;
  // Portée des destinataires de DM potentiels : volontairement SÉPARÉE de channelsOrganizationId.
  // Sur /dashboard/messages, une holding voit tout son personnel (toutes cliniques filles
  // confondues, cf. orgScopeWhere) même si elle ne voit les CANAUX d'aucune clinique précise en
  // particulier ; sur la route clinique, un admin holding ne voit que le personnel de CETTE
  // clinique (cf. page.tsx respectifs). null = aucun destinataire (pas d'établissement du tout).
  otherUsersWhere: Record<string, unknown> | null;
  activeConversationId: string | null;
}

// Lecture complète de la page messagerie : canaux de l'établissement ciblé, discussions privées
// de l'utilisateur, messages de la conversation active (si elle lui est bien accessible — sinon
// traitée comme si aucune conversation n'était sélectionnée, jamais une erreur qui romprait la
// page), et les collègues potentiels pour démarrer un DM (+ leur présence).
export async function fetchMessagingPageData({
  currentUser,
  channelsOrganizationId,
  otherUsersWhere,
  activeConversationId,
}: FetchMessagingPageDataOptions) {
  if (channelsOrganizationId) {
    await ensureDefaultChannels(channelsOrganizationId, currentUser.id);
  }

  const [channels, directMessages, otherUsers] = await Promise.all([
    channelsOrganizationId
      ? prisma.conversation.findMany({
          where: { organizationId: channelsOrganizationId, type: "CHANNEL" },
          include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
          orderBy: { title: "asc" },
        })
      : Promise.resolve([]),
    prisma.conversation.findMany({
      where: { type: "DM", participants: { some: { userId: currentUser.id } } },
      include: {
        participants: { include: { user: { select: USER_SUMMARY_SELECT } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      // Garde-fou : évite de ramener une collection entière si le nombre de discussions grossit
      // fortement — pas une vraie pagination, juste une limite haute sur les plus récentes.
      take: 500,
    }),
    otherUsersWhere
      ? prisma.user.findMany({
          where: { id: { not: currentUser.id }, isActive: true, ...otherUsersWhere },
          select: USER_SUMMARY_SELECT,
          orderBy: { lastName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  let activeConversation: { id: string; type: string; title: string | null } | null = null;
  let messages: Array<Record<string, unknown>> = [];
  if (activeConversationId) {
    const isKnownChannel = channels.some((c) => c.id === activeConversationId);
    const isKnownDm = directMessages.some((c) => c.id === activeConversationId);
    if (isKnownChannel || isKnownDm) {
      activeConversation =
        (channels.find((c) => c.id === activeConversationId) as any) ||
        (directMessages.find((c) => c.id === activeConversationId) as any);
      const rawMessages = await prisma.message.findMany({
        where: { conversationId: activeConversationId },
        include: MESSAGE_INCLUDE,
        orderBy: { createdAt: "desc" },
        // Garde-fou : les 200 plus récents, remis en ordre chronologique pour l'affichage.
        take: 200,
      });
      messages = rawMessages.reverse();
    }
    // Conversation inconnue/pas accessible : traitée comme "aucune sélectionnée" plutôt qu'une
    // erreur qui casserait toute la page — par exemple un lien partagé vers un canal d'un autre
    // établissement, ou une conversation supprimée depuis.
  }

  return { channels, directMessages, otherUsers, activeConversation, messages };
}

// Crée les canaux par défaut d'un établissement s'ils n'existent pas encore (appelée au chargement
// de la page messagerie — idempotente : ne recrée jamais un canal du même nom). Permet à une
// clinique nouvellement créée d'avoir #urgences/#garde-nuit/#staff-médical sans action manuelle,
// tout en laissant la possibilité d'en créer d'autres ensuite (cf. createChannel).
export async function ensureDefaultChannels(organizationId: string, createdById: string): Promise<void> {
  const existing = await prisma.conversation.findMany({
    where: { organizationId, type: "CHANNEL" },
    select: { title: true },
  });
  const existingNames = new Set(existing.map((c) => c.title));
  const missing = DEFAULT_CHANNEL_NAMES.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return;

  await prisma.conversation.createMany({
    data: missing.map((name) => ({ title: name, type: "CHANNEL", organizationId, createdById })),
  });
}
