"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleAvailability } from "@/actions/team";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AvailabilityToggle({ userId, initialStatus }: { userId: string, initialStatus: boolean }) {
  const [isAvailable, setIsAvailable] = useState(initialStatus);
  const [loading, setLoading] = useState(false);

  const handleToggle = async (checked: boolean) => {
    if (loading) return;
    
    setIsAvailable(checked);
    setLoading(true);

    const result = await toggleAvailability(userId, checked);
    
    setLoading(false);
    if (!result.success) {
      setIsAvailable(!checked); // revert
      toast.error(result.error);
    } else {
      toast.success(checked ? "Soignant marqué comme disponible." : "Soignant marqué comme indisponible.");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      <span className={`text-xs font-semibold ${isAvailable ? "text-emerald-600" : "text-slate-400"}`}>
        {isAvailable ? "En service" : "Indisponible"}
      </span>
      <Switch 
        checked={isAvailable} 
        onCheckedChange={handleToggle} 
        disabled={loading}
        className={isAvailable ? "data-[state=checked]:bg-emerald-500" : ""}
      />
    </div>
  );
}
