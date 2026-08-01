"use client";

import { useState } from "react";
import { updateContactMessageStatus } from "@/actions/contact-messages";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  READ: "Lu",
  ARCHIVED: "Archivé",
};

export default function MessageRowActions({ messageId, currentStatus }: { messageId: string; currentStatus: string }) {
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (newStatus: "NEW" | "READ" | "ARCHIVED") => {
    if (newStatus === currentStatus) return;

    toast.promise(
      async () => {
        setLoading(true);
        const res = await updateContactMessageStatus(messageId, newStatus);
        setLoading(false);
        if (!res.success) throw new Error(res.error);
        return res;
      },
      {
        loading: "Mise à jour...",
        success: "Statut mis à jour.",
        error: (err) => err.message || "Erreur de mise à jour.",
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="flex flex-row gap-2 h-8 text-xs font-medium" disabled={loading} />}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : STATUS_LABELS[currentStatus] || currentStatus}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border shadow-lg rounded-xl">
        <DropdownMenuItem onClick={() => handleStatusChange("NEW")} className="text-xs py-2">
          Marquer comme « Nouveau »
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("READ")} className="text-xs py-2">
          Marquer comme « Lu »
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("ARCHIVED")} className="text-xs py-2 text-slate-500">
          Archiver
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
