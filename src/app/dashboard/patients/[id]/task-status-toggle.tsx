"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toggleTaskStatus } from "@/actions/careplans";
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

  const handleToggle = async () => {
    if (loading) return;
    
    const newStatus = !isCompleted;
    setIsCompleted(newStatus); // Optimistic update
    setLoading(true);

    const result = await toggleTaskStatus(taskId, patientId, newStatus);
    
    setLoading(false);
    if (!result.success) {
      // Revert on failure
      setIsCompleted(!newStatus);
      toast.error(result.error);
    } else {
      if (newStatus) {
        toast.success("Tâche marquée comme terminée.");
      }
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border mt-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        isCompleted 
          ? "bg-primary border-primary text-primary-foreground" 
          : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
      )}
      aria-label="Marquer la tâche comme terminée"
    >
      {isCompleted && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}
