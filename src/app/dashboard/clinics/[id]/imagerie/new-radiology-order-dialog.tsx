"use client";

import { useEffect, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createRadiologyOrder, listRadiologyExams } from "@/actions/radiology";
import { RADIOLOGY_MODALITY_LABELS, type RadiologyModality } from "@/lib/radiology";

type Exam = { id: string; name: string; modality: string; basePrice: number };

function formatFCFA(v: number) {
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

// Prescription d'examens d'imagerie depuis le catalogue de la clinique du patient — facture créée
// à la caisse dès la prescription (cf. createRadiologyOrder).
export default function NewRadiologyOrderDialog({ patientId, clinicId, onCreated }: { patientId: string; clinicId: string; onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [indication, setIndication] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listRadiologyExams(clinicId).then((res) => {
      if (!cancelled) setExams(res.success ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clinicId]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const total = (exams || []).filter((e) => selected.includes(e.id)).reduce((sum, e) => sum + e.basePrice, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) {
      toast.error("Sélectionnez au moins un examen.");
      return;
    }
    setSaving(true);
    const res = await createRadiologyOrder({
      patientId,
      examIds: selected,
      clinicalIndication: indication.trim() || undefined,
      priority: urgent ? "URGENT" : "ROUTINE",
    });
    setSaving(false);
    if (res.success) {
      toast.success(res.data.invoiceCreated ? "Examen prescrit — facture disponible à la caisse." : "Examen prescrit.");
      setOpen(false);
      setSelected([]);
      setIndication("");
      setUrgent(false);
      onCreated?.();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white" />}>
        <ScanLine className="h-4 w-4" />
        Prescrire une imagerie
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Prescrire un examen d&apos;imagerie</DialogTitle>
          <DialogDescription>Les examens sont facturés à la caisse dès la prescription, au tarif du catalogue.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Examens *</Label>
            {exams === null ? (
              <p className="text-xs text-muted-foreground">Chargement du catalogue...</p>
            ) : exams.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun examen au catalogue d&apos;imagerie de cette clinique (à créer par le coordinateur).</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                {exams.map((exam) => (
                  <label key={exam.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <input type="checkbox" checked={selected.includes(exam.id)} onChange={() => toggle(exam.id)} className="h-4 w-4" />
                    <span className="flex-1 text-sm">
                      {exam.name}
                      <span className="ml-2 text-[11px] text-muted-foreground">{RADIOLOGY_MODALITY_LABELS[exam.modality as RadiologyModality] || exam.modality}</span>
                    </span>
                    <span className="text-xs font-semibold">{formatFCFA(exam.basePrice)}</span>
                  </label>
                ))}
              </div>
            )}
            {selected.length > 0 && <p className="text-xs text-right font-semibold">Total : {formatFCFA(total)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="indication">Indication clinique</Label>
            <Textarea id="indication" rows={3} value={indication} onChange={(e) => setIndication(e.target.value)} placeholder="Contexte, question posée au radiologue..." maxLength={1000} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4 accent-red-600" />
            <span className={urgent ? "text-red-600" : ""}>Urgent</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={saving || selected.length === 0} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              Prescrire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
