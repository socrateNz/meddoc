"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Baby, Loader2, Stethoscope, HeartPulse } from "lucide-react";
import { createNewbornRecord, updatePregnancyStatus } from "@/actions/maternity";
import NewPregnancyDialog from "./new-pregnancy-dialog";
import AddPrenatalVisitDialog from "./add-prenatal-visit-dialog";
import RecordDeliveryDialog from "./record-delivery-dialog";
import PartogramDialog from "./partogram-dialog";
import NewLabOrderDialog from "@/app/dashboard/lab/new-lab-order-dialog";
import NewRadiologyOrderDialog from "@/app/dashboard/clinics/[id]/imagerie/new-radiology-order-dialog";
import NewPrescriptionDialog from "./new-prescription-dialog";
import { RADIOLOGY_STATUS_LABELS } from "@/lib/radiology";
import { FETAL_PRESENTATION_LABELS, PREVENTIVE_TREATMENT_LABELS, isPrenatalLabTest } from "@/lib/maternity-labels";
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

const LAB_STATUS_LABELS: Record<string, string> = {
  PRESCRIBED: "Prescrit",
  SAMPLE_COLLECTED: "Prélevé",
  RECEIVED_AT_LAB: "Reçu au labo",
  IN_ANALYSIS: "En analyse",
  TO_VALIDATE: "À valider",
  VALIDATED: "Résultats validés",
  DELIVERED: "Résultats remis",
  CANCELLED: "Annulé",
};

const PRENATAL_QUICK_PICK = { label: "Bilan prénatal", match: isPrenatalLabTest };

