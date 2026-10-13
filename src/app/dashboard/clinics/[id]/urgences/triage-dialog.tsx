"use client";

import { useState } from "react";
import { Loader2, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { triageVisit } from "@/actions/triage";
import { TRIAGE_LEVELS, TRIAGE_STYLES } from "@/lib/triage";

const VITAL_FIELDS = [
  { key: "bloodPressure", label: "TA (mmHg)", placeholder: "120/80", numeric: false },
  { key: "heartRate", label: "FC (bpm)", placeholder: "80", numeric: true },
  { key: "respiratoryRate", label: "FR (/min)", placeholder: "16", numeric: true },
  { key: "oxygenSaturation", label: "SpO₂ (%)", placeholder: "98", numeric: true },
  { key: "temperature", label: "T° (°C)", placeholder: "37.2", numeric: true },
  { key: "bloodSugar", label: "Glycémie (g/L)", placeholder: "1.05", numeric: true },
  { key: "painScore", label: "Douleur EVA (0-10)", placeholder: "4", numeric: true },
  { key: "glasgow", label: "Glasgow (3-15)", placeholder: "15", numeric: true },
] as const;

type VitalKey = (typeof VITAL_FIELDS)[number]["key"];

// Fiche de tri CIMU : le niveau est choisi par le soignant (la grille est affichée pour guider) ;
// les constantes sont facultatives et alimentent aussi le dossier du patient.
export default function TriageDialog({
  visitId,
  patientName,
  currentLevel,
  defaultComplaint,
  onDone,
}: {
  visitId: string;
  patientName: string;
  currentLevel: number | null;
  defaultComplaint?: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<number | null>(currentLevel);
  const [complaint, setComplaint] = useState(defaultComplaint ?? "");
  const [vitals, setVitals] = useState<Record<VitalKey, string>>({
    bloodPressure: "",
    heartRate: "",
    respiratoryRate: "",
    oxygenSaturation: "",
    temperature: "",
    bloodSugar: "",
    painScore: "",
    glasgow: "",
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!level) {
      toast.error("Choisissez le niveau de tri.");
      return;
    }
    setSaving(true);
    const res = await triageVisit({
      visitId,
      level,
      chiefComplaint: complaint.trim(),
      bloodPressure: vitals.bloodPressure.trim() || undefined,
      heartRate: num(vitals.heartRate),
      respiratoryRate: num(vitals.respiratoryRate),
      oxygenSaturation: num(vitals.oxygenSaturation),
      temperature: num(vitals.temperature),
      bloodSugar: num(vitals.bloodSugar),
      painScore: num(vitals.painScore),
      glasgow: num(vitals.glasgow),
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (res.success) {
      toast.success(`Tri enregistré — niveau ${level}.`);
      setOpen(false);
      onDone();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className={`h-7 gap-1 rounded-lg text-xs ${currentLevel ? "" : "bg-red-600 hover:bg-red-700 text-white"}`} variant={currentLevel ? "outline" : "default"} />}>
        <Siren className="h-3.5 w-3.5" />
        {currentLevel ? "Retrier" : "Trier"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tri — {patientName}</DialogTitle>
          <DialogDescription>Échelle CIMU. Le niveau est une décision du soignant ; le délai cible s&apos;affiche ensuite sur le tableau.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Niveau de tri *</Label>
            <div className="grid gap-1.5">
              {TRIAGE_LEVELS.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  onClick={() => setLevel(l.level)}
                  className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2 text-left transition-all ${level === l.level ? TRIAGE_STYLES[l.level].border + " bg-slate-50 dark:bg-slate-800/50" : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30"}`}
                >
                  <span className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center font-black ${TRIAGE_STYLES[l.level].badge}`}>{l.level}</span>
                  <span className="text-sm">
                    <span className="font-semibold">{l.label}</span>
                    <span className="text-muted-foreground"> — {l.targetMinutes === 0 ? "immédiat" : `< ${l.targetMinutes} min`}</span>
                    <span className="block text-xs text-muted-foreground">{l.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complaint">Motif de recours *</Label>
            <Input id="complaint" required value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="ex: Douleur thoracique depuis 1 h" className="rounded-xl" maxLength={300} />
          </div>

          <div className="space-y-1.5">
            <Label>Constantes</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {VITAL_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">{f.label}</span>
                  <Input
                    inputMode={f.numeric ? "decimal" : "text"}
                    value={vitals[f.key]}
                    onChange={(e) => setVitals((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="h-9 rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="triage-notes">Observations</Label>
            <Textarea id="triage-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !level} className="gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
              Enregistrer le tri
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
