"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-3 bg-destructive/10 rounded-full">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <h2 className="text-lg font-semibold">Impossible d'afficher cette page</h2>
        <p className="text-sm text-muted-foreground">
          Une erreur inattendue s'est produite lors du chargement de cette section.
        </p>
        <Button onClick={() => reset()}>Réessayer</Button>
      </div>
    </div>
  );
}
