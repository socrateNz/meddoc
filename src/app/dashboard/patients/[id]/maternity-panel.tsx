"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Baby, Loader2, Stethoscope, HeartPulse } from "lucide-react";
import { updatePregnancyStatus } from "@/actions/maternity";
import NewPregnancyDialog from "./new-pregnancy-dialog";
import AddPrenatalVisitDialog from "./add-prenatal-visit-dialog";
import RecordDeliveryDialog from "./record-delivery-dialog";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Grossesse en cours", className: "bg-pink-500/10 text-pink-600 border-pink-500/20" },
  DELIVERED: { label: "Accouchée", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  MISCARRIED: { label: "Fausse couche", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  TERMINATED: { label: "Interrompue", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
};

const MODE_LABELS: Record<string, string> = {
  VAGINAL: "Voie basse",
  C_SECTION: "Césarienne",
  ASSISTED: "Voie basse assistée",
};

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

export default function MaternityPanel({
  patientId,
  pregnancies,
  canWrite,
  isDischarged,
}: {
  patientId: string;
  pregnancies: any[];
  canWrite: boolean;
  isDischarged: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasActivePregnancy = pregnancies.some((p) => p.status === "ACTIVE");

  const handleUpdateStatus = async (pregnancyId: string, status: "MISCARRIED" | "TERMINATED") => {
    setBusyId(pregnancyId);
    try {
      const res = await updatePregnancyStatus(pregnancyId, status);
      if (res.success) {
        toast.success(status === "MISCARRIED" ? "Grossesse marquée comme fausse couche." : "Grossesse marquée comme interrompue.");
        router.refresh();
      } else {
        toast.error(res.error || "Erreur lors de la mise à jour.");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Baby className="h-5 w-5 text-pink-500" />
          Suivi de maternité
        </h3>
        {canWrite && !isDischarged && !hasActivePregnancy && <NewPregnancyDialog patientId={patientId} />}
      </div>

      {pregnancies.length === 0 ? (
        <div className="border border-dashed rounded-xl p-12 text-center bg-card">
          <Baby className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h4 className="font-medium text-base">Aucune grossesse enregistrée</h4>
          <p className="text-sm text-muted-foreground mt-1">Les grossesses, visites prénatales et accouchements de la patiente apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pregnancies.map((pregnancy) => {
            const status = STATUS_LABELS[pregnancy.status] || STATUS_LABELS.ACTIVE;
            const isActive = pregnancy.status === "ACTIVE";
            return (
              <Card key={pregnancy.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      G{pregnancy.gravidity}P{pregnancy.parity}
                      <Badge variant="outline" className={status.className}>{status.label}</Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      DDR : {formatDate(pregnancy.lastMenstrualPeriod)} • DPA : {formatDate(pregnancy.expectedDueDate)}
                    </CardDescription>
                  </div>
                  {isActive && canWrite && !isDischarged && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                        disabled={busyId === pregnancy.id}
                        onClick={() => handleUpdateStatus(pregnancy.id, "MISCARRIED")}
                      >
                        {busyId === pregnancy.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Fausse couche
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                        disabled={busyId === pregnancy.id}
                        onClick={() => handleUpdateStatus(pregnancy.id, "TERMINATED")}
                      >
                        {busyId === pregnancy.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Interruption
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {pregnancy.riskFactors?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pregnancy.riskFactors.map((factor: string) => (
                        <Badge key={factor} variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/5">
                          {factor}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <Stethoscope className="h-4 w-4 text-pink-500" />
                        Visites prénatales ({pregnancy.prenatalVisits?.length || 0})
                      </h4>
                      {isActive && canWrite && !isDischarged && <AddPrenatalVisitDialog pregnancyId={pregnancy.id} />}
                    </div>
                    {(pregnancy.prenatalVisits?.length || 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune visite enregistrée.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {pregnancy.prenatalVisits.map((visit: any) => (
                          <li key={visit.id} className="text-xs p-2.5 bg-muted/40 rounded-lg border border-border/50">
                            <span className="font-semibold">{formatDate(visit.visitDate)}</span>
                            {visit.gestationalWeeks != null && <span> • {visit.gestationalWeeks} SA</span>}
                            {visit.weightKg != null && <span> • {visit.weightKg} kg</span>}
                            {(visit.bloodPressureSystolic != null || visit.bloodPressureDiastolic != null) && (
                              <span> • TA {visit.bloodPressureSystolic ?? "—"}/{visit.bloodPressureDiastolic ?? "—"}</span>
                            )}
                            {visit.fundalHeightCm != null && <span> • HU {visit.fundalHeightCm} cm</span>}
                            {visit.fetalHeartRateBpm != null && <span> • BCF {visit.fetalHeartRateBpm} bpm</span>}
                            {visit.notes && <p className="text-muted-foreground mt-1 italic">{visit.notes}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {isActive && canWrite && !isDischarged && (
                    <div className="pt-1">
                      <RecordDeliveryDialog pregnancyId={pregnancy.id} />
                    </div>
                  )}

                  {pregnancy.delivery && (
                    <div className="space-y-2 pt-2 border-t">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <HeartPulse className="h-4 w-4 text-emerald-500" />
                        Accouchement — {formatDate(pregnancy.delivery.deliveredAt)} ({MODE_LABELS[pregnancy.delivery.mode] || pregnancy.delivery.mode})
                      </h4>
                      {pregnancy.delivery.complications?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {pregnancy.delivery.complications.map((c: string) => (
                            <Badge key={c} variant="outline" className="text-[10px] border-red-500/30 text-red-600 bg-red-500/5">{c}</Badge>
                          ))}
                        </div>
                      )}
                      {pregnancy.delivery.notes && <p className="text-xs text-muted-foreground italic">{pregnancy.delivery.notes}</p>}
                      <ul className="space-y-1.5">
                        {pregnancy.delivery.newborns.map((newborn: any) => (
                          <li key={newborn.id} className="text-xs p-2.5 bg-muted/40 rounded-lg border border-border/50">
                            <span className="font-semibold">{newborn.sex === "F" ? "Fille" : newborn.sex === "M" ? "Garçon" : "Indéterminé"}</span>
                            {" • "}{newborn.weightGrams} g
                            {(newborn.apgarScore1 != null || newborn.apgarScore5 != null) && (
                              <span> • Apgar {newborn.apgarScore1 ?? "—"}/{newborn.apgarScore5 ?? "—"}</span>
                            )}
                            {newborn.vitalStatus === "STILLBIRTH" && (
                              <Badge variant="outline" className="ml-1.5 text-[10px] border-red-500/30 text-red-600 bg-red-500/5">Mort-né(e)</Badge>
                            )}
                            {newborn.notes && <p className="text-muted-foreground mt-1 italic">{newborn.notes}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
