"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Loader2, FlaskConical, X, Wallet, Zap } from "lucide-react";
import { createOrUpdateLabTest } from "@/actions/lab";
import { toast } from "sonner";

interface LabTestDialogProps {
  labTest?: any;
  pharmacyItems?: any[];
  onSuccess?: (test: any) => void;
}

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

export default function LabTestDialog({ labTest, pharmacyItems = [], onSuccess }: LabTestDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(labTest?.name || "");
  const [department, setDepartment] = useState(labTest?.department || "");
  const [pharmacyItemId, setPharmacyItemId] = useState(labTest?.pharmacyItemId || "");
  const [requiresPaymentFirst, setRequiresPaymentFirst] = useState(labTest?.requiresPaymentFirst ?? true);
  const [durationMinutes, setDurationMinutes] = useState(labTest?.durationMinutes?.toString() || "");
  const [criticalLow, setCriticalLow] = useState(labTest?.criticalLow?.toString() || "");
  const [criticalHigh, setCriticalHigh] = useState(labTest?.criticalHigh?.toString() || "");
  const [consumables, setConsumables] = useState<{ pharmacyItemId: string; name: string; quantity: number }[]>(
    Array.isArray(labTest?.consumables) ? labTest.consumables : []
  );
  const [newItemId, setNewItemId] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");

  const pharmacyItemOptions = pharmacyItems.map((p) => ({ value: p.id, label: `${p.name}${p.unitPrice != null ? ` — ${formatFCFA(p.unitPrice)}` : ""}` }));
  const selectedProduct = pharmacyItems.find((p) => p.id === pharmacyItemId);

  const handleAddConsumable = () => {
    if (!newItemId) return;
    const item = pharmacyItems.find((p) => p.id === newItemId);
    if (!item) return;
    const qty = Number(newItemQty) || 1;
    setConsumables((prev) => {
      const exists = prev.some((c) => c.pharmacyItemId === newItemId);
      if (exists) return prev.map((c) => (c.pharmacyItemId === newItemId ? { ...c, quantity: qty } : c));
      return [...prev, { pharmacyItemId: newItemId, name: item.name, quantity: qty }];
    });
    setNewItemId("");
    setNewItemQty("1");
  };

  const handleRemoveConsumable = (pharmacyItemId: string) => {
    setConsumables((prev) => prev.filter((c) => c.pharmacyItemId !== pharmacyItemId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Le nom de l'examen est requis.");
      return;
    }
    if (!pharmacyItemId) {
      toast.error("Sélectionnez le produit pharmacie qui représente cet examen.");
      return;
    }

    setLoading(true);
    try {
      const res = await createOrUpdateLabTest({
        id: labTest?.id,
        name: name.trim(),
        department: department.trim() || undefined,
        pharmacyItemId,
        requiresPaymentFirst,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        criticalLow: criticalLow ? Number(criticalLow) : undefined,
        criticalHigh: criticalHigh ? Number(criticalHigh) : undefined,
        consumables,
      });
      if (res.success) {
        toast.success(labTest ? "Examen mis à jour." : "Examen ajouté au catalogue.");
        setOpen(false);
        onSuccess?.(res.data);
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        labTest ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" />
        ) : (
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs" />
        )
      }>
        {labTest ? <Edit className="h-4 w-4" /> : (<><Plus className="h-4 w-4" />Nouvel examen</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-blue-600 dark:text-blue-400">
            <FlaskConical className="h-5 w-5" />
            {labTest ? "Modifier l'examen" : "Nouvel examen"}
          </DialogTitle>
          <DialogDescription>
            Reliez cet examen à un produit pharmacie : son prix de vente sert de tarif, et il est décompté du stock à chaque prélèvement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nom de l&apos;examen *</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Numération Formule Sanguine (NFS)" className="rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="ex: Hématologie" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Durée (minutes)</Label>
              <Input type="number" min="0" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="ex: 240" className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Produit pharmacie *</Label>
            <Select items={pharmacyItemOptions} value={pharmacyItemId} onValueChange={(v: any) => setPharmacyItemId(v || "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir le produit lié à cet examen..." />
              </SelectTrigger>
              <SelectContent>
                {pharmacyItemOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProduct && (
              <p className="text-[11px] text-muted-foreground">
                Prix facturé : <span className="font-semibold text-slate-700 dark:text-slate-300">{formatFCFA(selectedProduct.unitPrice)}</span> (basé sur le produit lié) — Stock actuel : {selectedProduct.stockQuantity}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Circuit</Label>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setRequiresPaymentFirst(true)}
                className={`flex-1 px-3 py-2 rounded-xl font-semibold border flex items-center justify-center gap-1.5 ${requiresPaymentFirst ? "bg-amber-600 text-white border-amber-600" : "text-slate-500 border-slate-200 dark:border-slate-800"}`}
              >
                <Wallet className="h-3.5 w-3.5" /> Caisse d&apos;abord
              </button>
              <button
                type="button"
                onClick={() => setRequiresPaymentFirst(false)}
                className={`flex-1 px-3 py-2 rounded-xl font-semibold border flex items-center justify-center gap-1.5 ${!requiresPaymentFirst ? "bg-emerald-600 text-white border-emerald-600" : "text-slate-500 border-slate-200 dark:border-slate-800"}`}
              >
                <Zap className="h-3.5 w-3.5" /> Labo direct
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {requiresPaymentFirst
                ? "La demande attend le règlement en caisse avant de pouvoir être prélevée."
                : "La demande part directement au prélèvement, même non réglée (examens urgents/critiques)."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Seuil critique bas</Label>
              <Input type="number" value={criticalLow} onChange={(e) => setCriticalLow(e.target.value)} placeholder="Optionnel" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Seuil critique haut</Label>
              <Input type="number" value={criticalHigh} onChange={(e) => setCriticalHigh(e.target.value)} placeholder="Optionnel" className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Consommables annexes (tubes, gants... décomptés au prélèvement)</Label>
            {consumables.length > 0 && (
              <div className="space-y-1.5">
                {consumables.map((c) => (
                  <div key={c.pharmacyItemId} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs">
                    <span className="truncate">{c.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">x{c.quantity}</span>
                      <button type="button" onClick={() => handleRemoveConsumable(c.pharmacyItemId)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Select items={pharmacyItemOptions} value={newItemId} onValueChange={(v: any) => setNewItemId(v || "")}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Choisir un article..." />
                </SelectTrigger>
                <SelectContent>
                  {pharmacyItemOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" min="1" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-16 rounded-xl" />
              <Button type="button" variant="outline" size="icon" className="rounded-xl shrink-0" onClick={handleAddConsumable}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
