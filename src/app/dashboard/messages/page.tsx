import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatPanel from "./chat-panel";
import { fetchMessagingPageData, orgScopeWhere } from "./messages-data";

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

  // Sur cette page (pas de clinique précisée dans l'URL), les canaux affichés sont ceux du PROPRE
  // établissement de l'utilisateur — mais les destinataires de DM potentiels restent plus larges
  // pour une holding (toutes ses cliniques filles, cf. orgScopeWhere) : on peut démarrer une
  // discussion privée avec n'importe qui de son groupe sans devoir d'abord naviguer vers la bonne
  // clinique, même si on ne voit alors les canaux d'aucune clinique en particulier.
  const { channels, directMessages, otherUsers, activeConversation, messages } = await fetchMessagingPageData({
    currentUser,
    channelsOrganizationId: currentUser.organizationId || null,
    otherUsersWhere: orgScopeWhere(currentUser),
    activeConversationId,
  });

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messagerie d&apos;Équipe</h1>
        <p className="text-muted-foreground">
          Canaux par service et discussions privées avec les coordinateurs et soignants de l&apos;établissement.
        </p>
      </div>

      <ChatPanel
        channels={channels as any}
        directMessages={directMessages as any}
        activeConversationId={activeConversationId}
        activeConversation={activeConversation as any}
        initialMessages={messages as any}
        currentUser={currentUser as any}
        otherUsers={otherUsers as any}
        basePath="/dashboard/messages"
        channelsOrganizationId={currentUser.organizationId || null}
      />
    </div>
  );
}
