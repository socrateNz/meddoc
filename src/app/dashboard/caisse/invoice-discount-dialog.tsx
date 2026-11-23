"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { applyInvoiceDiscount } from "@/actions/finance";
import { DiscountNote, LineDiscountEditor } from "./line-discount-editor";
import { spreadDiscount } from "@/lib/invoice-discount";

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
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  pendingInvoice: { id: string; items: Item[] };
  patientName: string;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [innerOpen, setInnerOpen] = useState(false);
  // Ouverte depuis un menu « … » (cf. ticket-actions-menu.tsx) : pilotée par le parent, sans bouton.
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : innerOpen;
  const setOpen = (v: boolean) => (controlled ? onOpenChangeProp?.(v) : setInnerOpen(v));
  const [items, setItems] = useState<Item[]>(pendingInvoice.items || []);
  // Ligne en cours de réduction, ou "all" : tout le ticket.
  const [editing, setEditing] = useState<number | "all" | null>(null);
  const [busy, setBusy] = useState(false);

  const gross = (it: Item) => Math.round(Number(it.quantity) * Number(it.unitPrice)) || Number(it.amount) || 0;
  const total = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const discounted = items.reduce((sum, it) => sum + (Number(it.discount) || 0), 0);
  const grossTotal = items.reduce((sum, it) => sum + gross(it), 0);

  const save = (index: number, discount: number, reason: string) => submit([{ index, discount, reason }], discount > 0);

  // Tout le ticket : réduction répartie sur les lignes au prorata de leur prix (cf. spreadDiscount),
  // en remplaçant les réductions déjà posées ligne par ligne.
  const saveAll = (discount: number, reason: string) =>
    submit(
      spreadDiscount(items.map(gross), discount).map((d, index) => ({ index, discount: d, reason })),
      discount > 0
    );

  const submit = async (discounts: { index: number; discount: number; reason: string }[], applied: boolean) => {
    setBusy(true);
    const res = await applyInvoiceDiscount({ pendingInvoiceId: pendingInvoice.id, discounts });
    setBusy(false);
    if (!res.success) return void toast.error(res.error);
    setItems(res.data.items as Item[]);
    setEditing(null);
    if (res.data.settled) {
      toast.success("Ticket entièrement offert : il est soldé, rien à encaisser.");
      setOpen(false);
    } else {
      toast.success(applied ? "Réduction appliquée." : "Réduction retirée.");
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
      {!controlled && (
        <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg border-violet-200 text-xs text-violet-700 hover:bg-violet-50 dark:border-violet-900/50 dark:text-violet-300" />}>
          <BadgePercent className="h-3.5 w-3.5" />
          Réduction
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgePercent className="h-5 w-5 text-violet-600" />
            Réduction — {patientName}
          </DialogTitle>
          <DialogDescription>Réduisez tout le ticket, ou une ligne précise (examen, consultation, médicament...). Le caissier encaissera le montant réduit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/10">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="block font-semibold">Tout le ticket</span>
              <span className="block text-xs text-muted-foreground">Répartie sur les lignes au prorata de leur prix.</span>
            </span>
            {editing !== "all" && (
              <span className="flex shrink-0 gap-3 text-xs">
                <button type="button" className="font-semibold text-violet-700 hover:underline dark:text-violet-300" onClick={() => setEditing("all")}>
                  Réduire tout le ticket
                </button>
                {discounted > 0 && (
                  <button type="button" className="text-muted-foreground hover:underline" disabled={busy} onClick={() => saveAll(0, "")}>
                    Tout retirer
                  </button>
                )}
              </span>
            )}
          </div>
          {editing === "all" && (
            <LineDiscountEditor
              gross={grossTotal}
              initialDiscount={discounted}
              initialReason={items.find((it) => it.discountReason)?.discountReason}
              busy={busy}
              onCancel={() => setEditing(null)}
              onApply={(discount, reason) => saveAll(discount, reason)}
            />
          )}
        </div>
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
