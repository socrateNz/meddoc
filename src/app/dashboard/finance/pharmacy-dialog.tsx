"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Package, Edit, Loader2 } from "lucide-react";
import { createOrUpdatePharmacyItem } from "@/actions/finance";

const CATEGORY_OPTIONS = [
  { value: "MEDICATION", label: "Médicament" },
  { value: "CONSUMABLE", label: "Consommable" },
  { value: "EQUIPMENT", label: "Matériel médical" },
];

interface PharmacyDialogProps {
  item?: any;
  organizationId?: string;
  triggerBtn?: React.ReactNode;
}

export default function PharmacyDialog({ item, organizationId, triggerBtn }: PharmacyDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: item?.name || "",
    dosage: item?.dosage || "",
    category: item?.category || "MEDICATION",
    reorderLevel: item?.reorderLevel ?? 10,
    unitPrice: item?.unitPrice ?? 500,
    batchNumber: item?.batchNumber || "",
    expiryDate: item?.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : "",
    supplier: item?.supplier || "",
    location: item?.location || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await createOrUpdatePharmacyItem({
        id: item?.id,
        name: formData.name,
        dosage: formData.dosage,
        category: formData.category,
        reorderLevel: Number(formData.reorderLevel),
        unitPrice: Number(formData.unitPrice),
        batchNumber: formData.batchNumber || undefined,
        expiryDate: formData.expiryDate || undefined,
        supplier: formData.supplier || undefined,
        location: formData.location || undefined,
        organizationId,
      });

      if (res.success) {
        setOpen(false);
        if (!item) {
          setFormData({
            name: "",
            dosage: "",
            category: "MEDICATION",
            reorderLevel: 10,
            unitPrice: 500,
            batchNumber: "",
            expiryDate: "",
            supplier: "",
            location: "",
          });
        }
      } else {
        setError(res.error || "Erreur lors de l'enregistrement.");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {item ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" className="h-8 text-blue-600 hover:text-blue-700 font-semibold" />}>
          Modifier / Recharger
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs" />}>
          <Plus className="h-4 w-4" />
          Nouveau produit
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5 text-blue-600" />
            {item ? "Modifier le produit" : "Ajouter un produit en pharmacie"}
          </DialogTitle>
          <DialogDescription>
            {item
              ? "Ces informations décrivent le produit. Le stock évolue uniquement via un achat, une vente ou un inventaire."
              : "Créez la fiche du produit. Le stock démarre à zéro : utilisez ensuite \"Nouvel achat\" pour réceptionner une quantité avec son prix d'achat."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom du produit / Médicament *</Label>
            <Input
              id="name"
              required
              placeholder="ex: Paracétamol, Amoxicilline, Seringues 5ml..."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dosage">Dosage / Forme</Label>
              <Input
                id="dosage"
                placeholder="ex: 500mg, Boîte de 16 comprimés, Flacon..."
                value={formData.dosage}
                onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Catégorie *</Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="unitPrice">Prix de vente (FCFA) *</Label>
              <Input
                id="unitPrice"
                type="number"
                min="0"
                required
                placeholder="500"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: Number(e.target.value) })}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reorderLevel">Seuil d'alerte (Stock faible) *</Label>
              <Input
                id="reorderLevel"
                type="number"
                min="1"
                required
                placeholder="10"
                value={formData.reorderLevel}
                onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="batchNumber">Numéro de lot (Traçabilité)</Label>
              <Input
                id="batchNumber"
                placeholder="ex: LOT-2026-08A"
                value={formData.batchNumber}
                onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">Date de péremption</Label>
              <Input
                id="expiryDate"
                type="date"
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="supplier">Fournisseur / Grossiste</Label>
              <Input
                id="supplier"
                placeholder="ex: Labo Pharmacie Centrale"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Rayon / Emplacement</Label>
              <Input
                id="location"
                placeholder="ex: Rayon B3, Armoire A"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">Une alerte de stock faible sera déclenchée si le stock descend au niveau du seuil d'alerte ou en-dessous.</p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
