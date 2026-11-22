"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { addPartogramEntry, listPartogram } from "@/actions/maternity";
import { ACTION_LINE_OFFSET_H, alertLineStart, expectedDilation, partogramAlerts, type PartogramPoint } from "@/lib/partogram";
import { toast } from "sonner";

type Entry = PartogramPoint & {
  id: string;
  headDescent?: number | null;
  contractionDuration?: number | null;
  moulding?: string | null;
  urineVolume?: number | null;
  oxytocin?: string | null;
  drugs?: string | null;
  notes?: string | null;
};

const HOUR = 3600_000;
const FLUID_LABELS: Record<string, string> = { I: "Intactes", C: "Claire", M: "Méconiale", B: "Sanglante", A: "Absente" };

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Courbe de dilatation (cm) sur 12 heures depuis la première mesure, avec lignes d'alerte et d'action.
function DilationChart({ entries }: { entries: Entry[] }) {
  const pts = entries.filter((e) => e.cervicalDilation != null);
  if (pts.length === 0) return <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Aucune dilatation saisie.</p>;
  const t0 = new Date(entries[0].recordedAt).getTime();
  const lastT = new Date(entries[entries.length - 1].recordedAt).getTime();
  const spanH = Math.max(12, Math.ceil((lastT - t0) / HOUR) + 1);
  const W = 600;
  const H = 220;
  const pad = { l: 28, r: 8, t: 8, b: 22 };
  const x = (t: number) => pad.l + ((t - t0) / (spanH * HOUR)) * (W - pad.l - pad.r);
  const y = (cm: number) => pad.t + (1 - cm / 10) * (H - pad.t - pad.b);
  const start = alertLineStart(entries);
  const line = (offset: number) => {
    if (!start) return null;
    const a = start.at + offset * HOUR;
    const b = a + (10 - start.cm) * HOUR;
    return { x1: x(a), y1: y(start.cm), x2: x(b), y2: y(10) };
  };
  const alert = line(0);
  const action = line(ACTION_LINE_OFFSET_H);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border bg-white dark:bg-slate-950" role="img" aria-label="Courbe de dilatation">
      {Array.from({ length: 11 }, (_, cm) => (
        <g key={cm}>
          <line x1={pad.l} x2={W - pad.r} y1={y(cm)} y2={y(cm)} stroke="#e2e8f0" strokeWidth={cm === 4 ? 1.2 : 0.6} />
          <text x={4} y={y(cm) + 3} fontSize={9} fill="#64748b">
            {cm}
          </text>
        </g>
      ))}
      {Array.from({ length: spanH + 1 }, (_, h) => (
        <g key={h}>
          <line x1={x(t0 + h * HOUR)} x2={x(t0 + h * HOUR)} y1={pad.t} y2={H - pad.b} stroke="#f1f5f9" strokeWidth={0.6} />
          <text x={x(t0 + h * HOUR) - 3} y={H - 6} fontSize={9} fill="#64748b">
            {h}h
          </text>
        </g>
      ))}
      {alert && <line {...alert} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" />}
      {action && <line {...action} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="5 3" />}
      <polyline
        fill="none"
        stroke="#2563eb"
        strokeWidth={2}
        points={pts.map((p) => `${x(new Date(p.recordedAt).getTime())},${y(p.cervicalDilation!)}`).join(" ")}
      />
      {pts.map((p) => {
        const t = new Date(p.recordedAt).getTime();
        const late = start && p.cervicalDilation! < expectedDilation(start, t);
        return <text key={p.id} x={x(t) - 4} y={y(p.cervicalDilation!) + 4} fontSize={12} fontWeight="bold" fill={late ? "#dc2626" : "#2563eb"}>×</text>;
      })}
    </svg>
  );
}

const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

