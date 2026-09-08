"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { deletePendingInvoice } from "@/actions/finance";
import { toast } from "sonner";

interface DeleteInvoiceDialogProps {
  pendingInvoice: {
    id: string;
    amountPaid?: number;
    invoiceTotalAmount?: number;
    patient?: any;
    customPatientName?: string;
  };
  onSuccess?: () => void;
  triggerBtn?: React.ReactNode;
}

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

export function DeleteInvoiceDialog({
  pendingInvoice,
  onSuccess,
  triggerBtn,
}: DeleteInvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ticketNum = String(pendingInvoice.id).slice(-6).toUpperCase();
  const patientName = pendingInvoice.patient?.user
    ? `${pendingInvoice.patient.user.lastName} ${pendingInvoice.patient.user.firstName}`
    : pendingInvoice.customPatientName || "Client comptant";

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await deletePendingInvoice({
        pendingInvoiceId: pendingInvoice.id,
        reason: reason.trim() || undefined,
      });

      if (res.success) {
        toast.success("Ticket supprimé avec succès.");
        setOpen(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.error || "Erreur lors de la suppression du ticket.");
      }
    } catch (err: any) {
      toast.error(err.message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerBtn || (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700"
            title="Supprimer ce ticket (Option temporaire)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Supprimer (Temp)</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleDelete}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-bold text-rose-600 dark:text-rose-400">
                Supprimer le ticket (Temporaire)
              </DialogTitle>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-full border border-rose-200 dark:border-rose-800">
                ADMIN / COORD
              </span>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Ticket #{ticketNum} — {patientName}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Warning Alert */}
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-rose-900 dark:text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                Attention : Action irréversible
              </div>
              <p className="leading-relaxed">
                Ce bouton de suppression temporaire retirera définitivement ce ticket ainsi que tous ses règlements enregistrés. Les montants encaissés seront automatiquement déduits du solde de caisse.
              </p>
              {Number(pendingInvoice.amountPaid || 0) > 0 && (
                <p className="font-semibold text-rose-900 dark:text-rose-200">
                  Montant encaissé qui sera déduit de la caisse : {formatFCFA(pendingInvoice.amountPaid!)}
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Motif de la suppression (Optionnel)
              </Label>
              <Textarea
                id="delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Erreur de saisie doublon, annulation exceptionnelle..."
                className="text-xs min-h-[70px] resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="text-xs"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={submitting}
              className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Suppression en cours...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirmer la suppression
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
