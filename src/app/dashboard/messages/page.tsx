import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatPanel from "./chat-panel";

interface PageProps {
  searchParams: Promise<{
    id?: string;
  }>;
}

export default async function MessagesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const activeConversationId = params.id || null;

  // Fetch potential chat recipients (excluding self) — bornés à l'organisation de
  // l'utilisateur (et aux cliniques filles pour une holding), comme le fait déjà la variante
  // /dashboard/clinics/[id]/messages. Auparavant, cette liste incluait TOUS les utilisateurs
  // actifs de la plateforme, toutes cliniques et holdings confondues.
  const orgFilter =
    currentUser.organization?.type === "HOLDING"
      ? { OR: [{ organizationId: currentUser.organizationId }, { organization: { parentId: currentUser.organizationId } }] }
      : { organizationId: currentUser.organizationId };

  // Les 3 requêtes ci-dessous sont indépendantes (aucune ne dépend du résultat d'une autre),
  // on les lance en parallèle.
  const [conversations, rawInitialMessages, otherUsers] = await Promise.all([
    // Retrieve user's conversations
    prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId: currentUser.id }
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                avatarUrl: true,
              }
            }
          }
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      // Garde-fou : évite de ramener une collection entière si le nombre de conversations
      // grossit fortement — pas une vraie pagination, juste une limite haute sur les plus récentes.
      take: 500,
    }),
    // Retrieve initial messages if conversation is selected — les 200 plus récents, remis
    // en ordre chronologique pour l'affichage (même garde-fou que ci-dessus).
    activeConversationId
      ? prisma.message.findMany({
          where: { conversationId: activeConversationId },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                avatarUrl: true,
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 200,
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: {
        id: { not: currentUser.id },
        isActive: true,
        ...orgFilter,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        avatarUrl: true,
      },
      orderBy: {
        lastName: "asc"
      }
    }),
  ]);
  const initialMessages = rawInitialMessages.reverse();

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messagerie d'Équipe</h1>
        <p className="text-muted-foreground">
          Communiquez en temps réel avec les coordinateurs et les soignants de l'établissement.
        </p>
      </div>

      <ChatPanel
        conversations={conversations as any}
        activeConversationId={activeConversationId}
        initialMessages={initialMessages as any}
        currentUser={currentUser as any}
        otherUsers={otherUsers as any}
      />
    </div>
  );
}
