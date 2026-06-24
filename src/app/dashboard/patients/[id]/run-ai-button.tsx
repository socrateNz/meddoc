"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { generateAIAnalysis } from "@/actions/ai";
import { Button } from "@/components/ui/button";
import { BrainCircuit, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RunAiButtonProps {
  patientId: string;
}

export default function RunAiButton({ patientId }: RunAiButtonProps) {
  const [loading, setLoading] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

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

  const handleGenerate = async () => {
    if (loading || rateLimitCountdown > 0) return;
    setLoading(true);

    try {
      const res = await generateAIAnalysis(patientId);

      if (res.success) {
        toast.success("Analyse clinique générée avec succès !");
      } else if (res.rateLimited && res.retryAfterSeconds) {
        // 429: start the countdown and show a distinct amber toast
        startCountdown(res.retryAfterSeconds);
        toast.warning(
          `⏳ Quota IA atteint — réessayez dans ${res.retryAfterSeconds}s`,
          {
            description:
              "La limite journalière de requêtes Gemini (tier gratuit) est atteinte. Le bouton se réactivera automatiquement.",
            duration: res.retryAfterSeconds * 1000,
          }
        );
      } else if (res.serviceUnavailable) {
        // 503: transient overload, just show a toast — button stays enabled
        toast.warning("🔄 Service IA surchargé", {
          description: "Les serveurs Gemini sont momentanément indisponibles. Réessayez dans quelques instants.",
          duration: 8000,
        });
      } else {
        toast.error(res.error || "Erreur de génération.");
      }
    } catch {
      toast.error("Erreur réseau lors de la génération de l'analyse.");
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = loading || rateLimitCountdown > 0;

  return (
    <Button
      onClick={handleGenerate}
      disabled={isDisabled}
      className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all hover:scale-[1.02] duration-200 disabled:opacity-70 disabled:scale-100"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyse...
        </>
      ) : rateLimitCountdown > 0 ? (
        <>
          <Clock className="h-4 w-4 animate-pulse" />
          Quota atteint ({rateLimitCountdown}s)
        </>
      ) : (
        <>
          <BrainCircuit className="h-4 w-4" />
          Lancer l&apos;analyse
        </>
      )}
    </Button>
  );
}
