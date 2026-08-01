"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Truck, Loader2 } from "lucide-react";
import { recordStockPurchase } from "@/actions/stock";

interface PharmacyItemOption {
  id: string;
  name: string;
  dosage?: string | null;
}

interface StockPurchaseDialogProps {
  pharmacyItems: PharmacyItemOption[];
  organizationId?: string;
}

const emptyForm = {
  pharmacyItemId: "",
  isNewProduct: false,
  newProductName: "",
  newProductUnitPrice: "",
  quantity: "",
  purchasePrice: "",
  supplier: "",
  batchNumber: "",
  expiryDate: "",
  invoiceRef: "",
};

export default function StockPurchaseDialog({ pharmacyItems, organizationId }: StockPurchaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState(emptyForm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await recordStockPurchase({
        pharmacyItemId: formData.isNewProduct ? undefined : formData.pharmacyItemId || undefined,
        newItem: formData.isNewProduct
          ? {
              name: formData.newProductName,
              unitPrice: Number(formData.newProductUnitPrice),
            }
          : undefined,
        quantity: Number(formData.quantity),
        purchasePrice: Number(formData.purchasePrice),
        supplier: formData.supplier || undefined,
        batchNumber: formData.batchNumber || undefined,
        expiryDate: formData.expiryDate || undefined,
        invoiceRef: formData.invoiceRef || undefined,
        organizationId,
      });

      if (res.success) {
        setOpen(false);
        setFormData(emptyForm);
      } else {
        setError(res.error || "Erreur lors de l'enregistrement de l'achat.");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFormData(emptyForm); setError(""); } }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10" />}>
        <Truck className="h-4 w-4" />
        Nouvel achat
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShoppingCart className="h-5 w-5 text-indigo-600" />
            Enregistrer un achat de pharmacie
          </DialogTitle>
          <DialogDescription>
            Réceptionnez une quantité avec son prix d'achat réel. Le stock et la dépense sont mis à jour automatiquement.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isNewProduct: false })}
              className={`px-3 py-1.5 rounded-lg font-semibold border ${!formData.isNewProduct ? "bg-indigo-600 text-white border-indigo-600" : "text-slate-500 border-slate-200 dark:border-slate-800"}`}
            >
              Produit existant
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isNewProduct: true })}
              className={`px-3 py-1.5 rounded-lg font-semibold border ${formData.isNewProduct ? "bg-indigo-600 text-white border-indigo-600" : "text-slate-500 border-slate-200 dark:border-slate-800"}`}
            >
              + Nouveau produit
            </button>
          </div>

          {formData.isNewProduct ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="newProductName">Nom du produit *</Label>
                <Input
                  id="newProductName"
                  required
                  placeholder="ex: Paracétamol 500mg"
                  value={formData.newProductName}
                  onChange={(e) => setFormData({ ...formData, newProductName: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="newProductUnitPrice">Prix de vente (FCFA) *</Label>
                <Input
                  id="newProductUnitPrice"
                  type="number"
                  min="0"
                  required
                  placeholder="500"
                  value={formData.newProductUnitPrice}
                  onChange={(e) => setFormData({ ...formData, newProductUnitPrice: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="pharmacyItemId">Produit *</Label>
              <select
                id="pharmacyItemId"
                required
                value={formData.pharmacyItemId}
                onChange={(e) => setFormData({ ...formData, pharmacyItemId: e.target.value })}
                className="w-full h-9 px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">-- Sélectionner un produit --</option>
                {pharmacyItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.dosage ? ` (${item.dosage})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantité achetée *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                required
                placeholder="100"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchasePrice">Prix d'achat unitaire (FCFA) *</Label>
              <Input
                id="purchasePrice"
                type="number"
                min="0"
                required
                placeholder="300"
                value={formData.purchasePrice}
                onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="supplier">Fournisseur</Label>
              <Input
                id="supplier"
                placeholder="ex: Labo Pharmacie Centrale"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoiceRef">Réf. facture fournisseur</Label>
              <Input
                id="invoiceRef"
                placeholder="ex: FAC-2026-0456"
                value={formData.invoiceRef}
                onChange={(e) => setFormData({ ...formData, invoiceRef: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="batchNumber">Numéro de lot</Label>
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

          {formData.quantity && formData.purchasePrice && (
            <p className="text-xs text-muted-foreground">
              Coût total de cet achat :{" "}
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {(Number(formData.quantity) * Number(formData.purchasePrice)).toLocaleString("fr-FR")} FCFA
              </span>{" "}
              — enregistré automatiquement comme dépense.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer l'achat"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
