"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PauseCircle, PlayCircle, Loader2 } from "lucide-react";
import { setClinicActive } from "@/actions/organizations";
import { useRouter } from "next/navigation";

interface ClinicStatusToggleProps {
  clinicId: string;
  isActive: boolean;
}

export default function ClinicStatusToggle({ clinicId, isActive }: ClinicStatusToggleProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  const handleToggle = () => {
    setError("");
    startTransition(async () => {
      const res = await setClinicActive(clinicId, !isActive);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        disabled={pending}
        className={`gap-1.5 h-7 px-2 text-xs rounded-lg ${isActive ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"}`}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isActive ? (
          <PauseCircle className="h-3.5 w-3.5" />
        ) : (
          <PlayCircle className="h-3.5 w-3.5" />
        )}
        {isActive ? "Suspendre" : "Réactiver"}
      </Button>
      {error && <p className="text-[10px] text-rose-600 max-w-[140px] text-right">{error}</p>}
    </div>
  );
}
