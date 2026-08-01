import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listContactMessages } from "@/actions/contact-messages";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquareText } from "lucide-react";
import MessageRowActions from "./message-row-actions";

export const metadata = {
  title: "Messages de contact | MedDoc",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function statusBadge(status: string) {
  switch (status) {
    case "NEW":
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20" variant="outline">Nouveau</Badge>;
    case "READ":
      return <Badge variant="secondary">Lu</Badge>;
    case "ARCHIVED":
      return <Badge variant="outline" className="text-slate-400">Archivé</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default async function ContactMessagesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const result = await listContactMessages();
  const messages = result.success ? (result.data as any[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messages de contact</h1>
        <p className="text-muted-foreground">
          Messages envoyés depuis le formulaire de contact du site public.
        </p>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center text-muted-foreground">
          <MessageSquareText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aucun message reçu pour le moment.
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-sm">{msg.subject}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{msg.name}</span>
                    <a href={`mailto:${msg.email}`} className="flex items-center gap-1 hover:text-blue-600">
                      <Mail className="h-3 w-3" /> {msg.email}
                    </a>
                    <span>·</span>
                    <span>{formatDate(msg.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(msg.status)}
                  <MessageRowActions messageId={msg.id} currentStatus={msg.status} />
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed border-t pt-3">
                {msg.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
