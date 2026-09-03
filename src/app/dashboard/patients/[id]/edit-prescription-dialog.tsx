"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { updatePrescription } from "@/actions/prescriptions";
import { toast } from "sonner";

interface PrescriptionItemForm {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: string;
}

function toFormItems(items: any[]): PrescriptionItemForm[] {
  return items.map((i) => ({
    drugName: i.drugName || "",
    dosage: i.dosage || "",
    frequency: i.frequency || "",
    duration: i.duration || "",
    instructions: i.instructions || "",
    quantity: i.quantity != null ? String(i.quantity) : "",
  }));
}

interface EditPrescriptionDialogProps {
  prescription: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditPrescriptionDialog({ prescription, open, onOpenChange }: EditPrescriptionDialogProps) {
  const router = useRouter();
  const [items, setItems] = useState<PrescriptionItemForm[]>(() => toFormItems(prescription.items));
  const [notes, setNotes] = useState(prescription.notes || "");
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setItems(toFormItems(prescription.items));
      setNotes(prescription.notes || "");
    }
    onOpenChange(v);
  };

  const updateItem = (index: number, field: keyof PrescriptionItemForm, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { drugName: "", dosage: "", frequency: "", duration: "", instructions: "", quantity: "" }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const validItems = items.filter((i) => i.drugName.trim() && i.dosage.trim() && i.frequency.trim());
    if (validItems.length === 0) {
      toast.error("Renseignez au moins un médicament (nom, dosage, fréquence).");
      return;
    }

    setLoading(true);
    try {
      const res = await updatePrescription({
        prescriptionId: prescription.id,
        notes: notes.trim() || undefined,
        items: validItems.map((i) => ({
          drugName: i.drugName.trim(),
          dosage: i.dosage.trim(),
          frequency: i.frequency.trim(),
          duration: i.duration.trim() || undefined,
          instructions: i.instructions.trim() || undefined,
          quantity: i.quantity ? Number(i.quantity) : undefined,
        })),
      });
      if (res.success) {
        toast.success("Ordonnance modifiée.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur lors de la modification.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Modifier l&apos;ordonnance
          </DialogTitle>
          <DialogDescription>
            Ajustez les médicaments avant l&apos;envoi à la pharmacie. Une nouvelle vérification IA sera relancée après enregistrement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {items.map((item, index) => (
            <div key={index} className="rounded-xl border border-border/50 p-3 space-y-2 relative">
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Retirer ce médicament"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="grid grid-cols-2 gap-2 pr-6">
                <div className="space-y-1">
                  <Label className="text-xs">Médicament *</Label>
                  <Input value={item.drugName} onChange={(e) => updateItem(index, "drugName", e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dosage *</Label>
                  <Input value={item.dosage} onChange={(e) => updateItem(index, "dosage", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Fréquence *</Label>
                  <Input value={item.frequency} onChange={(e) => updateItem(index, "frequency", e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Durée</Label>
                  <Input value={item.duration} onChange={(e) => updateItem(index, "duration", e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantité</Label>
                  <Input type="number" min="0" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instructions</Label>
                <Input value={item.instructions} onChange={(e) => updateItem(index, "instructions", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter un médicament
          </Button>

          <div className="space-y-1 pt-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
