"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FolderOpen, Loader2, Megaphone, Play, RotateCcw, Stethoscope, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listTodayVisits, updateVisitStatus } from "@/actions/visits";
import { VISIT_DESTINATION_LABELS, VISIT_STATUS_LABELS, formatWait, type VisitAction, type VisitDestination, type VisitStatus } from "@/lib/visits";
import RegisterVisitDialog from "./register-visit-dialog";

type Visit = Extract<Awaited<ReturnType<typeof listTodayVisits>>, { success: true }>["data"][number];

const REFRESH_MS = 20000;
const CONSULTATION_ROLES = ["COORDINATOR", "MEDECIN"];
// Mêmes rôles que la section « patients » du middleware (src/middleware.ts) : le caissier n'a pas
// accès aux dossiers médicaux.
const PATIENT_FILE_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST"];

const DESTINATION_STYLES: Record<string, string> = {
  CONSULTATION: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  EMERGENCY: "bg-red-500/10 text-red-700 border-red-500/20",
  LAB: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  PHARMACY: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
  NURSING: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  ADMINISTRATIVE: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

interface AccueilViewProps {
  clinicId: string;
  currentUserId: string;
  currentUserRole: string;
  doctors: { id: string; name: string }[];
  initialVisits: Visit[];
  canRegister: boolean;
}

// File d'attente du jour (cf. src/actions/visits.ts) : rafraîchie toutes les 20 s, pour que
// l'accueil et les médecins voient les mêmes passages sans recharger la page.
export default function AccueilView({ clinicId, currentUserId, currentUserRole, doctors, initialVisits, canRegister }: AccueilViewProps) {
  const [visits, setVisits] = useState<Visit[]>(initialVisits);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [destinationFilter, setDestinationFilter] = useState<"ALL" | VisitDestination>("ALL");
  const [mineOnly, setMineOnly] = useState(currentUserRole === "MEDECIN");
  const [now, setNow] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      listTodayVisits(clinicId).then((res) => {
        if (cancelled) return;
        if (res.success) setVisits(res.data);
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

  const filtered = useMemo(
    () =>
      visits.filter((v) => {
        if (destinationFilter !== "ALL" && v.destination !== destinationFilter) return false;
        // « Mes patients » (médecin) : ses consultations attribuées, et celles sans médecin attitré.
        if (mineOnly && v.destination === "CONSULTATION" && v.assignedToId && v.assignedToId !== currentUserId) return false;
        return true;
      }),
    [visits, destinationFilter, mineOnly, currentUserId]
  );

  const waiting = filtered.filter((v) => v.status === "WAITING" || v.status === "CALLED");
  const inProgress = filtered.filter((v) => v.status === "IN_PROGRESS");
  const finished = filtered.filter((v) => v.status === "DONE" || v.status === "CANCELLED");

  const act = async (visit: Visit, action: VisitAction) => {
    setBusyId(visit.id);
    const res = await updateVisitStatus({ visitId: visit.id, action });
    setBusyId(null);
    if (res.success) {
      if (action === "CALL") toast.success(`Ticket ${visit.ticket} appelé — ${visit.patientName}`);
      reload();
    } else {
      toast.error(res.error);
      reload();
    }
  };

  const renderCard = (v: Visit) => {
    const busy = busyId === v.id;
    const urgent = v.priority === "URGENT";
    const status = v.status as VisitStatus;
    const canConsult = CONSULTATION_ROLES.includes(currentUserRole) && (v.destination === "CONSULTATION" || v.destination === "EMERGENCY");
    return (
      <div
        key={v.id}
        className={`rounded-xl border p-3 space-y-2 bg-white/70 dark:bg-slate-900/60 ${
          urgent ? "border-red-400/60" : v.status === "CALLED" ? "border-amber-400/60" : "border-slate-200/70 dark:border-slate-800"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-lg font-black text-slate-800 dark:text-slate-100 shrink-0">{v.ticket}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{v.patientName}</p>
              {v.ipp && <p className="text-[11px] font-mono text-muted-foreground">{v.ipp}</p>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {urgent && (
              <Badge className="bg-red-600 text-white text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" />
                Urgent
              </Badge>
            )}
            {v.status === "CALLED" && <Badge className="bg-amber-500 text-white text-[10px]">Appelé</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge variant="outline" className={`text-[10px] ${DESTINATION_STYLES[v.destination] || ""}`}>
            {VISIT_DESTINATION_LABELS[v.destination as VisitDestination] || v.destination}
          </Badge>
          {v.assignedToName && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Stethoscope className="h-3 w-3" />
              {v.assignedToName}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {status === "IN_PROGRESS" && v.startedAt
              ? `en cours depuis ${formatWait(v.startedAt, now)}`
              : status === "DONE" || status === "CANCELLED"
                ? VISIT_STATUS_LABELS[status]
                : `attend depuis ${formatWait(v.arrivedAt, now)}`}
          </span>
          {v.handledByName && status !== "WAITING" && <span className="text-muted-foreground">• {v.handledByName}</span>}
        </div>
        {v.reason && <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{v.reason}</p>}

        {(status === "WAITING" || status === "CALLED" || status === "IN_PROGRESS") && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {status === "WAITING" && canRegister && (
              <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs" disabled={busy} onClick={() => act(v, "CALL")}>
                <Megaphone className="h-3.5 w-3.5" />
                Appeler
              </Button>
            )}
            {(status === "WAITING" || status === "CALLED") && v.canHandle && (
              <Button size="sm" className="h-7 gap-1 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 text-white" disabled={busy} onClick={() => act(v, "START")}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Prendre en charge
              </Button>
            )}
            {status === "CALLED" && canRegister && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-lg text-xs" disabled={busy} onClick={() => act(v, "REQUEUE")} title="Ne s'est pas présenté à l'appel">
                <RotateCcw className="h-3.5 w-3.5" />
                Remettre en attente
              </Button>
            )}
            {status === "IN_PROGRESS" && canConsult && (
              <Button asChild size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs">
                <Link href={`/dashboard/clinics/${clinicId}/patients/${v.patientId}/consultation`}>
                  <Stethoscope className="h-3.5 w-3.5" />
                  Consultation
                </Link>
              </Button>
            )}
            {status === "IN_PROGRESS" && v.canHandle && (
              <Button size="sm" className="h-7 gap-1 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => act(v, "COMPLETE")}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Terminer
              </Button>
            )}
            {PATIENT_FILE_ROLES.includes(currentUserRole) && (
              <Button asChild size="sm" variant="ghost" className="h-7 gap-1 rounded-lg text-xs">
                <Link href={`/dashboard/clinics/${clinicId}/patients/${v.patientId}`}>
                  <FolderOpen className="h-3.5 w-3.5" />
                  Dossier
                </Link>
              </Button>
            )}
            {canRegister && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-lg text-xs text-red-600 hover:text-red-700" disabled={busy} onClick={() => act(v, "CANCEL")} title="Parti sans être vu / passage annulé">
                <UserX className="h-3.5 w-3.5" />
                Parti
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  const column = (title: string, items: Visit[], tone: string, empty: string) => (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 p-3 space-y-3 min-h-40">
      <div className="flex items-center justify-between px-1">
        <h2 className={`text-xs font-bold uppercase tracking-wider ${tone}`}>{title}</h2>
        <span className="text-xs font-bold text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? <p className="text-xs text-muted-foreground px-1 py-6 text-center">{empty}</p> : items.map(renderCard)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={destinationFilter}
            onChange={(e) => setDestinationFilter(e.target.value as "ALL" | VisitDestination)}
            className="h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <option value="ALL">Toutes les orientations</option>
            {Object.entries(VISIT_DESTINATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {currentUserRole === "MEDECIN" && (
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="h-4 w-4" />
              Mes patients uniquement
            </label>
          )}
        </div>
        {canRegister && <RegisterVisitDialog clinicId={clinicId} doctors={doctors} onRegistered={reload} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {column("En attente", waiting, "text-amber-600", "Personne en attente.")}
        {column("En cours", inProgress, "text-blue-600", "Aucune prise en charge en cours.")}
        {column("Terminés aujourd'hui", finished, "text-emerald-600", "Aucun passage terminé.")}
      </div>
    </div>
  );
}
