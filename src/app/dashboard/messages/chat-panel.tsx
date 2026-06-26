"use client";

import { useState, useEffect, useRef } from "react";
import { sendMessage, createConversation } from "@/actions/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Send, MessageSquare, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

interface Message {
  id: string;
  content: string;
  createdAt: string | Date;
  senderId: string;
  sender: User;
}

interface Conversation {
  id: string;
  participants: {
    user: User;
  }[];
  messages: {
    content: string;
    createdAt: string | Date;
  }[];
}

interface ChatPanelProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  initialMessages: Message[];
  currentUser: User;
  otherUsers: User[];
}

export default function ChatPanel({
  conversations,
  activeConversationId,
  initialMessages,
  currentUser,
  otherUsers,
}: ChatPanelProps) {
  const router = useRouter();
  const [openNewChat, setOpenNewChat] = useState(false);
  const [newChatUser, setNewChatUser] = useState("");
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever active conversation or messages list changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversationId, initialMessages]);

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
        router.push(`/dashboard/messages?id=${res.data.id}`);
      } else {
        toast.error(res.error || "Erreur de création de la conversation.");
      }
    } catch (err: any) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setNewChatLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeConversationId) return;

    const content = messageInput.trim();
    setMessageInput("");
    setSending(true);

    try {
      const res = await sendMessage({
        conversationId: activeConversationId,
        content,
      });

      if (res.success) {
        // Next.js Server Action will revalidate, updating the initialMessages prop
      } else {
        toast.error(res.error || "Impossible d'envoyer le message.");
        setMessageInput(content); // restore input
      }
    } catch (err: any) {
      toast.error("Erreur de connexion.");
      setMessageInput(content);
    } finally {
      setSending(false);
    }
  };

  const getRecipient = (conv: Conversation) => {
    const p = conv.participants.find((part) => part.user.id !== currentUser.id);
    return p ? p.user : { firstName: "Autre", lastName: "Utilisateur", role: "USER", email: "", avatarUrl: null };
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const recipient = activeConversation ? getRecipient(activeConversation) : null;

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
                  Sélectionnez un membre de l'équipe pour démarrer une conversation.
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

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p>Aucune discussion.</p>
              <p className="text-xs mt-1">Cliquez sur le bouton + pour démarrer.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const other = getRecipient(conv);
              const isSelected = conv.id === activeConversationId;
              const lastMsg = conv.messages[0];

              return (
                <Link
                  key={conv.id}
                  href={`/dashboard/messages?id=${conv.id}`}
                  className={`flex items-start gap-3 p-4 text-left transition-all hover:bg-muted/40 ${isSelected ? "bg-primary/5 hover:bg-primary/5 border-l-2 border-primary" : ""
                    }`}
                >
                  <Avatar className="h-10 w-10 border">
                    <AvatarImage src={other.avatarUrl || ""} />
                    <AvatarFallback className="bg-primary/5 text-primary text-xs font-semibold">
                      {other.lastName[0]}
                      {other.firstName[0]}
                    </AvatarFallback>
                  </Avatar>
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
            })
          )}
        </div>
      </div>

      {/* Main chat window */}
      <div className="flex-1 flex flex-col bg-card">
        {activeConversation && recipient ? (
          <>
            {/* Chat header */}
            <div className="p-4 border-b flex items-center gap-3 bg-muted/5">
              <Avatar className="h-10 w-10 border border-primary/10">
                <AvatarImage src={recipient.avatarUrl || ""} />
                <AvatarFallback className="bg-primary/5 text-primary text-xs font-semibold">
                  {recipient.lastName[0]}
                  {recipient.firstName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm leading-none">{recipient.lastName} {recipient.firstName}</p>
                <p className="text-xs text-muted-foreground mt-1 capitalize">{recipient.role.toLowerCase()} • {recipient.email}</p>
              </div>
            </div>

            {/* Chat Messages list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/5">
              {initialMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
                  <Info className="h-6 w-6 text-muted-foreground/50 mb-2" />
                  <p>Envoyez un message pour commencer la discussion.</p>
                </div>
              ) : (
                initialMessages.map((msg) => {
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
                        <div>
                          <div className={`rounded-2xl px-4 py-2.5 text-sm ${isMe
                            ? "bg-primary text-primary-foreground rounded-tr-none shadow-sm"
                            : "bg-muted text-foreground rounded-tl-none border"
                            }`}>
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          <span className={`text-[10px] text-muted-foreground mt-1 block ${isMe ? "text-right" : "text-left"}`}>
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
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input box */}
            <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2 items-center bg-card">
              <Input
                placeholder="Rédiger votre message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                disabled={sending}
                className="flex-1"
                required
              />
              <Button type="submit" size="icon" disabled={sending || !messageInput.trim()} className="shrink-0 h-9 w-9">
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
              Sélectionnez une discussion à gauche, ou ouvrez-en une nouvelle avec un membre de l'équipe de soins.
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
