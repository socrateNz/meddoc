"use client";

import { useEffect, useRef, useState } from "react";
import { sendMessage, createConversation, fetchRecentMessages, getPresenceSnapshot } from "@/actions/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Send, MessageSquare, Loader2, Info, Hash, X, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canCreateChannel, canSharePatient, PRESENCE_DOT_CLASS, PRESENCE_LABEL, presenceStatus } from "./messages-data";
import NewChannelDialog from "./new-channel-dialog";
import AttachPatientDialog, { type SharePatientOption } from "./attach-patient-dialog";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  lastActiveAt?: string | Date | null;
}

interface SharedPatient {
  id: string;
  dateOfBirth: string | Date;
  user: { firstName: string; lastName: string };
}

interface Message {
  id: string;
  content: string;
  createdAt: string | Date;
  senderId: string;
  sender: User;
  sharedPatient?: SharedPatient | null;
}

interface LastMessagePreview {
  content: string;
  createdAt: string | Date;
}

interface ChannelConversation {
  id: string;
  type: "CHANNEL";
  title: string | null;
  messages: LastMessagePreview[];
}

interface DmConversation {
  id: string;
  type: "DM";
  participants: { user: User }[];
  messages: LastMessagePreview[];
}

interface ChatPanelProps {
  channels: ChannelConversation[];
  directMessages: DmConversation[];
  activeConversationId: string | null;
  activeConversation: (ChannelConversation | DmConversation) | null;
  initialMessages: Message[];
  currentUser: User;
  otherUsers: User[];
  basePath: string;
  // Établissement courant (pour créer un canal / chercher un patient à partager dans sa portée) —
  // null si l'utilisateur n'a pas d'établissement (ne devrait concerner aucun des rôles qui voient
  // cette page, gardé par défense).
  channelsOrganizationId: string | null;
}

const POLL_MESSAGES_MS = 8_000;
const POLL_PRESENCE_MS = 20_000;