// Tension élevée en grossesse (≥ 140/90) : à surveiller (pré-éclampsie).
function isHighBloodPressure(visit: any) {
  return (visit.bloodPressureSystolic ?? 0) >= 140 || (visit.bloodPressureDiastolic ?? 0) >= 90;
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

export default function MaternityPanel({
  patientId,
  patient,
  pregnancies,
  canWrite,
  canOrderLab = false,
  canOrderImaging = false,
  canPrescribe = false,
  isDischarged,
}: {
  patientId: string;
  // Patiente (pour la demande d'examens depuis une visite).
  patient?: any;
  pregnancies: any[];
  canWrite: boolean;
  // Module Laboratoire actif et rôle clinique : bouton « Demander des examens » sur chaque visite.
  canOrderLab?: boolean;
  // Module Imagerie actif et rôle clinique : bouton « Échographie » sur chaque visite.
  canOrderImaging?: boolean;
  // Médecin / coordinateur : bouton « Ordonnance » sur chaque visite.
  canPrescribe?: boolean;
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

  // Dossier du nouveau-né (néonatalogie, couveuse) pour un accouchement enregistré sans lui.
  const handleCreateNewborn = async (newbornId: string) => {
    setBusyId(newbornId);
    try {
      const res = await createNewbornRecord(newbornId);
      if (res.success) {
        toast.success("Dossier du bébé créé.");
        router.refresh();
      } else {
        toast.error(res.error);
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
                      {isActive && pregnancy.prenatalVisits?.[0]?.nextVisitDate && (
                        <span className="block font-medium text-pink-600 dark:text-pink-400">
                          Prochain RDV : {formatDate(pregnancy.prenatalVisits[0].nextVisitDate)}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  {isActive && canWrite && !isDischarged && (
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
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
                        <Badge key={factor} variant="outline" className="text-xs border-amber-500/30 text-amber-600 bg-amber-500/5">
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
                      {isActive && canWrite && !isDischarged && (
                        <AddPrenatalVisitDialog
                          pregnancyId={pregnancy.id}
                          nextCpnNumber={Math.max(pregnancy.prenatalVisits?.length || 0, ...(pregnancy.prenatalVisits || []).map((v: any) => v.cpnNumber || 0)) + 1}
                        />
                      )}
                    </div>
                    {(pregnancy.prenatalVisits?.length || 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune visite enregistrée.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {pregnancy.prenatalVisits.map((visit: any) => (
                          <li key={visit.id} className="space-y-1.5 text-xs p-2.5 bg-muted/40 rounded-lg border border-border/50">
                            <p>
                              <span className="font-semibold">{visit.cpnNumber ? `CPN ${visit.cpnNumber} — ` : ""}{formatDate(visit.visitDate)}</span>
                              {visit.gestationalWeeks != null && <span> • {visit.gestationalWeeks} SA</span>}
                              {visit.weightKg != null && <span> • {visit.weightKg} kg</span>}
                              {(visit.bloodPressureSystolic != null || visit.bloodPressureDiastolic != null) && (
                                <span className={isHighBloodPressure(visit) ? "font-semibold text-red-600" : ""}>
                                  {" "}• TA {visit.bloodPressureSystolic ?? "—"}/{visit.bloodPressureDiastolic ?? "—"}
                                </span>
                              )}
                              {visit.fundalHeightCm != null && <span> • HU {visit.fundalHeightCm} cm</span>}
                              {visit.fetalHeartRateBpm != null && <span> • BCF {visit.fetalHeartRateBpm} bpm</span>}
                              {visit.fetalPresentation && <span> • {FETAL_PRESENTATION_LABELS[visit.fetalPresentation] || visit.fetalPresentation}</span>}
                              {visit.fetalMovements != null && <span> • MAF {visit.fetalMovements ? "perçus" : "non perçus"}</span>}
                              {visit.edema != null && <span className={visit.edema ? "font-semibold text-amber-600" : ""}> • Œdèmes {visit.edema ? "oui" : "non"}</span>}
                              {visit.urineProtein && <span className={visit.urineProtein.includes("+") ? "font-semibold text-red-600" : ""}> • Albumine {visit.urineProtein}</span>}
                              {visit.urineGlucose && <span className={visit.urineGlucose.includes("+") ? "font-semibold text-amber-600" : ""}> • Sucre {visit.urineGlucose}</span>}
                            </p>
                            {visit.preventiveTreatments?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {visit.preventiveTreatments.map((t: string) => (
                                  <Badge key={t} variant="outline" className="text-xs border-emerald-500/30 text-emerald-700 bg-emerald-500/5">
                                    {PREVENTIVE_TREATMENT_LABELS[t] || t}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {visit.notes && <p className="text-muted-foreground italic">{visit.notes}</p>}
                            {/* Ce qui a été demandé lors de la visite : examens, imagerie, ordonnances */}
                            {(visit.labOrders?.length > 0 || visit.radiologyOrders?.length > 0 || visit.prescriptions?.length > 0) && (
                              <div className="space-y-1">
                                {(visit.labOrders || []).map((o: any) => (
                                  <Link key={o.id} href={`/dashboard/lab/${o.id}`} className="flex flex-wrap items-center gap-1.5 rounded-md bg-background/60 px-2 py-1.5 hover:bg-background">
                                    <span className="font-medium text-blue-600 dark:text-blue-400">Examens :</span>
                                    <span className="min-w-0 flex-1">{o.tests.join(", ")}</span>
                                    <Badge variant="outline" className="text-xs">{LAB_STATUS_LABELS[o.status] || o.status}</Badge>
                                  </Link>
                                ))}
                                {(visit.radiologyOrders || []).map((o: any) => (
                                  <Link key={o.id} href={`/dashboard/clinics/${patient?.organizationId}/imagerie/${o.id}`} className="flex flex-wrap items-center gap-1.5 rounded-md bg-background/60 px-2 py-1.5 hover:bg-background">
                                    <span className="font-medium text-violet-600 dark:text-violet-400">Imagerie :</span>
                                    <span className="min-w-0 flex-1">{((o.exams as any[]) || []).map((e) => e.name).join(", ")}</span>
                                    <Badge variant="outline" className="text-xs">{RADIOLOGY_STATUS_LABELS[o.status] || o.status}</Badge>
                                  </Link>
                                ))}
                                {(visit.prescriptions || []).map((rx: any) => (
                                  <div key={rx.id} className="flex flex-wrap items-center gap-1.5 rounded-md bg-background/60 px-2 py-1.5">
                                    <span className="font-medium text-emerald-600 dark:text-emerald-400">Ordonnance :</span>
                                    <span className="min-w-0 flex-1">{(rx.items || []).map((i: any) => `${i.drugName} ${i.dosage}`).join(", ")}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {isActive && !isDischarged && patient && (canOrderLab || canOrderImaging || canPrescribe) && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {canOrderLab && (
                                  <NewLabOrderDialog
                                    patients={[patient]}
                                    defaultPatientId={patientId}
                                    organizationId={patient.organizationId ?? undefined}
                                    prenatalVisitId={visit.id}
                                    triggerLabel={visit.labOrders?.length > 0 ? "Autres examens" : "Examens"}
                                    quickPick={PRENATAL_QUICK_PICK}
                                    onSuccess={() => router.refresh()}
                                  />
                                )}
                                {canOrderImaging && patient.organizationId && (
                                  <NewRadiologyOrderDialog
                                    patientId={patientId}
                                    clinicId={patient.organizationId}
                                    prenatalVisitId={visit.id}
                                    triggerLabel="Échographie"
                                    preferModality="ULTRASOUND"
                                    onCreated={() => router.refresh()}
                                  />
                                )}
                                {canPrescribe && (
                                  <NewPrescriptionDialog patientId={patientId} prenatalVisitId={visit.id} onSuccess={() => router.refresh()} />
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {isActive && !isDischarged && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <PartogramDialog pregnancyId={pregnancy.id} canWrite={canWrite} />
                      {canWrite && <RecordDeliveryDialog pregnancyId={pregnancy.id} />}
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
                            <Badge key={c} variant="outline" className="text-xs border-red-500/30 text-red-600 bg-red-500/5">{c}</Badge>
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
                              <Badge variant="outline" className="ml-1.5 text-xs border-red-500/30 text-red-600 bg-red-500/5">Mort-né(e)</Badge>
                            )}
                            {newborn.notes && <p className="text-muted-foreground mt-1 italic">{newborn.notes}</p>}
                            {newborn.vitalStatus !== "STILLBIRTH" && (
                              <div className="mt-1.5">
                                {newborn.patientId ? (
                                  <Link href={`/dashboard/patients/${newborn.patientId}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                                    Ouvrir le dossier du bébé →
                                  </Link>
                                ) : (
                                  canWrite && (
                                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busyId === newborn.id} onClick={() => handleCreateNewborn(newborn.id)}>
                                      {busyId === newborn.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                      Créer le dossier du bébé
                                    </Button>
                                  )
                                )}
                              </div>
                            )}
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
