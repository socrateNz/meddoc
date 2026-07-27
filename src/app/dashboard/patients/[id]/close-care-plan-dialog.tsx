"use client";

import { useState } from "react";
import { CheckCircle2, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { closeCarePlan } from "@/actions/careplans";
import { toast } from "sonner";

interface CloseCarePlanDialogProps {
  carePlanId: string;
  patientId: string;
  patientName: string;
}

export default function CloseCarePlanDialog({
  carePlanId,
  patientId,
  patientName,
}: CloseCarePlanDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dischargeSummary, setDischargeSummary] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dischargeSummary.trim()) {
      toast.error("Veuillez saisir un résumé / bilan de fin de traitement.");
      return;
    }

    setLoading(true);

    const res = await closeCarePlan(carePlanId, patientId, dischargeSummary);

    setLoading(false);
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success("Les soins du patient ont été clôturés avec succès (Sortie effectuée).");
      setOpen(false);
      setDischargeSummary("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 border-slate-400/30 text-slate-700 dark:text-slate-300 hover:bg-slate-500/10" />}>
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Clôturer les soins (Sortie)
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Clôturer le traitement de {patientName}
          </DialogTitle>
          <DialogDescription>
            Rédigez le bilan de fin de soins / résumé de sortie du patient. Le dossier passera au statut &quot;Soins terminés&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="summary">Résumé de sortie & Bilan médical final *</Label>
            <Textarea
              id="summary"
              rows={4}
              required
              placeholder="Évolution favorable. Rétablissement complet du patient. Recommandations de suivi à domicile..."
              value={dischargeSummary}
              onChange={(e) => setDischargeSummary(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? "Clôture en cours..." : "Confirmer la sortie & clôturer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
