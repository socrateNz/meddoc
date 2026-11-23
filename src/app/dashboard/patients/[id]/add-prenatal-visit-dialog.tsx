"use client";

import SearchSelect from "@/components/ui/search-select";
import { useSubmitGuard } from "@/hooks/use-submit-guard";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Stethoscope } from "lucide-react";
import { addPrenatalVisit } from "@/actions/maternity";
import { FETAL_PRESENTATION_LABELS, PREVENTIVE_TREATMENT_LABELS, URINE_DIPSTICK_OPTIONS } from "@/lib/maternity-labels";
import { toast } from "sonner";

// Champs 16 px sur mobile (pas de zoom iOS), plus hauts pour le doigt.
const FIELD = "h-11 rounded-xl text-base sm:h-9 sm:text-sm";
const SELECT = "h-11 w-full rounded-xl border border-input bg-background px-3 text-base sm:h-9 sm:text-sm";

// Choix Oui / Non / non renseigné.
function YesNo({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <SearchSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
      <option value="">—</option>
      <option value="yes">Oui</option>
      <option value="no">Non</option>
    </SearchSelect>
  );
}

export default function AddPrenatalVisitDialog({ pregnancyId, nextCpnNumber }: { pregnancyId: string; nextCpnNumber?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { submitting: loading, guard } = useSubmitGuard();
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [cpnNumber, setCpnNumber] = useState(nextCpnNumber ? String(nextCpnNumber) : "");
  const [gestationalWeeks, setGestationalWeeks] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [fundalHeightCm, setFundalHeightCm] = useState("");
  const [fetalHeartRateBpm, setFetalHeartRateBpm] = useState("");
  const [fetalPresentation, setFetalPresentation] = useState("");
  const [fetalMovements, setFetalMovements] = useState("");
  const [edema, setEdema] = useState("");
  const [urineProtein, setUrineProtein] = useState("");
  const [urineGlucose, setUrineGlucose] = useState("");
  const [treatments, setTreatments] = useState<string[]>([]);
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [notes, setNotes] = useState("");

  const toggleTreatment = (t: string) => setTreatments((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const yesNo = (v: string) => (v === "yes" ? true : v === "no" ? false : undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await guard((idempotencyKey) => addPrenatalVisit({
        pregnancyId,
        visitDate: visitDate || undefined,
        cpnNumber: cpnNumber ? Number(cpnNumber) : undefined,
        gestationalWeeks: gestationalWeeks ? Number(gestationalWeeks) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        bloodPressureSystolic: bpSystolic ? Number(bpSystolic) : undefined,
        bloodPressureDiastolic: bpDiastolic ? Number(bpDiastolic) : undefined,
        fundalHeightCm: fundalHeightCm ? Number(fundalHeightCm) : undefined,
        fetalHeartRateBpm: fetalHeartRateBpm ? Number(fetalHeartRateBpm) : undefined,
        fetalPresentation: fetalPresentation || undefined,
        fetalMovements: yesNo(fetalMovements),
        edema: yesNo(edema),
        urineProtein: urineProtein || undefined,
        urineGlucose: urineGlucose || undefined,
        preventiveTreatments: treatments,
        nextVisitDate: nextVisitDate || undefined,
        notes: notes || undefined,
        idempotencyKey,
      }));
      if (!res) return;
      if (res.success) {
        toast.success("Visite prénatale enregistrée. Vous pouvez demander les examens depuis la visite.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl" />}>
        <Plus className="h-3.5 w-3.5" />Visite prénatale
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-[560px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Stethoscope className="h-5 w-5 text-pink-500" />
            Nouvelle visite prénatale (CPN)
          </DialogTitle>
          <DialogDescription>Tous les champs cliniques sont optionnels — renseignez ce qui a été mesuré.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pv-date">Date</Label>
              <Input id="pv-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className={FIELD} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-cpn">N° de CPN</Label>
              <Input id="pv-cpn" type="number" min="1" inputMode="numeric" value={cpnNumber} onChange={(e) => setCpnNumber(e.target.value)} className={FIELD} />
            </div>
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="pv-sa">Âge gestationnel (SA)</Label>
              <Input id="pv-sa" type="number" min="0" inputMode="numeric" value={gestationalWeeks} onChange={(e) => setGestationalWeeks(e.target.value)} className={FIELD} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Mère</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-weight">Poids (kg)</Label>
                <Input id="pv-weight" type="number" step="0.1" min="0" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className={FIELD} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-sys">TA sys.</Label>
                <Input id="pv-sys" type="number" min="0" inputMode="numeric" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} className={FIELD} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-dia">TA dia.</Label>
                <Input id="pv-dia" type="number" min="0" inputMode="numeric" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} className={FIELD} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-edema">Œdèmes</Label>
                <YesNo id="pv-edema" value={edema} onChange={setEdema} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-prot">Albumine (BU)</Label>
                <SearchSelect id="pv-prot" value={urineProtein} onChange={(e) => setUrineProtein(e.target.value)} className={SELECT}>
                  <option value="">—</option>
                  {URINE_DIPSTICK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SearchSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-glu">Sucre (BU)</Label>
                <SearchSelect id="pv-glu" value={urineGlucose} onChange={(e) => setUrineGlucose(e.target.value)} className={SELECT}>
                  <option value="">—</option>
                  {URINE_DIPSTICK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SearchSelect>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Fœtus</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-hu">Hauteur utérine (cm)</Label>
                <Input id="pv-hu" type="number" step="0.1" min="0" inputMode="decimal" value={fundalHeightCm} onChange={(e) => setFundalHeightCm(e.target.value)} className={FIELD} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-bcf">BCF (bpm)</Label>
                <Input id="pv-bcf" type="number" min="0" inputMode="numeric" value={fetalHeartRateBpm} onChange={(e) => setFetalHeartRateBpm(e.target.value)} className={FIELD} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-pres">Présentation</Label>
                <SearchSelect id="pv-pres" value={fetalPresentation} onChange={(e) => setFetalPresentation(e.target.value)} className={SELECT}>
                  <option value="">—</option>
                  {Object.entries(FETAL_PRESENTATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </SearchSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-maf">Mouvements actifs</Label>
                <YesNo id="pv-maf" value={fetalMovements} onChange={setFetalMovements} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Traitements préventifs donnés</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(PREVENTIVE_TREATMENT_LABELS).map(([value, label]) => {
                const checked = treatments.includes(value);
                return (
                  <label key={value} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${checked ? "border-pink-500/40 bg-pink-500/5" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTreatment(value)} className="h-5 w-5 accent-pink-600 sm:h-4 sm:w-4" />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="pv-next">Prochain rendez-vous</Label>
            <Input id="pv-next" type="date" value={nextVisitDate} onChange={(e) => setNextVisitDate(e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pv-notes">Notes</Label>
            <Textarea id="pv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-xl text-base sm:text-sm" placeholder="Plaintes, conseils donnés, conduite à tenir..." />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-11 rounded-xl sm:h-9">Annuler</Button>
            <Button type="submit" disabled={loading} className="h-12 gap-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white sm:h-9">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
              Enregistrer la visite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
