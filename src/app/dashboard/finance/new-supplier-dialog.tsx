"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Truck, Loader2 } from "lucide-react";
import { createOrUpdateSupplier } from "@/actions/suppliers";

interface NewSupplierDialogProps {
  organizationId?: string;
  onSuccess: (supplier: any) => void;
}

const emptyForm = { name: "", contactName: "", phone: "", email: "", address: "", notes: "" };

export default function NewSupplierDialog({ organizationId, onSuccess }: NewSupplierDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState(emptyForm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await createOrUpdateSupplier({
        name: formData.name,
        contactName: formData.contactName || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        address: formData.address || undefined,
        notes: formData.notes || undefined,
        organizationId,
      });
      if (res.success) {
        setOpen(false);
        setFormData(emptyForm);
        onSuccess(res.data);
      } else {
        setError(res.error || "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFormData(emptyForm); setError(""); } }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl" />}>
        <Plus className="h-4 w-4" />
        Nouveau fournisseur
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Truck className="h-5 w-5 text-indigo-600" />
            Nouveau fournisseur
          </DialogTitle>
          <DialogDescription>Enregistrez la fiche d&apos;un fournisseur pour lui passer des commandes.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom du fournisseur *</Label>
            <Input id="name" required placeholder="ex: Labo Pharmacie Centrale" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="contactName">Contact</Label>
              <Input id="contactName" placeholder="ex: M. Diallo" value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" placeholder="ex: 6XX XXX XXX" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="contact@fournisseur.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" placeholder="ex: Douala, Cameroun" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="rounded-xl" />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
