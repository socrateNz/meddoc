"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-3 bg-destructive/10 rounded-full">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <h1 className="text-xl font-bold tracking-tight">Une erreur est survenue</h1>
        <p className="text-sm text-muted-foreground">
          Quelque chose s'est mal passé. Vous pouvez réessayer ou revenir au tableau de bord.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Retour au tableau de bord
          </Button>
          <Button onClick={() => reset()}>Réessayer</Button>
        </div>
      </div>
    </div>
  );
}
