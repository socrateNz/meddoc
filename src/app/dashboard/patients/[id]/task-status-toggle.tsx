"use client";

import { useState, useEffect } from "react";
import { Check, CloudOff } from "lucide-react";
import { toggleTaskStatus } from "@/actions/careplans";
import { enqueueOfflineTaskToggle } from "@/lib/offlineSync";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskStatusToggleProps {
  taskId: string;
  patientId: string;
  initialStatus: string;
}

export default function TaskStatusToggle({ taskId, patientId, initialStatus }: TaskStatusToggleProps) {
  const [isCompleted, setIsCompleted] = useState(initialStatus === "COMPLETED");
  const [loading, setLoading] = useState(false);
  const [isPendingOfflineSync, setIsPendingOfflineSync] = useState(false);

  const handleToggle = async () => {
    if (loading) return;
    
    const newStatus = !isCompleted;
    setIsCompleted(newStatus); // Optimistic update
    setLoading(true);

    // Vérifier l'état de la connexion réseau
    const isOnline = typeof window !== "undefined" ? navigator.onLine : true;

    if (!isOnline) {
      // Mode Hors-Ligne: Enregistrement local dans l'IndexedDB
      await enqueueOfflineTaskToggle(taskId, patientId, newStatus);
      setIsPendingOfflineSync(true);
      setLoading(false);
      toast.warning("Validation enregistrée en mode hors-ligne. Elle sera synchronisée au retour de la connexion.");
      return;
    }

    // Mode En Ligne: Appel normal de la Server Action
    const result = await toggleTaskStatus(taskId, patientId, newStatus);
    
    setLoading(false);
    if (!result.success) {
      // Revert on failure
      setIsCompleted(!newStatus);
      toast.error(result.error);
    } else {
      setIsPendingOfflineSync(false);
      if (newStatus) {
        toast.success("Tâche marquée comme terminée.");
      }
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          isCompleted 
            ? "bg-primary border-primary text-primary-foreground" 
            : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
        )}
        aria-label="Marquer la tâche comme terminée"
      >
        {isCompleted && <Check className="h-3.5 w-3.5" />}
      </button>

      {isPendingOfflineSync && (
        <span 
          title="Enregistré localement - En attente de synchronisation"
          className="inline-flex items-center text-amber-500"
        >
          <CloudOff className="h-3.5 w-3.5 animate-pulse" />
        </span>
      )}
    </div>
  );
}
