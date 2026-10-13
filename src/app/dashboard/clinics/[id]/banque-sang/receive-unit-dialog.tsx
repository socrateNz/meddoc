"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { receiveBloodUnit } from "@/actions/blood-bank";
import { ABO_GROUPS, BLOOD_PRODUCTS, BLOOD_PRODUCT_LABELS, RHESUS, type AboGroup, type BloodProduct, type Rhesus } from "@/lib/blood-bank";

const selectClass = "h-9 w-full px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

// Entrée en stock d'une poche reçue du centre de transfusion (numéro, produit, groupe, péremption).
export default function ReceiveUnitDialog({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { unitNumber: "", product: "RBC" as BloodProduct, aboGroup: "O" as AboGroup, rhesus: "POS" as Rhesus, volumeMl: "", collectedAt: "", expiresAt: "", source: "", price: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = form.price.trim() === "" ? 0 : Number(form.price.replace(/\s/g, ""));
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Tarif invalide.");
      return;
    }
    setSaving(true);
    const res = await receiveBloodUnit({
      clinicId,
      unitNumber: form.unitNumber.trim(),
      product: form.product,
      aboGroup: form.aboGroup,
      rhesus: form.rhesus,
      volumeMl: form.volumeMl ? Number(form.volumeMl) : undefined,
      collectedAt: form.collectedAt || undefined,
      expiresAt: form.expiresAt,
      source: form.source.trim() || undefined,
      price,
    });
    setSaving(false);
    if (res.success) {
      toast.success("Poche entrée en stock.");
      setForm({ ...empty, product: form.product, source: form.source, price: form.price });
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 rounded-xl" />}>
        <PackagePlus className="h-4 w-4" />
        Réceptionner une poche
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Réceptionner une poche</DialogTitle>
          <DialogDescription>Recopiez les informations de l&apos;étiquette de la poche.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Numéro de la poche *</Label>
              <Input required value={form.unitNumber} onChange={(e) => set("unitNumber", e.target.value)} className="rounded-xl font-mono" maxLength={40} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Produit *</Label>
              <select value={form.product} onChange={(e) => set("product", e.target.value as BloodProduct)} className={selectClass}>
                {BLOOD_PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {BLOOD_PRODUCT_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Groupe ABO *</Label>
              <select value={form.aboGroup} onChange={(e) => set("aboGroup", e.target.value as AboGroup)} className={selectClass}>
                {ABO_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Rhésus *</Label>
              <select value={form.rhesus} onChange={(e) => set("rhesus", e.target.value as Rhesus)} className={selectClass}>
                {RHESUS.map((r) => (
                  <option key={r} value={r}>
                    {r === "POS" ? "RhD positif (+)" : "RhD négatif (-)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Prélevée le</Label>
              <Input type="date" value={form.collectedAt} onChange={(e) => set("collectedAt", e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Périme le *</Label>
              <Input type="date" required value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Volume (mL)</Label>
              <Input type="number" min={10} max={1000} value={form.volumeMl} onChange={(e) => set("volumeMl", e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Tarif facturé (FCFA)</Label>
              <Input inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0" className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Provenance</Label>
              <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="ex: Centre national de transfusion sanguine" className="h-9 rounded-xl" maxLength={120} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={saving} className="gap-2 rounded-xl">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Entrer en stock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
