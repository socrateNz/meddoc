import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatPanel from "@/app/dashboard/messages/chat-panel";
import { fetchMessagingPageData } from "@/app/dashboard/messages/messages-data";

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

  // Ici, canaux ET destinataires de DM sont strictement bornés à CETTE clinique (clinicId) — un
  // admin holding qui navigue vers une clinique précise doit y voir exactement ce que son
  // personnel y voit, pas le reste du groupe (cf. /dashboard/messages pour la vue cross-clinique).
  const { channels, directMessages, otherUsers, activeConversation, messages } = await fetchMessagingPageData({
    currentUser,
    channelsOrganizationId: clinicId,
    otherUsersWhere: { organizationId: clinicId },
    activeConversationId,
  });

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messagerie d&apos;Équipe</h1>
        <p className="text-muted-foreground">
          Canaux par service et discussions privées avec les coordinateurs et soignants de cette clinique.
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
        basePath={`/dashboard/clinics/${clinicId}/messages`}
        channelsOrganizationId={clinicId}
      />
    </div>
  );
}
