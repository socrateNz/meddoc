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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { changeInvoiceStatus } from "@/actions/finance";
import { toast } from "sonner";

interface EditInvoiceStatusDialogProps {
  pendingInvoice: {
    id: string;
    status: string;
    amountPaid?: number;
    invoiceTotalAmount?: number;
    patient?: any;
    customPatientName?: string;
  };
  onSuccess?: () => void;
  triggerBtn?: React.ReactNode;
}

const STATUS_LABELS: Record<string, { label: string; desc: string }> = {
  PENDING: { label: "Non payé (PENDING)", desc: "Le ticket repasse en attente de paiement complet." },
  PARTIAL: { label: "Payé partiellement (PARTIAL)", desc: "Le ticket garde un solde restant dû." },
  PAID: { label: "Payé (PAID)", desc: "Le ticket est marqué comme intégralement réglé." },
  CANCELLED: { label: "Annulé / Clôturé (CANCELLED)", desc: "Le solde restant du ticket est abandonné." },
};

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

export function EditInvoiceStatusDialog({
  pendingInvoice,
  onSuccess,
  triggerBtn,
}: EditInvoiceStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<"PENDING" | "PARTIAL" | "PAID" | "CANCELLED">(
    (pendingInvoice.status as any) || "PENDING"
  );
  const [withdrawPayments, setWithdrawPayments] = useState<boolean>(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ticketNum = String(pendingInvoice.id).slice(-6).toUpperCase();
  const patientName = pendingInvoice.patient?.user
    ? `${pendingInvoice.patient.user.lastName} ${pendingInvoice.patient.user.firstName}`
    : pendingInvoice.customPatientName || "Client comptant";

  const handleStatusChange = (status: "PENDING" | "PARTIAL" | "PAID" | "CANCELLED") => {
    setNewStatus(status);
    if (status === "PENDING") {
      setWithdrawPayments(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStatus === pendingInvoice.status && !withdrawPayments) {
      toast.info("Aucun changement détecté.");
      setOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      const res = await changeInvoiceStatus({
        pendingInvoiceId: pendingInvoice.id,
        newStatus,
        withdrawPayments,
        reason: reason.trim() || undefined,
      });

      if (res.success) {
        toast.success("Statut du ticket mis à jour avec succès.");
        setOpen(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.error || "Erreur lors du changement de statut.");
      }
    } catch (err: any) {
      toast.error(err.message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerBtn ? (
        <DialogTrigger render={triggerBtn as any}>{triggerBtn}</DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs rounded-xl border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20" />}>
          <RotateCcw className="h-3.5 w-3.5" />
          Rectifier le statut
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[480px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
            Rectifier le statut du ticket #{ticketNum}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Réservé aux coordonnateurs. Permet de corriger une erreur de saisie ou d&apos;encaissement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Diagnostic Info Card */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
            <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200">
              <span>Patient/Client: {patientName}</span>
              <span>Statut actuel: {pendingInvoice.status}</span>
            </div>
            {pendingInvoice.amountPaid != null && (
              <div className="flex justify-between text-slate-500">
                <span>Déjà encaissé: {formatFCFA(pendingInvoice.amountPaid)}</span>
                {pendingInvoice.invoiceTotalAmount != null && (
                  <span>Total ticket: {formatFCFA(pendingInvoice.invoiceTotalAmount)}</span>
                )}
              </div>
            )}
          </div>

          {/* New Status Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Nouveau statut souhaité
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {(["PENDING", "PARTIAL", "PAID", "CANCELLED"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleStatusChange(st)}
                  className={`text-left p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                    newStatus === st
                      ? "border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white font-semibold"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="font-bold">{STATUS_LABELS[st].label}</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">{STATUS_LABELS[st].desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Withdraw Payments Option */}
          <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="withdraw-payments"
                checked={withdrawPayments}
                onCheckedChange={(c) => setWithdrawPayments(!!c)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="withdraw-payments" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  Annuler et retirer les encaissements enregistrés du solde
                </Label>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                  Si cette case est cochée, toutes les transactions financières d&apos;encaissement liées à ce ticket seront supprimées. L&apos;argent sera déduit du solde de caisse et du bilan financier.
                </p>
              </div>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Motif de la rectification (optionnel)
            </Label>
            <Textarea
              placeholder="Ex: Erreur de saisie par le caissier, ticket enregistré comme payé par inadvertance..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs rounded-xl resize-none h-16"
            />
          </div>

          {withdrawPayments && (
            <div className="flex items-center gap-2 p-2.5 text-xs rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Le montant encaissé sur ce ticket sera déduit du solde de caisse actif.
              </span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-xl text-xs"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-xl text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                "Valider la rectification"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
