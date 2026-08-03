"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PackageCheck, Loader2 } from "lucide-react";
import { receivePurchaseOrderLines } from "@/actions/purchase-orders";
import { toast } from "sonner";

interface ReceivePurchaseOrderDialogProps {
  order: any;
  onSuccess: (order: any) => void;
}

export default function ReceivePurchaseOrderDialog({ order, onSuccess }: ReceivePurchaseOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const remainingLines = order.lines.filter((l: any) => l.quantityReceived < l.quantityOrdered);
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(remainingLines.map((l: any) => [l.id, String(l.quantityOrdered - l.quantityReceived)]))
  );
  const [batchNumbers, setBatchNumbers] = useState<Record<string, string>>({});
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const receipts = remainingLines
      .map((l: any) => ({
        lineId: l.id,
        quantityReceived: Number(quantities[l.id]) || 0,
        batchNumber: batchNumbers[l.id] || undefined,
        expiryDate: expiryDates[l.id] || undefined,
      }))
      .filter((r: any) => r.quantityReceived > 0);

    if (receipts.length === 0) {
      toast.error("Renseignez au moins une quantité reçue.");
      return;
    }

    setLoading(true);
    try {
      const res = await receivePurchaseOrderLines(order.id, receipts);
      if (res.success) {
        toast.success("Réception enregistrée — stock mis à jour.");
        setOpen(false);
        onSuccess(res.data);
      } else {
        toast.error(res.error || "Erreur lors de la réception.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5 rounded-lg" />}>
        <PackageCheck className="h-3.5 w-3.5" />
        Réceptionner
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
            Réceptionner la commande
          </DialogTitle>
          <DialogDescription>
            Réception totale ou partielle possible — le stock et les lots (FEFO) sont mis à jour automatiquement pour chaque ligne réceptionnée.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {remainingLines.map((l: any) => {
            const remaining = l.quantityOrdered - l.quantityReceived;
            return (
              <div key={l.id} className="space-y-2 rounded-xl border p-3">
                <p className="text-sm font-semibold">{l.pharmacyItem?.name || l.newItemName} <span className="text-xs text-muted-foreground font-normal">— commandé {l.quantityOrdered}, reçu {l.quantityReceived}</span></p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Qté reçue (max {remaining})</Label>
                    <Input
                      type="number"
                      min="0"
                      max={remaining}
                      value={quantities[l.id] || ""}
                      onChange={(e) => setQuantities({ ...quantities, [l.id]: e.target.value })}
                      className="h-9 text-xs rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">N° lot</Label>
                    <Input value={batchNumbers[l.id] || ""} onChange={(e) => setBatchNumbers({ ...batchNumbers, [l.id]: e.target.value })} className="h-9 text-xs rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Péremption</Label>
                    <Input type="date" value={expiryDates[l.id] || ""} onChange={(e) => setExpiryDates({ ...expiryDates, [l.id]: e.target.value })} className="h-9 text-xs rounded-lg" />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer la réception
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
