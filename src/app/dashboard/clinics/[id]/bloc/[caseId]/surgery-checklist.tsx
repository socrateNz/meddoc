"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { signChecklistPhase } from "@/actions/surgery";
import { CHECKLIST, CHECKLIST_PHASES, phaseBlocker, type ChecklistAnswer, type ChecklistPhase, type ChecklistRecord } from "@/lib/surgery";

type SignedPhase = { answers: Record<string, ChecklistAnswer>; notes: string | null; checkedAt: string; checkedByName: string | null };

const formatDateTime = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

function PhaseForm({ caseId, phase }: { caseId: string; phase: ChecklistPhase }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const items = CHECKLIST[phase].items;
  const complete = items.every((i) => answers[i.key]);

  const submit = async () => {
    setSaving(true);
    const res = await signChecklistPhase({ caseId, phase, answers, notes: notes.trim() || undefined });
    setSaving(false);
    if (res.success) {
      toast.success(`Étape « ${CHECKLIST[phase].label} » signée.`);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-start justify-between gap-3 text-sm rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/30">
          <span>{item.label}</span>
          <div className="flex gap-1 shrink-0">
            {(["YES", ...(item.naAllowed ? ["NA"] : [])] as ChecklistAnswer[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAnswers((s) => ({ ...s, [item.key]: a }))}
                className={`px-2 py-0.5 rounded-md text-xs font-semibold border transition-all ${
                  answers[item.key] === a ? (a === "YES" ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-600 text-white border-slate-600") : "border-slate-200 dark:border-slate-700"
                }`}
              >
                {a === "YES" ? "Oui" : "N/A"}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations (facultatif)" maxLength={1000} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Un point non confirmable bloque l&apos;étape : ne signez pas, réglez d&apos;abord le problème.</p>
        <Button size="sm" disabled={!complete || saving} onClick={submit} className="gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
          Signer l&apos;étape
        </Button>
      </div>
    </div>
  );
}

// Check-list de sécurité au bloc (OMS), en 3 temps signés dans l'ordre.
export default function SurgeryChecklist({ caseId, status, checklist, canSign }: { caseId: string; status: string; checklist: Partial<Record<ChecklistPhase, SignedPhase>>; canSign: boolean }) {
  const record = checklist as unknown as ChecklistRecord;
  return (
    <div className="space-y-4">
      {CHECKLIST_PHASES.map((phase, index) => {
        const signed = checklist[phase];
        const blocker = phaseBlocker(phase, status, record);
        return (
          <div key={phase} className={`rounded-xl border p-3 ${signed ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/10" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="font-semibold text-sm">
                {index + 1}. {CHECKLIST[phase].label}
              </p>
              {signed ? (
                <span className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {signed.checkedByName ?? "-"}, {formatDateTime(signed.checkedAt)}
                </span>
              ) : (
                blocker && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Lock className="h-3 w-3" />{status === "CANCELLED" ? "Annulée" : "Pas encore"}</span>
              )}
            </div>
            {signed ? (
              <ul className="text-xs space-y-0.5">
                {CHECKLIST[phase].items.map((item) => (
                  <li key={item.key} className="flex gap-2">
                    <span className={`font-bold w-8 ${signed.answers[item.key] === "YES" ? "text-emerald-600" : "text-slate-500"}`}>{signed.answers[item.key] === "YES" ? "Oui" : "N/A"}</span>
                    <span>{item.label}</span>
                  </li>
                ))}
                {signed.notes && <li className="pt-1 italic text-muted-foreground">{signed.notes}</li>}
              </ul>
            ) : canSign && !blocker ? (
              <PhaseForm caseId={caseId} phase={phase} />
            ) : (
              blocker && status !== "CANCELLED" && status !== "COMPLETED" && <p className="text-xs text-muted-foreground">{blocker}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
