"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileCheck } from "lucide-react";
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
import PDFDownloadButton from "@/components/pdf/pdf-download-button";
import type { DischargeBulletin } from "@/components/pdf/discharge-pdf";
import { toast } from "sonner";

interface CloseCarePlanDialogProps {
  carePlanId: string;
  patientId: string;
  patientName: string;
}

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

// Protocole de sortie (cf. closeCarePlan) : compte-rendu obligatoire ; pour un patient hospitalisé,
// les nuitées sont facturées et un reste à payer bloque la sortie — sauf validation motivée d'un
// coordinateur. Une fois la sortie faite, le bulletin de sortie est téléchargeable.
export default function CloseCarePlanDialog({ carePlanId, patientId, patientName }: CloseCarePlanDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [blocked, setBlocked] = useState<{ outstanding: number; canForce: boolean; message: string } | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [bulletin, setBulletin] = useState<DischargeBulletin | null>(null);

  const reset = () => {
    setDischargeSummary("");
    setBlocked(null);
    setForceReason("");
    setBulletin(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      if (bulletin) router.refresh();
      reset();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dischargeSummary.trim()) {
      toast.error("Veuillez saisir le compte-rendu de sortie.");
      return;
    }
    if (blocked?.canForce && !forceReason.trim()) {
      toast.error("Indiquez le motif de la sortie sans règlement complet.");
      return;
    }

    setLoading(true);
    const res = await closeCarePlan(carePlanId, patientId, dischargeSummary, {
      forceReason: blocked?.canForce ? forceReason : undefined,
    });
    setLoading(false);

    if (res.success) {
      toast.success("Sortie effectuée : les soins du patient sont clôturés.");
      setBlocked(null);
      setBulletin(res.bulletin as DischargeBulletin);
    } else if ("blocked" in res && res.blocked) {
      setBlocked({ outstanding: res.outstanding, canForce: res.canForce, message: res.error });
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 border-slate-400/30 text-slate-700 dark:text-slate-300 hover:bg-slate-500/10" />}>
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Clôturer les soins (Sortie)
      </DialogTrigger>
      <DialogContent className="sm:max-w-130">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Sortie de {patientName}
          </DialogTitle>
          <DialogDescription>
            Rédigez le compte-rendu de sortie. Pour un patient hospitalisé, les nuitées sont facturées à la caisse et le reste à payer est contrôlé.
          </DialogDescription>
        </DialogHeader>

        {bulletin ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p>
                Sortie enregistrée.
                {bulletin.outstanding > 0 ? ` Reste à payer au moment de la sortie : ${formatFCFA(bulletin.outstanding)}.` : " Compte soldé."}
              </p>
            </div>
            <DialogFooter className="pt-2">
              <PDFDownloadButton
                documentName={`bulletin_sortie_${patientName}`}
                type="discharge"
                data={{ bulletin }}
                buttonText="Télécharger le bulletin de sortie"
                variant="default"
                size="default"
              />
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Fermer
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="summary">Compte-rendu de sortie & bilan médical final *</Label>
              <Textarea
                id="summary"
                rows={4}
                required
                placeholder="Évolution favorable. Rétablissement complet du patient. Recommandations de suivi à domicile..."
                value={dischargeSummary}
                onChange={(e) => setDischargeSummary(e.target.value)}
              />
            </div>

            {blocked && (
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <p>{blocked.message}</p>
                </div>
                {blocked.canForce && (
                  <div className="space-y-1.5">
                    <Label htmlFor="force-reason" className="text-xs">Motif de la sortie sans règlement complet *</Label>
                    <Textarea
                      id="force-reason"
                      rows={2}
                      placeholder="ex: Prise en charge par l'assurance, règlement convenu avec la famille sous 7 jours..."
                      value={forceReason}
                      onChange={(e) => setForceReason(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {loading
                  ? "Vérification..."
                  : blocked?.canForce
                    ? "Valider la sortie malgré le solde"
                    : blocked
                      ? "Revérifier après règlement"
                      : "Confirmer la sortie & clôturer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
