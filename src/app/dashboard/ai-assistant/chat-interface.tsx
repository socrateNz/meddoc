"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Brain,
  Send,
  Loader2,
  Sparkles,
  User,
  AlertTriangle,
  FileText,
  Activity,
  Clock
} from "lucide-react";

interface Patient {
  id: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface Message {
  role: "user" | "model";
  content: string;
}

export default function ChatInterface({ patients }: { patients: Patient[] }) {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Rate-limit state: seconds remaining until retry is allowed
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number>(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatFeedRef = useRef<HTMLDivElement>(null);

  const startCountdown = useCallback((seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setRateLimitCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Clean chat when patient changes
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
  }, [selectedPatientId]);

  const handleSend = async (customQuery?: string) => {
    const textToSend = customQuery || query;
    if (!textToSend.trim() || !selectedPatientId || rateLimitCountdown > 0) return;

    if (!customQuery) {
      setQuery("");
    }

    // Add user message to state
    const updatedMessages: Message[] = [...messages, { role: "user", content: textToSend }];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatientId,
          query: textToSend,
          history: messages,
          conversationId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages((prev) => [...prev, { role: "model", content: data.responseText }]);
        if (data.conversationId) {
          setConversationId(data.conversationId);
        }
      } else if (res.status === 429 && data.rateLimited) {
        // Start countdown and inject a friendly inline message
        startCountdown(data.retryAfterSeconds ?? 60);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content:
              `⏳ **Quota IA temporairement atteint.**\n\nLe service reprendra dans ${data.retryAfterSeconds ?? 60} secondes.\n_Veuillez patienter avant de poser votre prochaine question._`,
          },
        ]);
      } else if (res.status === 503 && data.serviceUnavailable) {
        // Gemini overloaded — transient, user can retry manually
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            content:
              "🔄 **Service IA momentanément indisponible.**\n\nLes serveurs Gemini sont actuellement surchargés. Veuillez réessayer votre question dans quelques instants.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "model", content: `❌ Erreur : ${data.error || "Impossible de générer une réponse."}` }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: "❌ Erreur de réseau : Impossible de contacter l'assistant IA." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    { label: "Analyser les risques", text: "Quels sont les principaux risques identifiés pour ce patient (chute, déshydratation, observance) ?" },
    { label: "Résumer le dossier", text: "Fais un résumé synthétique complet du dossier médical de ce patient." },
    { label: "Vérifier le plan de soins", text: "Analyse le plan de soins actuel et les médicaments associés. Sont-ils à jour ?" },
    { label: "Analyse des incidents", text: "Quels sont les incidents récents signalés pour ce patient et comment y remédier ?" }
  ];

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  return (
    <Card className="flex-1 flex flex-col md:flex-row overflow-hidden border bg-card shadow-lg rounded-2xl">
      {/* Sidebar: Patient Selector & Actions */}
      <div className="w-full md:w-72 border-r bg-muted/20 p-5 flex flex-col gap-5 shrink-0">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patient à analyser</label>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-primary focus:outline-none"
          >
            <option value="">-- Sélectionner un patient --</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.user.lastName} {p.user.firstName}
              </option>
            ))}
          </select>
        </div>

        {selectedPatientId ? (
          <div className="flex-1 flex flex-col gap-4">
            <div className="p-4 rounded-xl border bg-background/50 text-xs space-y-2 shadow-inner">
              <span className="font-semibold text-primary text-sm block">Sélection actuelle</span>
              <p><strong>Nom :</strong> {selectedPatient?.user.lastName} {selectedPatient?.user.firstName}</p>
              <p><strong>Email :</strong> {selectedPatient?.user.email}</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Actions rapides IA</span>
              {quickPrompts.map((p, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="justify-start text-left text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 py-2 px-3 border border-border/60 rounded-xl"
                  onClick={() => handleSend(p.text)}
                  disabled={loading}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-2 text-violet-500 shrink-0" />
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-6 border border-dashed rounded-xl bg-background/40">
            <p className="text-xs text-muted-foreground">Sélectionnez un patient dans la liste pour commencer la discussion clinique.</p>
          </div>
        )}
      </div>

      {/* Main Chat Log */}
      <div className="flex-1 flex flex-col bg-background/40 min-h-0">

        {/* Rate-limit banner */}
        {rateLimitCountdown > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 bg-amber-500/10 border-b border-amber-500/25 text-amber-700 dark:text-amber-400 text-sm">
            <Clock className="h-4 w-4 shrink-0 animate-pulse" />
            <span>
              <strong>Quota IA atteint.</strong> L&apos;assistant sera de nouveau disponible dans{" "}
              <span className="font-mono font-bold">{rateLimitCountdown}s</span>.
              Veuillez patienter.
            </span>
          </div>
        )}

        {/* Chat Feed */}
        <div ref={chatFeedRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-65">
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Brain className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <h3 className="font-bold text-lg">Assistant Clinique MedDoc</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                L&apos;IA analysera les incidents, rapports, allergies et pathologies du patient sélectionné pour vous guider.
              </p>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${
                  m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className={m.role === "user" ? "bg-primary text-primary-foreground font-bold" : "bg-violet-600 text-white font-bold"}>
                    {m.role === "user" ? <User className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`p-4 rounded-2xl text-sm border shadow-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border/80"
                  }`}
                >
                  <p className="whitespace-pre-line">{m.content}</p>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-3 max-w-[80%] mr-auto">
              <Avatar className="h-8 w-8 border border-border bg-violet-600 text-white">
                <AvatarFallback className="bg-violet-600 text-white">
                  <Brain className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="p-4 rounded-2xl bg-card text-muted-foreground border shadow-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>L&apos;assistant clinique IA analyse le dossier du patient...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t p-4 bg-card/60 backdrop-blur flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={!selectedPatientId || loading || rateLimitCountdown > 0}
            placeholder={
              rateLimitCountdown > 0
                ? `⏳ Quota atteint — disponible dans ${rateLimitCountdown}s...`
                : selectedPatientId
                ? `Posez votre question sur ${selectedPatient?.user.lastName} ${selectedPatient?.user.firstName}...`
                : "Sélectionnez d'abord un patient pour lui poser une question..."
            }
            className="flex-1 rounded-xl bg-background border focus-visible:ring-primary focus-visible:outline-none"
          />
          <Button
            onClick={() => handleSend()}
            disabled={!selectedPatientId || !query.trim() || loading || rateLimitCountdown > 0}
            className="rounded-xl px-4 shrink-0 shadow-sm"
          >
            {rateLimitCountdown > 0 ? (
              <Clock className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
