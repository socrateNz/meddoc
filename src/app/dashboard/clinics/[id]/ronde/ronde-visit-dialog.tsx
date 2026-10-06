"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { recordRoundVisit, skipRoundEntry } from "@/actions/rounds";
import { ROUND_DECISIONS, ROUND_DECISION_LABELS, type RoundDecision } from "@/lib/rounds";

// Une entrée de la ronde, telle que renvoyée par getRound : chambre et lit, point clinique du patient,
// et ce qui a déjà été saisi pendant la visite.
export interface RoundEntryView {
  id: string;
  position: number;
  bedLabel: string;
  roomName: string | null;
  bedNumber: string | null;
  status: string; // PENDING, VISITED, SKIPPED
  observations: string | null;
  decision: string | null;
  plan: string | null;
  visitedAt: string | Date | null;
  visitedBy: { firstName: string; lastName: string } | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    age: number;
    dependencyLevel: number;
    allergies: string[];
    status: string;
    lastVitals: {
      createdAt: string | Date;
      temperature: number | null;
      bloodPressure: string | null;
      heartRate: number | null;
      oxygenSaturation: number | null;
    } | null;
    pendingTasks: number;
    pendingLabs: number;
    openIncidents: number;
  } | null;
}

export const STATUS_LABEL: Record<string, string> = { PENDING: "À voir", VISITED: "Vu", SKIPPED: "Passé" };
export const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  VISITED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  SKIPPED: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30",
};

function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

interface RoundVisitDialogProps {
  clinicId: string;
  entry: RoundEntryView | null;
  sessionOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// Dialogue de visite : constantes, à suivre, puis les champs de la visite. Ouvert depuis le tableau ou la grille.
export default function RoundVisitDialog({ clinicId, entry, sessionOpen, onOpenChange }: RoundVisitDialogProps) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] rounded-2xl max-h-[90vh] overflow-y-auto">
        {entry && (
          <RoundVisitBody
            key={entry.id}
            clinicId={clinicId}
            entry={entry}
            sessionOpen={sessionOpen}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoundVisitBody({ clinicId, entry, sessionOpen, onDone }: { clinicId: string; entry: RoundEntryView; sessionOpen: boolean; onDone: () => void }) {
  const router = useRouter();
  const [observations, setObservations] = useState(entry.observations ?? "");
  const [decision, setDecision] = useState<string>(entry.decision ?? "");
  const [plan, setPlan] = useState(entry.plan ?? "");
  const [skipping, setSkipping] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [busy, setBusy] = useState(false);

  const patient = entry.patient;
  const editable = sessionOpen;
  const vitals = patient?.lastVitals;

  const save = async () => {
    setBusy(true);
    try {
      const res = await recordRoundVisit(entry.id, { observations, decision, plan });
      if (!res.success) {
        toast.error(res.error || "Enregistrement impossible.");
        return;
      }
      toast.success(`Visite enregistrée : ${patient?.firstName ?? ""} ${patient?.lastName ?? ""}`.trim());
      onDone();
      router.refresh();
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      const res = await skipRoundEntry(entry.id, skipReason);
      if (!res.success) {
        toast.error(res.error || "Passage impossible.");
        return;
      }
      toast.success("Patient passé.");
      onDone();
      router.refresh();
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {patient ? (
            <Link href={`/dashboard/clinics/${clinicId}/patients/${patient.id}`} className="hover:underline">
              {patient.lastName} {patient.firstName}
            </Link>
          ) : (
            "Patient introuvable"
          )}
          <Badge variant="outline" className={STATUS_CLASS[entry.status] ?? ""}>
            {STATUS_LABEL[entry.status] ?? entry.status}
          </Badge>
        </DialogTitle>
        <DialogDescription>
          {entry.bedLabel}
          {patient && ` · ${patient.age} ans · GIR ${patient.dependencyLevel}`}
          {entry.status !== "PENDING" && entry.visitedAt && (
            <>
              <br />
              {entry.status === "SKIPPED" ? "Passé" : "Vu"} le {formatDateTime(entry.visitedAt)}
              {entry.visitedBy && ` par ${entry.visitedBy.firstName} ${entry.visitedBy.lastName}`}
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      {patient && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5">
            <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">Dernières constantes</p>
            {vitals ? (
              <p className="text-slate-700 dark:text-slate-200">
                {vitals.temperature !== null && `T° ${vitals.temperature} °C · `}
                {vitals.bloodPressure && `TA ${vitals.bloodPressure} · `}
                {vitals.heartRate !== null && `FC ${vitals.heartRate} · `}
                {vitals.oxygenSaturation !== null && `SpO₂ ${vitals.oxygenSaturation} %`}
                <span className="block text-[11px] text-slate-400">relevé le {formatDateTime(vitals.createdAt)}</span>
              </p>
            ) : (
              <p className="text-slate-400">Aucune constante enregistrée</p>
            )}
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5">
            <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1">À suivre</p>
            <p className="text-slate-700 dark:text-slate-200">
              {patient.pendingTasks} tâche(s) de soins en attente · {patient.pendingLabs} analyse(s) en cours · {patient.openIncidents} incident(s) ouvert(s)
            </p>
            {patient.allergies.length > 0 && <p className="mt-1 text-red-600 dark:text-red-400">Allergies : {patient.allergies.join(", ")}</p>}
          </div>
        </div>
      )}

      {skipping ? (
        <div className="space-y-2">
          <Textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Motif du passage (absent, en examen, en bloc…)"
            className="text-sm rounded-xl"
            rows={2}
          />
          <DialogFooter>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setSkipping(false)} disabled={busy}>
              Retour
            </Button>
            <Button size="sm" className="rounded-xl" onClick={skip} disabled={busy || !skipReason.trim()}>
              Confirmer le passage
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Constats</p>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Constats : état général, douleur, tolérance du traitement…"
              className="text-sm rounded-xl"
              rows={3}
              disabled={!editable}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Décision</p>
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                disabled={!editable}
                className="h-9 w-full px-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <option value="">-- Décision --</option>
                {ROUND_DECISIONS.map((d: RoundDecision) => (
                  <option key={d} value={d}>
                    {ROUND_DECISION_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Conduite à tenir</p>
              <Textarea
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Prochaine étape, tâches à suivre"
                className="text-sm rounded-xl"
                rows={2}
                disabled={!editable}
              />
            </div>
          </div>

          <DialogFooter>
            {editable && entry.status === "PENDING" && (
              <Button variant="outline" className="rounded-xl" onClick={() => setSkipping(true)} disabled={busy}>
                Passer ce patient
              </Button>
            )}
            {editable && (
              <Button className="rounded-xl" onClick={save} disabled={busy}>
                {entry.status === "VISITED" ? "Mettre à jour la visite" : "Enregistrer la visite"}
              </Button>
            )}
          </DialogFooter>
        </div>
      )}
    </>
  );
}
