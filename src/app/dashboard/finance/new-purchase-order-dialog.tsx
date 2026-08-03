"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList, Loader2, Trash2 } from "lucide-react";
import { createPurchaseOrder } from "@/actions/purchase-orders";
import { toast } from "sonner";

interface Line {
  id: string;
  pharmacyItemId?: string;
  newItemName?: string;
  label: string;
  quantityOrdered: number;
  unitCost: number;
}

interface NewPurchaseOrderDialogProps {
  suppliers: any[];
  pharmacyItems: any[];
  organizationId?: string;
  onSuccess: (order: any) => void;
}

export default function NewPurchaseOrderDialog({ suppliers, pharmacyItems, organizationId, onSuccess }: NewPurchaseOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const [mode, setMode] = useState<"EXISTING" | "NEW">("EXISTING");
  const [pharmacyItemId, setPharmacyItemId] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const resetForm = () => {
    setSupplierId(""); setExpectedDate(""); setNotes(""); setLines([]);
    setPharmacyItemId(""); setNewItemName(""); setQty(""); setUnitCost("");
  };

  const handleAddLine = () => {
    const quantityOrdered = Number(qty);
    const cost = Number(unitCost);
    if (quantityOrdered <= 0 || cost < 0) return;

    if (mode === "EXISTING") {
      if (!pharmacyItemId) return;
      const item = pharmacyItems.find((p) => p.id === pharmacyItemId);
      if (!item) return;
      setLines((prev) => [...prev, { id: `line-${Date.now()}`, pharmacyItemId: item.id, label: item.name, quantityOrdered, unitCost: cost }]);
      setPharmacyItemId("");
    } else {
      if (!newItemName.trim()) return;
      setLines((prev) => [...prev, { id: `line-${Date.now()}`, newItemName: newItemName.trim(), label: newItemName.trim(), quantityOrdered, unitCost: cost }]);
      setNewItemName("");
    }
    setQty("");
    setUnitCost("");
  };

  const handleRemoveLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const total = lines.reduce((sum, l) => sum + l.quantityOrdered * l.unitCost, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error("Sélectionnez un fournisseur."); return; }
    if (lines.length === 0) { toast.error("Ajoutez au moins une ligne à la commande."); return; }

    setLoading(true);
    try {
      const res = await createPurchaseOrder({
        supplierId,
        organizationId,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({ pharmacyItemId: l.pharmacyItemId, newItemName: l.newItemName, quantityOrdered: l.quantityOrdered, unitCost: l.unitCost })),
      });
      if (res.success) {
        toast.success("Commande créée (brouillon).");
        setOpen(false);
        resetForm();
        onSuccess(res.data);
      } else {
        toast.error(res.error || "Erreur lors de la création de la commande.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs" />}>
        <Plus className="h-4 w-4" />
        Nouvelle commande
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            Nouvelle commande fournisseur
          </DialogTitle>
          <DialogDescription>Créée à l&apos;état brouillon — vous pourrez l&apos;envoyer puis la réceptionner ensuite.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fournisseur *</Label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-9 px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">-- Choisir --</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date attendue (optionnel)</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center gap-2 text-xs">
              <button type="button" onClick={() => setMode("EXISTING")} className={`px-3 py-1.5 rounded-lg font-semibold border ${mode === "EXISTING" ? "bg-indigo-600 text-white border-indigo-600" : "text-slate-500 border-slate-200 dark:border-slate-800"}`}>
                Produit existant
              </button>
              <button type="button" onClick={() => setMode("NEW")} className={`px-3 py-1.5 rounded-lg font-semibold border ${mode === "NEW" ? "bg-indigo-600 text-white border-indigo-600" : "text-slate-500 border-slate-200 dark:border-slate-800"}`}>
                + Nouveau produit
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 items-end">
              {mode === "EXISTING" ? (
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Produit</Label>
                  <select
                    value={pharmacyItemId}
                    onChange={(e) => setPharmacyItemId(e.target.value)}
                    className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  >
                    <option value="">-- Choisir --</option>
                    {pharmacyItems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Nom du produit</Label>
                  <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="ex: Compresses stériles" className="h-9 text-xs rounded-lg" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Qté</Label>
                <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 text-xs rounded-lg" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Coût unit.</Label>
                <Input type="number" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="h-9 text-xs rounded-lg" />
              </div>
            </div>
            <Button type="button" size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={handleAddLine}>
              <Plus className="h-3.5 w-3.5" />
              Ajouter la ligne
            </Button>
          </div>

          {lines.length > 0 && (
            <div className="space-y-1.5">
              {lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs">
                  <span className="truncate">{l.label} <Badge variant="outline" className="ml-1 text-[10px]">x{l.quantityOrdered}</Badge></span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">{(l.quantityOrdered * l.unitCost).toLocaleString("fr-FR")} FCFA</span>
                    <button type="button" onClick={() => handleRemoveLine(l.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs font-bold text-right pt-1">Total : {total.toLocaleString("fr-FR")} FCFA</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes (optionnel)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex: Livraison en 2 fois" className="rounded-xl" />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer la commande
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
