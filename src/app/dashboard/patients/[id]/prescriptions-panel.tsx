"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Pill, RefreshCw, Send, AlertTriangle } from "lucide-react";
import { renewPrescription, sendPrescriptionToPharmacy } from "@/actions/prescriptions";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  SENT_TO_PHARMACY: { label: "Envoyée à la pharmacie", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  DISPENSED: { label: "Délivrée", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  SUPERSEDED: { label: "Renouvelée", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  CANCELLED: { label: "Annulée", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

const SEVERITY_LABELS: Record<string, { label: string; className: string }> = {
  LOW: { label: "Risque faible", className: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900" },
  MODERATE: { label: "Risque modéré", className: "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-900" },
  HIGH: { label: "Risque élevé", className: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900" },
};

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

export default function PrescriptionsPanel({ prescriptions, canPrescribe }: { prescriptions: any[]; canPrescribe: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleRenew = async (id: string) => {
    setBusyId(id);
    try {
      const res = await renewPrescription(id);
      if (res.success) {
        toast.success("Ordonnance renouvelée.");
        router.refresh();
      } else {
        toast.error(res.error || "Erreur lors du renouvellement.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSend = async (id: string) => {
    setBusyId(id);
    try {
      const res = await sendPrescriptionToPharmacy(id);
      if (res.success) {
        toast.success(
          res.data?.unavailable && res.data.unavailable.length > 0
            ? `Envoyée à la pharmacie — rupture possible : ${res.data.unavailable.join(", ")}`
            : "Ordonnance envoyée à la pharmacie."
        );
        router.refresh();
      } else {
        toast.error(res.error || "Erreur lors de l'envoi à la pharmacie.");
      }
    } finally {
      setBusyId(null);
    }
  };

  if (prescriptions.length === 0) {
    return (
      <div className="border border-dashed rounded-xl p-12 text-center bg-card">
        <Pill className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <h4 className="font-medium text-base">Aucune ordonnance</h4>
        <p className="text-sm text-muted-foreground mt-1">Les ordonnances rédigées en consultation apparaîtront ici.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prescriptions.map((p) => {
        const status = STATUS_LABELS[p.status] || STATUS_LABELS.ACTIVE;
        const severity = p.interactionCheck?.severity;
        return (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Ordonnance du {formatDate(p.createdAt)}</CardTitle>
                <CardDescription>Par {p.prescribedBy?.firstName} {p.prescribedBy?.lastName}</CardDescription>
              </div>
              <Badge variant="outline" className={status.className}>{status.label}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {severity && severity !== "NONE" && (
                <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 ${SEVERITY_LABELS[severity]?.className || ""}`}>
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Vérification IA — {SEVERITY_LABELS[severity]?.label || severity} (consultatif, à valider cliniquement)</p>
                    {(p.interactionCheck.warnings || []).map((w: any, i: number) => (
                      <p key={i}>{(w.drugs || []).join(" + ")} : {w.description}</p>
                    ))}
                  </div>
                </div>
              )}

              <ul className="space-y-1.5">
                {p.items.map((item: any) => (
                  <li key={item.id} className="text-sm p-2.5 bg-muted/40 rounded-lg border border-border/50">
                    <span className="font-semibold">{item.drugName}</span> — {item.dosage}, {item.frequency}
                    {item.duration ? ` (${item.duration})` : ""}
                    {item.instructions && <span className="block text-xs italic text-muted-foreground mt-0.5">{item.instructions}</span>}
                  </li>
                ))}
              </ul>

              {canPrescribe && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === p.id} onClick={() => handleRenew(p.id)}>
                    {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Renouveler
                  </Button>
                  {p.status === "ACTIVE" && (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === p.id} onClick={() => handleSend(p.id)}>
                      {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Envoyer à la pharmacie
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