function calculateAge(dateOfBirth: string | Date) {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function ChatPanel({
  channels,
  directMessages,
  activeConversationId,
  activeConversation,
  initialMessages,
  currentUser,
  otherUsers,
  basePath,
  channelsOrganizationId,
}: ChatPanelProps) {
  const router = useRouter();
  const [openNewChat, setOpenNewChat] = useState(false);
  const [newChatUser, setNewChatUser] = useState("");
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [pendingPatient, setPendingPatient] = useState<SharePatientOption | null>(null);
  // Avancé au fil des battements de présence reçus (cf. PresenceHeartbeat, mémorisé au niveau du
  // dashboard) — initialisé depuis les lastActiveAt déjà chargés par la page, puis rafraîchi par
  // sondage (getPresenceSnapshot) sans recharger toute la page.
  const [presenceMap, setPresenceMap] = useState<Record<string, string | null>>({});
  const [now, setNow] = useState(() => new Date());

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Réinitialise l'état propre à une conversation (saisie, patient partagé en attente...) dès
  // qu'on change de discussion — sinon un brouillon resterait collé d'une conversation à l'autre.
  // Ajusté PENDANT le rendu plutôt que dans un effet (schéma recommandé par React pour "resynchroniser
  // un état quand une prop comme un id change", cf. period-filter.tsx pour le même principe) : un
  // effet qui ne fait qu'appeler setState déclenche un rendu supplémentaire inutile.
  const [syncedConversationId, setSyncedConversationId] = useState(activeConversationId);
  if (syncedConversationId !== activeConversationId) {
    setSyncedConversationId(activeConversationId);
    setMessages(initialMessages);
    setMessageInput("");
    setPendingPatient(null);
  }

  // Scroll to bottom whenever active conversation or messages list changes.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeConversationId, messages]);

  // Sondage léger de nouveaux messages — pas de WebSocket dans cette appli (cf.
  // fetchRecentMessages, src/actions/messages.ts) : c'est ce qui fait qu'un message envoyé par un
  // collègue apparaît sans que je doive recharger la page. Repart du dernier message connu à
  // chaque poll, jamais depuis le début de la conversation.
  useEffect(() => {
    if (!activeConversationId) return;
    let cancelled = false;

    const poll = async () => {
      const lastCreatedAt = messages.length > 0 ? new Date(messages[messages.length - 1].createdAt).toISOString() : undefined;
      const res = await fetchRecentMessages(activeConversationId, lastCreatedAt);
      if (cancelled || !res.success || !res.data) return;
      const fresh = res.data as unknown as Message[];
      if (fresh.length === 0) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const toAdd = fresh.filter((m) => !known.has(m.id));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    };

    const interval = setInterval(poll, POLL_MESSAGES_MS);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
    // messages volontairement hors des dépendances : le poll lit sa valeur la plus fraîche via le
    // setState fonctionnel ci-dessus, pas besoin de relancer l'intervalle à chaque message reçu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // Sondage léger de présence — avance les puces "en ligne" de la liste sans tout recharger.
  useEffect(() => {
    const ids = Array.from(new Set(otherUsers.map((u) => u.id)));
    if (ids.length === 0) return;
    let cancelled = false;

    const poll = async () => {
      const res = await getPresenceSnapshot(ids);
      if (cancelled || !res.success || !res.data) return;
      setPresenceMap(res.data as Record<string, string | null>);
      setNow(new Date());
    };

    poll();
    const interval = setInterval(poll, POLL_PRESENCE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUsers.map((u) => u.id).join(",")]);

  const statusOf = (user: User) => presenceStatus(presenceMap[user.id] ?? user.lastActiveAt ?? null, now);

  const handleStartConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatUser) {
      toast.error("Veuillez sélectionner un destinataire.");
      return;
    }

    setNewChatLoading(true);
    try {
      const res = await createConversation(newChatUser);
      if (res.success && res.data) {
        toast.success("Conversation démarrée !");
        setOpenNewChat(false);
        setNewChatUser("");
        router.push(`${basePath}?id=${res.data.id}`);
      } else {
        toast.error(res.error || "Erreur de création de la conversation.");
      }
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setNewChatLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversationId) return;
    if (!messageInput.trim() && !pendingPatient) return;

    const content = messageInput.trim();
    const patient = pendingPatient;
    setMessageInput("");
    setPendingPatient(null);
    setSending(true);

    try {
      const res = await sendMessage({
        conversationId: activeConversationId,
        content,
        sharedPatientId: patient?.id,
      });

      if (res.success && res.data) {
        setMessages((prev) =>
          prev.some((m) => m.id === (res.data as any).id)
            ? prev
            : [...prev, { ...(res.data as any), sender: currentUser, sharedPatient: patient ? { ...patient, user: { firstName: patient.firstName, lastName: patient.lastName } } : null }]
        );
      } else {
        toast.error(res.error || "Impossible d'envoyer le message.");
        setMessageInput(content);
        setPendingPatient(patient);
      }
    } catch {
      toast.error("Erreur de connexion.");
      setMessageInput(content);
      setPendingPatient(patient);
    } finally {
      setSending(false);
    }
  };

  const getRecipient = (conv: DmConversation): User => {
    const p = conv.participants.find((part) => part.user.id !== currentUser.id);
    return p ? p.user : { id: "", firstName: "Autre", lastName: "Utilisateur", role: "USER", email: "", avatarUrl: null };
  };

  const isChannel = activeConversation?.type === "CHANNEL";
  const recipient = activeConversation && !isChannel ? getRecipient(activeConversation as DmConversation) : null;
  const recipientStatus = recipient ? statusOf(recipient) : null;

  const canShare = canSharePatient(currentUser.role);
  const hasConversations = channels.length > 0 || directMessages.length > 0;

  return (
    <div className="flex-1 flex min-h-0 border rounded-2xl bg-card shadow-sm overflow-hidden">
      {/* Sidebar List of conversations */}
      <div className="w-80 border-r flex flex-col bg-muted/20">
        <div className="p-4 border-b flex items-center justify-between bg-card">
          <h2 className="font-semibold text-lg">Discussions</h2>
          <Dialog open={openNewChat} onOpenChange={setOpenNewChat}>
            <DialogTrigger render={<Button size="icon" variant="outline" className="flex flex-row gap-2 h-8 w-8 rounded-lg" />}>
              <Plus className="h-4 w-4" />
            </DialogTrigger>
            <DialogContent className="bg-card border shadow-2xl rounded-2xl sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Nouvelle Discussion</DialogTitle>
                <DialogDescription>
                  Sélectionnez un membre de l&apos;équipe pour démarrer une conversation.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleStartConversation} className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label>Destinataire *</Label>
                  <Select onValueChange={(val) => val && setNewChatUser(val)} value={newChatUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un destinataire">
                        {(val: any) => {
                          if (!val) return "Choisir un destinataire";
                          const u = otherUsers.find(user => user.id === val);
                          return u ? `${u.lastName} ${u.firstName} (${u.role.toLowerCase()})` : val;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {otherUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.lastName} {u.firstName} ({u.role.toLowerCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-3 pt-3 border-t">
                  <Button type="button" variant="outline" className="flex flex-row gap-2" onClick={() => setOpenNewChat(false)} disabled={newChatLoading}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={newChatLoading}>
                    {newChatLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Ouverture...
                      </>
                    ) : (
                      "Démarrer"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!hasConversations ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p>Aucune discussion.</p>
              <p className="text-xs mt-1">Cliquez sur le bouton + pour démarrer.</p>
            </div>
          ) : (
            <>
              {/* Canaux par service */}
              <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Canaux</span>
                {canCreateChannel(currentUser.role) && <NewChannelDialog organizationId={channelsOrganizationId} basePath={basePath} />}
              </div>
              {channels.length === 0 ? (
                <p className="px-4 pb-2 text-xs text-muted-foreground">Aucun canal pour cet établissement.</p>
              ) : (
                <div className="divide-y divide-border/50 mb-2">
                  {channels.map((conv) => {
                    const isSelected = conv.id === activeConversationId;
                    const lastMsg = conv.messages[0];
                    return (
                      <Link
                        key={conv.id}
                        href={`${basePath}?id=${conv.id}`}
                        className={`flex items-start gap-3 px-4 py-3 text-left transition-all hover:bg-muted/40 ${isSelected ? "bg-primary/5 hover:bg-primary/5 border-l-2 border-primary" : ""}`}
                      >
                        <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <Hash className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{conv.title}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {lastMsg ? lastMsg.content : "Aucun message"}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Discussions privées */}
              <div className="px-4 pt-2 pb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Messages privés</span>
              </div>
              {directMessages.length === 0 ? (
                <p className="px-4 pb-4 text-xs text-muted-foreground">Aucune discussion privée.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {directMessages.map((conv) => {
                    const other = getRecipient(conv);
                    const isSelected = conv.id === activeConversationId;
                    const lastMsg = conv.messages[0];
                    const status = statusOf(other);

                    return (
                      <Link
                        key={conv.id}
                        href={`${basePath}?id=${conv.id}`}
                        className={`flex items-start gap-3 p-4 text-left transition-all hover:bg-muted/40 ${isSelected ? "bg-primary/5 hover:bg-primary/5 border-l-2 border-primary" : ""}`}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-10 w-10 border">
                            <AvatarImage src={other.avatarUrl || ""} />
                            <AvatarFallback className="bg-primary/5 text-primary text-xs font-semibold">
                              {other.lastName[0]}
                              {other.firstName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            title={PRESENCE_LABEL[status]}
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${PRESENCE_DOT_CLASS[status]}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline">
                            <p className="font-semibold text-sm truncate">{other.lastName} {other.firstName}</p>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded font-medium">
                              {other.role.toLowerCase()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {lastMsg ? lastMsg.content : "Aucun message"}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main chat window */}
      <div className="flex-1 flex flex-col bg-card">
        {activeConversation ? (
          <>
            {/* Chat header */}
            <div className="p-4 border-b flex items-center gap-3 bg-muted/5">
              {isChannel ? (
                <>
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Hash className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm leading-none">{(activeConversation as ChannelConversation).title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{otherUsers.length + 1} membre(s) de l&apos;établissement</p>
                  </div>
                </>
              ) : recipient ? (
                <>
                  <Avatar className="h-10 w-10 border border-primary/10">
                    <AvatarImage src={recipient.avatarUrl || ""} />
                    <AvatarFallback className="bg-primary/5 text-primary text-xs font-semibold">
                      {recipient.lastName[0]}
                      {recipient.firstName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-sm leading-none">{recipient.lastName} {recipient.firstName}</p>
                    <p className="text-xs text-muted-foreground mt-1 capitalize flex items-center gap-1.5">
                      {recipient.role.toLowerCase()} • {recipient.email}
                      {recipientStatus && (
                        <span className="inline-flex items-center gap-1 normal-case">
                          <span className={`h-1.5 w-1.5 rounded-full ${PRESENCE_DOT_CLASS[recipientStatus]}`} />
                          {PRESENCE_LABEL[recipientStatus]}
                        </span>
                      )}
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            {/* Chat Messages list */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/5">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
                  <Info className="h-6 w-6 text-muted-foreground/50 mb-2" />
                  <p>Envoyez un message pour commencer la discussion.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === currentUser.id;

                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`flex gap-2 max-w-[70%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                        <Avatar className="h-8 w-8 border shrink-0">
                          <AvatarImage src={msg.sender.avatarUrl || ""} />
                          <AvatarFallback className="text-[10px]">
                            {msg.sender.lastName[0]}
                            {msg.sender.firstName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1.5">
                          {isChannel && !isMe && (
                            <p className="text-[11px] font-semibold text-muted-foreground px-1">{msg.sender.lastName} {msg.sender.firstName}</p>
                          )}

                          {msg.sharedPatient && (
                            <Link
                              href={`/dashboard/patients/${msg.sharedPatient.id}`}
                              className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-colors ${isMe ? "bg-primary/5 border-primary/20 hover:bg-primary/10" : "bg-card border-border hover:bg-muted/40"}`}
                            >
                              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <UserIcon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">
                                  {msg.sharedPatient.user.lastName} {msg.sharedPatient.user.firstName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {calculateAge(msg.sharedPatient.dateOfBirth)} ans • Voir le dossier
                                </p>
                              </div>
                            </Link>
                          )}

                          {msg.content && (
                            <div className={`rounded-2xl px-4 py-2.5 text-sm ${isMe
                              ? "bg-primary text-primary-foreground rounded-tr-none shadow-sm"
                              : "bg-muted text-foreground rounded-tl-none border"
                              }`}>
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          )}
                          <span className={`text-[10px] text-muted-foreground block ${isMe ? "text-right" : "text-left"}`}>
                            {new Intl.DateTimeFormat('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            }).format(new Date(msg.createdAt))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Patient partagé en attente d'envoi */}
            {pendingPatient && (
              <div className="px-4 pt-3 flex flex-wrap gap-2 bg-card">
                {pendingPatient && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted rounded-full pl-3 pr-1.5 py-1">
                    <UserIcon className="h-3.5 w-3.5" />
                    {pendingPatient.lastName} {pendingPatient.firstName}
                    <button type="button" onClick={() => setPendingPatient(null)} className="hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Chat input box */}
            <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2 items-center bg-card">
              {canShare && <AttachPatientDialog organizationId={channelsOrganizationId} onSelect={setPendingPatient} />}
              <Input
                placeholder="Rédiger votre message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                disabled={sending}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={sending || (!messageInput.trim() && !pendingPatient)} className="shrink-0 h-9 w-9">
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-semibold text-lg">Aucune conversation sélectionnée</h3>
            <p className="text-sm mt-1 text-center max-w-sm">
              Sélectionnez un canal ou une discussion à gauche, ou ouvrez-en une nouvelle avec un membre de l&apos;équipe de soins.
            </p>
            <Button className="flex flex-row gap-2 mt-4" variant="outline" onClick={() => setOpenNewChat(true)}>
              <Plus className="h-4 w-4" />
              Nouvelle discussion
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
