"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Stethoscope } from "lucide-react";
import { addPrenatalVisit } from "@/actions/maternity";
import { toast } from "sonner";

export default function AddPrenatalVisitDialog({ pregnancyId }: { pregnancyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [gestationalWeeks, setGestationalWeeks] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [fundalHeightCm, setFundalHeightCm] = useState("");
  const [fetalHeartRateBpm, setFetalHeartRateBpm] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await addPrenatalVisit({
        pregnancyId,
        visitDate: visitDate || undefined,
        gestationalWeeks: gestationalWeeks ? Number(gestationalWeeks) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        bloodPressureSystolic: bpSystolic ? Number(bpSystolic) : undefined,
        bloodPressureDiastolic: bpDiastolic ? Number(bpDiastolic) : undefined,
        fundalHeightCm: fundalHeightCm ? Number(fundalHeightCm) : undefined,
        fetalHeartRateBpm: fetalHeartRateBpm ? Number(fetalHeartRateBpm) : undefined,
        notes: notes || undefined,
      });
      if (res.success) {
        toast.success("Visite prénatale enregistrée.");
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
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5 rounded-xl" />}>
        <Plus className="h-3.5 w-3.5" />Visite prénatale
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Stethoscope className="h-5 w-5 text-pink-500" />
            Nouvelle visite prénatale
          </DialogTitle>
          <DialogDescription>Tous les champs cliniques sont optionnels — renseignez ce qui a été mesuré.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date de la visite</Label>
              <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Âge gestationnel (semaines)</Label>
              <Input type="number" min="0" value={gestationalWeeks} onChange={(e) => setGestationalWeeks(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Poids (kg)</Label>
              <Input type="number" step="0.1" min="0" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>TA systolique</Label>
              <Input type="number" min="0" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>TA diastolique</Label>
              <Input type="number" min="0" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hauteur utérine (cm)</Label>
              <Input type="number" step="0.1" min="0" value={fundalHeightCm} onChange={(e) => setFundalHeightCm(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>BCF (bpm)</Label>
              <Input type="number" min="0" value={fetalHeartRateBpm} onChange={(e) => setFetalHeartRateBpm(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-xl" placeholder="Observations complémentaires..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
