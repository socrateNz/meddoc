"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Receipt, Loader2, Printer } from "lucide-react";
import { payPendingInvoice } from "@/actions/finance";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface RecordPaymentDialogProps {
  cashSessionId: string;
  pendingInvoice: {
    id: string;
    invoiceTotalAmount: number;
    amountPaid: number;
    patient?: { user?: { firstName: string; lastName: string } } | null;
  };
  onSuccess: (transaction: any) => void;
}

// Ajoute une tranche sur une facture déjà PARTIAL — le panier est verrouillé depuis le premier
// règlement (cf. payPendingInvoice), seul le montant de CE paiement reste à saisir.
export default function RecordPaymentDialog({ cashSessionId, pendingInvoice, onSuccess }: RecordPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const remainingDue = Math.max(0, pendingInvoice.invoiceTotalAmount - pendingInvoice.amountPaid);
  const [amountInput, setAmountInput] = useState(String(remainingDue));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const patientName = pendingInvoice.patient?.user
    ? `${pendingInvoice.patient.user.lastName} ${pendingInvoice.patient.user.firstName}`
    : "Client comptant";

  const amount = Math.min(remainingDue, Math.max(0, Number(amountInput) || 0));

  const handleSubmit = async () => {
    if (amount <= 0) {
      setMsg("Indiquez un montant supérieur à 0.");
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await payPendingInvoice(pendingInvoice.id, cashSessionId, amount);
      if (res.success) {
        setOpen(false);
        const txn = (res.data as any)?.transaction || res.data;
        const pendingInvoiceId = (res.data as any)?.pendingInvoice?.id;
        if (pendingInvoiceId) (txn as any).pendingInvoiceId = pendingInvoiceId;
        (txn as any).invoiceTotalAmount = (res.data as any)?.invoiceTotalAmount;
        (txn as any).remainingDue = (res.data as any)?.remainingDue;
        onSuccess(txn);
        setAmountInput(String(remainingDue));
      } else {
        setMsg(res.error || "Erreur lors de l'encaissement.");
      }
    } catch (err: any) {
      setMsg(err.message || "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMsg(null); }}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs h-8" />}>
        <Receipt className="h-3.5 w-3.5" />
        Régler un paiement
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-blue-600 dark:text-blue-400">
            <Receipt className="h-5 w-5" />
            Nouveau règlement
          </DialogTitle>
          <DialogDescription>{patientName} — paiement échelonné</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {msg && (
            <div className="p-3 text-xs font-medium rounded-xl border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30">
              {msg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
              <p className="text-[10px] font-bold uppercase text-slate-400">Total facture</p>
              <p className="text-sm font-extrabold mt-1">{formatFCFA(pendingInvoice.invoiceTotalAmount)}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
              <p className="text-[10px] font-bold uppercase text-emerald-600">Déjà réglé</p>
              <p className="text-sm font-extrabold mt-1 text-emerald-700 dark:text-emerald-400">{formatFCFA(pendingInvoice.amountPaid)}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 col-span-2">
              <p className="text-[10px] font-bold uppercase text-amber-600">Reste à payer</p>
              <p className="text-sm font-extrabold mt-1 text-amber-700 dark:text-amber-400">{formatFCFA(remainingDue)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paymentAmount" className="text-xs">Montant reçu maintenant</Label>
            <Input
              id="paymentAmount"
              type="number"
              min="1"
              max={remainingDue}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="h-10 text-sm font-bold rounded-xl"
              autoFocus
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading || amount <= 0} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-bold shadow-xs text-sm">
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Encaissement...</>
            ) : (
              <><Printer className="h-4 w-4 mr-2" />Encaisser & imprimer le ticket ({formatFCFA(amount)})</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
