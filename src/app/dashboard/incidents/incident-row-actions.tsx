"use client";

import { useState } from "react";
import { updateIncidentStatus } from "@/actions/patients";
import { IncidentStatus } from "@prisma/client";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";

interface IncidentRowActionsProps {
  incidentId: string;
  currentStatus: IncidentStatus;
}

export default function IncidentRowActions({ incidentId, currentStatus }: IncidentRowActionsProps) {
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (newStatus: IncidentStatus) => {
    if (newStatus === currentStatus) return;

    setLoading(false);
    toast.promise(
      async () => {
        setLoading(true);
        const res = await updateIncidentStatus(incidentId, newStatus);
        setLoading(false);
        if (!res.success) throw new Error(res.error);
        return res;
      },
      {
        loading: "Mise à jour du statut...",
        success: "Statut mis à jour avec succès !",
        error: (err) => err.message || "Erreur de mise à jour.",
      }
    );
  };

  const getStatusLabel = (status: IncidentStatus) => {
    switch (status) {
      case "OPEN":
        return "À traiter";
      case "IN_PROGRESS":
        return "En cours";
      case "RESOLVED":
        return "Résolu";
      default:
        return status;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="flex flex-row gap-2 h-8 text-xs font-medium" disabled={loading} />}>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          getStatusLabel(currentStatus)
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border shadow-lg rounded-xl">
        <DropdownMenuItem onClick={() => handleStatusChange(IncidentStatus.OPEN)} className="text-xs py-2">
          Marquer comme "À traiter"
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(IncidentStatus.IN_PROGRESS)} className="text-xs py-2">
          Marquer comme "En cours"
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange(IncidentStatus.RESOLVED)} className="text-xs py-2 text-emerald-600 focus:text-emerald-700">
          Marquer comme "Résolu"
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