// Partogramme du travail en cours : saisie des mesures, courbe et alertes.
export default function PartogramDialog({ pregnancyId, canWrite }: { pregnancyId: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await listPartogram(pregnancyId);
    if (res.success) setEntries(res.data as Entry[]);
    else {
      toast.error(res.error);
      setEntries([]);
    }
  }, [pregnancyId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await addPartogramEntry({
      pregnancyId,
      cervicalDilation: num(form.dilation ?? ""),
      headDescent: num(form.descent ?? ""),
      contractionsPer10: num(form.contractions ?? ""),
      contractionDuration: num(form.duration ?? ""),
      fetalHeartRate: num(form.fhr ?? ""),
      amnioticFluid: (form.fluid || undefined) as "I" | "C" | "M" | "B" | "A" | undefined,
      moulding: (form.moulding || undefined) as "0" | "+" | "++" | "+++" | undefined,
      maternalPulse: num(form.pulse ?? ""),
      systolicBp: num(form.sys ?? ""),
      diastolicBp: num(form.dia ?? ""),
      temperature: num(form.temp ?? ""),
      urineVolume: num(form.urine ?? ""),
      oxytocin: form.oxytocin || undefined,
      drugs: form.drugs || undefined,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (res.success) {
      toast.success("Mesure ajoutée au partogramme.");
      setForm({});
      void load();
    } else {
      toast.error(res.error);
    }
  };

  const alerts = entries ? partogramAlerts(entries) : [];
  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-slate-500">{label}</label>
      <Input value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="h-10 text-base sm:h-9 sm:text-sm" inputMode="decimal" {...props} />
    </div>
  );
  const select = (k: string, label: string, options: [string, string][]) => (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-slate-500">{label}</label>
      <select value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm sm:h-9 dark:border-slate-800 dark:bg-slate-900">
        <option value="">—</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg text-xs" />}>
        <Activity className="h-3.5 w-3.5" />
        Partogramme
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-pink-600" />
            Partogramme
          </DialogTitle>
          <DialogDescription>
            Ligne d&apos;alerte (orange) : 1 cm/heure à partir de 4 cm. Ligne d&apos;action (rouge) : 4 heures plus tard.
          </DialogDescription>
        </DialogHeader>

        {entries === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((a, i) => (
              <p
                key={i}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${a.level === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {a.message}
              </p>
            ))}
            <DilationChart entries={entries} />

            {canWrite && (
              <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs font-bold uppercase text-slate-500">Nouvelle mesure (maintenant)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {field("dilation", "Dilatation (cm)")}
                  {field("descent", "Descente (5es)", { inputMode: "numeric" })}
                  {field("contractions", "Contractions /10 min", { inputMode: "numeric" })}
                  {field("duration", "Durée contraction (s)", { inputMode: "numeric" })}
                  {field("fhr", "Cœur fœtal (bpm)", { inputMode: "numeric" })}
                  {select("fluid", "Liquide amniotique", Object.entries(FLUID_LABELS))}
                  {select("moulding", "Modelage", [["0", "0"], ["+", "+"], ["++", "++"], ["+++", "+++"]])}
                  {field("pulse", "Pouls mère (/min)", { inputMode: "numeric" })}
                  {field("sys", "TA systolique", { inputMode: "numeric" })}
                  {field("dia", "TA diastolique", { inputMode: "numeric" })}
                  {field("temp", "Température (°C)")}
                  {field("urine", "Urines (mL)", { inputMode: "numeric" })}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {field("oxytocin", "Ocytocine", { inputMode: "text" })}
                  {field("drugs", "Médicaments / perfusions", { inputMode: "text" })}
                  {field("notes", "Observations", { inputMode: "text" })}
                </div>
                <Button type="submit" disabled={saving} className="w-full gap-2 sm:w-auto">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ajouter la mesure
                </Button>
              </form>
            )}

            {entries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-2">Heure</th>
                      <th className="pr-2">Dil.</th>
                      <th className="pr-2">Desc.</th>
                      <th className="pr-2">CU/10</th>
                      <th className="pr-2">BCF</th>
                      <th className="pr-2">Liquide</th>
                      <th className="pr-2">Pouls</th>
                      <th className="pr-2">TA</th>
                      <th className="pr-2">T°</th>
                      <th>Observations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...entries].reverse().map((e) => (
                      <tr key={e.id} className="border-b align-top last:border-0">
                        <td className="py-1.5 pr-2 font-medium">{timeLabel(e.recordedAt)}</td>
                        <td className="pr-2">{e.cervicalDilation ?? "—"}</td>
                        <td className="pr-2">{e.headDescent ?? "—"}</td>
                        <td className="pr-2">{e.contractionsPer10 ?? "—"}{e.contractionDuration ? ` (${e.contractionDuration}s)` : ""}</td>
                        <td className={`pr-2 ${e.fetalHeartRate != null && (e.fetalHeartRate < 110 || e.fetalHeartRate > 160) ? "font-bold text-red-600" : ""}`}>{e.fetalHeartRate ?? "—"}</td>
                        <td className="pr-2">{e.amnioticFluid ? FLUID_LABELS[e.amnioticFluid] : "—"}</td>
                        <td className="pr-2">{e.maternalPulse ?? "—"}</td>
                        <td className="pr-2">{e.systolicBp != null ? `${e.systolicBp}/${e.diastolicBp ?? "?"}` : "—"}</td>
                        <td className="pr-2">{e.temperature ?? "—"}</td>
                        <td>{[e.oxytocin && `Ocytocine : ${e.oxytocin}`, e.drugs, e.notes].filter(Boolean).join(" • ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
