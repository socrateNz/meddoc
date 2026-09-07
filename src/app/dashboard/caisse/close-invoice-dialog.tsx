"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { XCircle, Loader2 } from "lucide-react";
import { closeUnpaidInvoice } from "@/actions/finance";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface CloseInvoiceDialogProps {
  pendingInvoice: {
    id: string;
    invoiceTotalAmount: number;
    amountPaid: number;
    patient?: { user?: { firstName: string; lastName: string } } | null;
    customPatientName?: string | null;
    customPatientPhone?: string | null;
    cartLines?: { index: number; description: string; quantity: number; dispensedQuantity: number; remainingQuantity: number }[];
    labLines?: { description: string; quantity: number }[];
    labConsumablesDispensedAt?: string | Date | null;
  };
  // Volontairement sans argument : contrairement à un paiement, une clôture ne produit aucun
  // reçu/transaction à afficher — appeler onSuccess(res.data) exposerait le PendingInvoice brut
  // à un composant appelant qui l'interpréterait à tort comme une transaction à imprimer.
  onSuccess: () => void;
}

// Clôture un ticket à crédit/acompte dont on sait qu'il ne sera jamais réglé intégralement.
// Ne demande AUCUNE saisie de quantité : le récapitulatif donné/commandé ci-dessous est déjà
// connu via les remises partielles enregistrées côté pharmacie (items[].dispensedQuantity) — la
// caisse ne fait que confirmer la clôture. Rien n'est retourné en stock (ce qui n'a jamais été
// remis n'a jamais quitté le stock) et aucune nouvelle écriture financière n'est créée (l'argent
// déjà encaissé reste acquis tel quel).
export default function CloseInvoiceDialog({ pendingInvoice, onSuccess }: CloseInvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const patientName = pendingInvoice.patient?.user
    ? `${pendingInvoice.patient.user.lastName} ${pendingInvoice.patient.user.firstName}`
    : (pendingInvoice.customPatientName || "Client comptant");

  const remainingDue = Math.max(0, pendingInvoice.invoiceTotalAmount - pendingInvoice.amountPaid);
  const cartLines = pendingInvoice.cartLines || [];
  const labLines = pendingInvoice.labLines || [];

  const handleSubmit = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await closeUnpaidInvoice(pendingInvoice.id);
      if (res.success) {
        setOpen(false);
        onSuccess();
      } else {
        setMsg(res.error || "Erreur lors de la clôture du ticket.");
      }
    } catch (err: any) {
      setMsg(err.message || "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMsg(null); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-xs h-8 border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800" />}>
        <XCircle className="h-3.5 w-3.5" />
        Clôturer
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-700 dark:text-slate-300">
            <XCircle className="h-5 w-5" />
            Clôturer ce ticket non réglé
          </DialogTitle>
          <DialogDescription>
            {patientName} — cette action est définitive : le ticket ne sera plus proposé au règlement.
          </DialogDescription>
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
              <p className="text-[10px] font-bold uppercase text-emerald-600">Déjà réglé (reste acquis)</p>
              <p className="text-sm font-extrabold mt-1 text-emerald-700 dark:text-emerald-400">{formatFCFA(pendingInvoice.amountPaid)}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 col-span-2">
              <p className="text-[10px] font-bold uppercase text-amber-600">Solde abandonné</p>
              <p className="text-sm font-extrabold mt-1 text-amber-700 dark:text-amber-400">{formatFCFA(remainingDue)}</p>
            </div>
          </div>

          {(cartLines.length > 0 || labLines.length > 0) && (
            <div className="rounded-xl border border-slate-100 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
              <p className="p-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/60 dark:bg-slate-800/30">
                Déjà remis en pharmacie (le reste retourne simplement en stock, rien à faire)
              </p>
              {cartLines.length === 0 ? (
                <p className="p-3 text-xs text-slate-400">Aucun médicament remis pour le moment.</p>
              ) : (
                cartLines.map((line) => (
                  <div key={line.index} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{line.description}</span>
                    <span className="font-bold text-slate-500 shrink-0">{line.dispensedQuantity} / {line.quantity} remis</span>
                  </div>
                ))
              )}
              {labLines.length > 0 && (
                <div className="px-3 py-2 text-xs text-slate-400">
                  Consommables labo : {pendingInvoice.labConsumablesDispensedAt ? "déjà remis" : "non remis"}
                </div>
              )}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={loading} variant="outline" className="w-full rounded-xl py-2.5 font-bold text-sm border-slate-300 dark:border-slate-700">
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Clôture...</>
            ) : (
              <><XCircle className="h-4 w-4 mr-2" />Confirmer la clôture</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
