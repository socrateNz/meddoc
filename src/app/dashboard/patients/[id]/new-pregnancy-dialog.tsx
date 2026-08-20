"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Baby, Loader2, Plus, X } from "lucide-react";
import { createPregnancy } from "@/actions/maternity";
import { toast } from "sonner";

function addDays(dateStr: string, days: number) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function NewPregnancyDialog({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastMenstrualPeriod, setLastMenstrualPeriod] = useState("");
  const [expectedDueDate, setExpectedDueDate] = useState("");
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [gravidity, setGravidity] = useState("1");
  const [parity, setParity] = useState("0");
  const [riskFactorInput, setRiskFactorInput] = useState("");
  const [riskFactors, setRiskFactors] = useState<string[]>([]);

  const handleLmpChange = (value: string) => {
    setLastMenstrualPeriod(value);
    if (!dueDateTouched) setExpectedDueDate(addDays(value, 280));
  };

  const handleAddRiskFactor = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && riskFactorInput.trim()) {
      e.preventDefault();
      if (!riskFactors.includes(riskFactorInput.trim())) setRiskFactors([...riskFactors, riskFactorInput.trim()]);
      setRiskFactorInput("");
    }
  };

  const handleRemoveRiskFactor = (idx: number) => setRiskFactors(riskFactors.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastMenstrualPeriod || !expectedDueDate) {
      toast.error("La date des dernières règles et la date prévue d'accouchement sont requises.");
      return;
    }
    setLoading(true);
    try {
      const res = await createPregnancy({
        patientId,
        lastMenstrualPeriod,
        expectedDueDate,
        gravidity: Number(gravidity) || 1,
        parity: Number(parity) || 0,
        riskFactors,
      });
      if (res.success) {
        toast.success("Grossesse enregistrée.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl shadow-xs" />}>
        <Plus className="h-4 w-4" />Nouvelle grossesse
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-pink-600 dark:text-pink-400">
            <Baby className="h-5 w-5" />
            Nouvelle grossesse
          </DialogTitle>
          <DialogDescription>
            La date prévue d&apos;accouchement est suggérée à partir des dernières règles (DDR + 280 jours) — modifiable.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dernières règles (DDR) *</Label>
              <Input type="date" required value={lastMenstrualPeriod} onChange={(e) => handleLmpChange(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Terme prévu (DPA) *</Label>
              <Input
                type="date"
                required
                value={expectedDueDate}
                onChange={(e) => {
                  setExpectedDueDate(e.target.value);
                  setDueDateTouched(true);
                }}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gravidité (G)</Label>
              <Input type="number" min="1" value={gravidity} onChange={(e) => setGravidity(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Parité (P)</Label>
              <Input type="number" min="0" value={parity} onChange={(e) => setParity(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Facteurs de risque (Appuyez sur Entrée pour ajouter)</Label>
            <Input
              placeholder="Ex: Hypertension, Diabète gestationnel"
              value={riskFactorInput}
              onChange={(e) => setRiskFactorInput(e.target.value)}
              onKeyDown={handleAddRiskFactor}
              className="rounded-xl"
            />
            {riskFactors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {riskFactors.map((factor, idx) => (
                  <Badge key={idx} variant="outline" className="gap-1 pr-1.5 py-0.5 border-amber-500/30 text-amber-600 bg-amber-500/5">
                    {factor}
                    <button type="button" onClick={() => handleRemoveRiskFactor(idx)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Baby className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
