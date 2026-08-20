import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatPanel from "@/app/dashboard/messages/chat-panel";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    id?: string;
  }>;
}

export default async function ClinicMessagesPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const clinicId = resolvedParams.id;
  const activeConversationId = resolvedSearchParams.id || null;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  // Retrieve user's conversations
  const conversations = await prisma.conversation.findMany({
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
  });

  // Retrieve initial messages if conversation is selected — les 200 plus récents, remis
  // en ordre chronologique pour l'affichage (même garde-fou que ci-dessus).
  const initialMessages = activeConversationId
    ? (await prisma.message.findMany({
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
      })).reverse()
    : [];

  // Fetch potential chat recipients (excluding self) only in the current clinic
  const otherUsers = await prisma.user.findMany({
    where: {
      id: { not: currentUser.id },
      isActive: true,
      organizationId: clinicId, // Filter by clinic
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
  });

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messagerie d'Équipe</h1>
        <p className="text-muted-foreground">
          Communiquez en temps réel avec les coordinateurs et les soignants de cette clinique.
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
