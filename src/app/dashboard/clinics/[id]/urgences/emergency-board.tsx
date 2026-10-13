"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FolderOpen, Play, ShieldAlert, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listEmergencyBoard } from "@/actions/triage";
import { updateVisitStatus } from "@/actions/visits";
import { TRIAGE_STYLES, triageDelay, triageLevelInfo } from "@/lib/triage";
import { formatWait, type VisitAction } from "@/lib/visits";
import TriageDialog from "./triage-dialog";

type Row = Extract<Awaited<ReturnType<typeof listEmergencyBoard>>, { success: true }>["data"][number];

const REFRESH_MS = 20000;
const CONSULTATION_ROLES = ["COORDINATOR", "MEDECIN"];

function age(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const d = new Date(dateOfBirth);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

// Tableau des urgences : patients à trier en tête, puis par niveau CIMU et ordre d'arrivée ; le
// dépassement du délai cible du niveau est signalé. Rafraîchi toutes les 20 s.
export default function EmergencyBoard({ clinicId, currentUserRole, initialRows, canTriage }: { clinicId: string; currentUserRole: string; initialRows: Row[]; canTriage: boolean }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [now, setNow] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      listEmergencyBoard(clinicId).then((res) => {
        if (cancelled) return;
        if (res.success) setRows(res.data);
        setNow(new Date());
      });
    if (reloadKey > 0) refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [clinicId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const active = rows.filter((r) => ["WAITING", "CALLED", "IN_PROGRESS"].includes(r.status));
  const finished = rows.filter((r) => r.status === "DONE" || r.status === "CANCELLED");

  const act = async (row: Row, action: VisitAction) => {
    setBusyId(row.id);
    const res = await updateVisitStatus({ visitId: row.id, action });
    setBusyId(null);
    if (!res.success) toast.error(res.error);
    reload();
  };

  const counts = [1, 2, 3, 4, 5].map((lvl) => active.filter((r) => r.triageLevel === lvl).length);
  const untriaged = active.filter((r) => r.triageLevel == null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge className={`${untriaged ? "bg-red-600 animate-pulse" : "bg-slate-400"} text-white`}>À trier : {untriaged}</Badge>
        {counts.map((c, i) => (
          <Badge key={i} className={TRIAGE_STYLES[i + 1].badge}>
            Niveau {i + 1} : {c}
          </Badge>
        ))}
      </div>

      {active.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucun patient aux urgences. Les arrivées orientées « Urgences » à l&apos;accueil apparaissent ici.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((r) => {
            const info = triageLevelInfo(r.triageLevel);
            const { overdue } = triageDelay(r.triageLevel, r.arrivedAt, now);
            const a = age(r.dateOfBirth);
            const busy = busyId === r.id;
            return (
              <div key={r.id} className={`rounded-2xl border-2 p-4 space-y-2 bg-white/70 dark:bg-slate-900/60 ${info ? TRIAGE_STYLES[info.level].border : "border-red-500 border-dashed"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {info ? (
                      <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-lg font-black ${TRIAGE_STYLES[info.level].badge}`}>{info.level}</span>
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-red-600 text-white animate-pulse">
                        <AlertTriangle className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        <span className="font-mono text-muted-foreground mr-1.5">{r.ticket}</span>
                        {r.patientName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {[r.ipp, a != null ? `${a} ans` : null, r.sex].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-semibold inline-flex items-center gap-1 ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                      <Clock className="h-3 w-3" />
                      {formatWait(r.arrivedAt, now)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {info ? `${info.label} — cible ${info.targetMinutes === 0 ? "immédiate" : `${info.targetMinutes} min`}` : "Non trié"}
                    </p>
                    {overdue && r.status !== "IN_PROGRESS" && <Badge className="bg-red-600 text-white text-[10px] mt-1">Délai dépassé</Badge>}
                    {r.status === "IN_PROGRESS" && <Badge className="bg-blue-600 text-white text-[10px] mt-1">Pris en charge{r.handledByName ? ` — ${r.handledByName}` : ""}</Badge>}
                  </div>
                </div>

                {r.allergies.length > 0 && (
                  <p className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Allergies : {r.allergies.join(", ")}
                  </p>
                )}
                {r.triage ? (
                  <div className="text-xs space-y-1">
                    <p className="font-medium">{r.triage.chiefComplaint}</p>
                    <p className="text-muted-foreground">
                      {[
                        r.triage.bloodPressure && `TA ${r.triage.bloodPressure}`,
                        r.triage.heartRate != null && `FC ${r.triage.heartRate}`,
                        r.triage.respiratoryRate != null && `FR ${r.triage.respiratoryRate}`,
                        r.triage.oxygenSaturation != null && `SpO₂ ${r.triage.oxygenSaturation}%`,
                        r.triage.temperature != null && `T° ${r.triage.temperature}`,
                        r.triage.painScore != null && `EVA ${r.triage.painScore}`,
                        r.triage.glasgow != null && `GCS ${r.triage.glasgow}`,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "Constantes non relevées"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Trié par {r.triage.triagedBy || "-"} à {new Date(r.triage.triagedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ) : (
                  r.reason && <p className="text-xs text-muted-foreground">Motif à l&apos;accueil : {r.reason}</p>
                )}

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {canTriage && <TriageDialog visitId={r.id} patientName={r.patientName} currentLevel={r.triageLevel} defaultComplaint={r.triage?.chiefComplaint ?? r.reason} onDone={reload} />}
                  {canTriage && r.status !== "IN_PROGRESS" && (
                    <Button size="sm" className="h-7 gap-1 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white" disabled={busy} onClick={() => act(r, "START")}>
                      <Play className="h-3.5 w-3.5" />
                      Prendre en charge
                    </Button>
                  )}
                  {canTriage && r.status === "IN_PROGRESS" && (
                    <Button size="sm" className="h-7 gap-1 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => act(r, "COMPLETE")}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Terminer
                    </Button>
                  )}
                  {CONSULTATION_ROLES.includes(currentUserRole) && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs">
                      <Link href={`/dashboard/clinics/${clinicId}/patients/${r.patientId}/consultation`}>
                        <Stethoscope className="h-3.5 w-3.5" />
                        Consultation
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost" className="h-7 gap-1 rounded-lg text-xs">
                    <Link href={`/dashboard/clinics/${clinicId}/patients/${r.patientId}`}>
                      <FolderOpen className="h-3.5 w-3.5" />
                      Dossier
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {finished.length > 0 && (
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Sortis des urgences aujourd&apos;hui ({finished.length})</p>
          <div className="flex flex-wrap gap-2">
            {finished.map((r) => (
              <Badge key={r.id} variant="outline" className="text-[11px] gap-1">
                {r.triageLevel && <span className={`px-1 rounded ${TRIAGE_STYLES[r.triageLevel].badge}`}>{r.triageLevel}</span>}
                {r.ticket} {r.patientName}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
