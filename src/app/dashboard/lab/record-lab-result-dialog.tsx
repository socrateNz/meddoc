"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ClipboardCheck } from "lucide-react";
import { recordLabResult } from "@/actions/lab";
import { toast } from "sonner";

interface RecordLabResultDialogProps {
  labOrder: { id: string; tests: string[] };
  onSuccess?: (result: any) => void;
}

export default function RecordLabResultDialog({ labOrder, onSuccess }: RecordLabResultDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testName, setTestName] = useState(labOrder.tests[0] || "");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [referenceRange, setReferenceRange] = useState("");
  const [isAbnormal, setIsAbnormal] = useState(false);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setTestName(labOrder.tests[0] || "");
    setValue("");
    setUnit("");
    setReferenceRange("");
    setIsAbnormal(false);
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testName.trim() || !value.trim()) {
      toast.error("Veuillez indiquer l'analyse et la valeur du résultat.");
      return;
    }

    setLoading(true);
    try {
      const res = await recordLabResult({
        labOrderId: labOrder.id,
        testName: testName.trim(),
        value: value.trim(),
        unit: unit.trim() || undefined,
        referenceRange: referenceRange.trim() || undefined,
        isAbnormal,
        notes: notes.trim() || undefined,
      });
      if (res.success) {
        toast.success("Résultat enregistré.");
        setOpen(false);
        resetForm();
        onSuccess?.(res.data);
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement du résultat.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-xs h-8" />}>
        <ClipboardCheck className="h-3.5 w-3.5" />
        Résultat
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            Enregistrer un résultat
          </DialogTitle>
          <DialogDescription>
            Saisissez le résultat d&apos;une des analyses demandées.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Analyse *</Label>
            {labOrder.tests.length > 0 ? (
              <select
                required
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                className="w-full h-9 px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {labOrder.tests.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <Input required value={testName} onChange={(e) => setTestName(e.target.value)} className="rounded-xl" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valeur *</Label>
              <Input required value={value} onChange={(e) => setValue(e.target.value)} placeholder="ex: 13.2" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Unité</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ex: g/dL" className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Valeurs de référence (optionnel)</Label>
            <Input value={referenceRange} onChange={(e) => setReferenceRange(e.target.value)} placeholder="ex: 12 - 16" className="rounded-xl" />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="isAbnormal" checked={isAbnormal} onCheckedChange={(c) => setIsAbnormal(c === true)} />
            <Label htmlFor="isAbnormal" className="text-sm font-normal cursor-pointer">Résultat anormal / à signaler</Label>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optionnel)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commentaire du laboratoire" className="rounded-xl" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
