"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { applyInvoiceDiscount } from "@/actions/finance";
import { DiscountNote, LineDiscountEditor } from "./line-discount-editor";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

type Item = { description: string; quantity: number; unitPrice: number; amount: number; discount?: number; discountReason?: string };

// Réduction sur un ticket non encore réglé (examen d'un patient, consultation, ordonnance...) :
// posée par le responsable (« invoices.discount »), le caissier encaisse ensuite le montant réduit.
export default function InvoiceDiscountDialog({
  pendingInvoice,
  patientName,
  onSuccess,
}: {
  pendingInvoice: { id: string; items: Item[] };
  patientName: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>(pendingInvoice.items || []);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const gross = (it: Item) => Math.round(Number(it.quantity) * Number(it.unitPrice)) || Number(it.amount) || 0;
  const total = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const discounted = items.reduce((sum, it) => sum + (Number(it.discount) || 0), 0);

  const save = async (index: number, discount: number, reason: string) => {
    setBusy(true);
    const res = await applyInvoiceDiscount({ pendingInvoiceId: pendingInvoice.id, discounts: [{ index, discount, reason }] });
    setBusy(false);
    if (!res.success) return void toast.error(res.error);
    setItems(res.data.items as Item[]);
    setEditing(null);
    if (res.data.settled) {
      toast.success("Ticket entièrement offert : il est soldé, rien à encaisser.");
      setOpen(false);
    } else {
      toast.success(discount > 0 ? "Réduction appliquée." : "Réduction retirée.");
    }
    onSuccess?.();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setItems(pendingInvoice.items || []);
        setEditing(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg border-violet-200 text-xs text-violet-700 hover:bg-violet-50 dark:border-violet-900/50 dark:text-violet-300" />}>
        <BadgePercent className="h-3.5 w-3.5" />
        Réduction
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgePercent className="h-5 w-5 text-violet-600" />
            Réduction — {patientName}
          </DialogTitle>
          <DialogDescription>Choisissez la ligne à réduire (examen, consultation, médicament...). Le caissier encaissera le montant réduit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200/70 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{it.description}</span>
                  <span className="block text-xs text-muted-foreground">
                    {it.quantity} × {formatFCFA(it.unitPrice)}
                  </span>
                  <DiscountNote discount={it.discount} reason={it.discountReason} />
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-bold">{formatFCFA(it.amount)}</span>
                  {editing !== i && (
                    <span className="flex gap-2 text-xs">
                      <button type="button" className="font-semibold text-violet-700 hover:underline dark:text-violet-300" onClick={() => setEditing(i)}>
                        {it.discount ? "Modifier" : "Réduire"}
                      </button>
                      {!!it.discount && (
                        <button type="button" className="text-muted-foreground hover:underline" disabled={busy} onClick={() => save(i, 0, "")}>
                          Retirer
                        </button>
                      )}
                    </span>
                  )}
                </span>
              </div>
              {editing === i && (
                <LineDiscountEditor
                  gross={gross(it)}
                  initialDiscount={it.discount}
                  initialReason={it.discountReason}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onApply={(discount, reason) => save(i, discount, reason)}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-baseline justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">{discounted > 0 ? `Réductions : −${formatFCFA(discounted)}` : "Aucune réduction"}</span>
          <span className="text-lg font-extrabold">{formatFCFA(total)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
