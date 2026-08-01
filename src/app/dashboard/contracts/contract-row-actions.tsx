"use client";

import { useState } from "react";
import { updateContractStatus } from "@/actions/contracts";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  COMPLETED: "Terminé",
  TERMINATED: "Résilié",
};

interface ContractRowActionsProps {
  contractId: string;
  currentStatus: string;
}

export default function ContractRowActions({ contractId, currentStatus }: ContractRowActionsProps) {
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;

    toast.promise(
      async () => {
        setLoading(true);
        const res = await updateContractStatus(contractId, newStatus);
        setLoading(false);
        if (!res.success) throw new Error(res.error);
        return res;
      },
      {
        loading: "Mise à jour du contrat...",
        success: "Statut du contrat mis à jour.",
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
        <DropdownMenuItem onClick={() => handleStatusChange("ACTIVE")} className="text-xs py-2">
          Marquer comme "Actif"
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("SUSPENDED")} className="text-xs py-2">
          Marquer comme "Suspendu"
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("COMPLETED")} className="text-xs py-2 text-emerald-600 focus:text-emerald-700">
          Marquer comme "Terminé"
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("TERMINATED")} className="text-xs py-2 text-rose-600 focus:text-rose-700">
          Marquer comme "Résilié"
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
