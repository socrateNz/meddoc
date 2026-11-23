"use client";

import SearchSelect from "@/components/ui/search-select";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pill, Plus, Trash2 } from "lucide-react";
import { createPrescription, listPrescriptionTemplates } from "@/actions/prescriptions";
import { useSubmitGuard } from "@/hooks/use-submit-guard";
import { toast } from "sonner";

interface ItemForm {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: string;
}

const EMPTY_ITEM: ItemForm = { drugName: "", dosage: "", frequency: "", duration: "", instructions: "", quantity: "" };
// Champs 16 px sur mobile (pas de zoom iOS), plus hauts pour le doigt.
const FIELD = "h-11 rounded-xl text-base sm:h-9 sm:text-sm";

// Ordonnance rédigée hors consultation (ex. depuis une visite prénatale) : même circuit que
// l'ordonnance de consultation — vérification IA des interactions, puis envoi à la pharmacie depuis
// l'onglet Ordonnances. Les modèles d'ordonnance de la clinique peuvent être chargés.
export default function NewPrescriptionDialog({
  patientId,
  prenatalVisitId,
  triggerLabel = "Ordonnance",
  onSuccess,
}: {
  patientId: string;
  prenatalVisitId?: string;
  triggerLabel?: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ItemForm[]>([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState("");
  const { submitting: loading, guard } = useSubmitGuard();

  const { data: templates = [] } = useQuery({
    queryKey: ["prescriptionTemplates"],
    queryFn: async () => {
      const res = await listPrescriptionTemplates();
      return res.success ? res.data || [] : [];
    },
    enabled: open,
  });

  const reset = () => {
    setItems([{ ...EMPTY_ITEM }]);
    setNotes("");
  };

  const update = (index: number, field: keyof ItemForm, value: string) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  const loadTemplate = (templateId: string) => {
    const template = templates.find((t: any) => t.id === templateId);
    if (!template || !Array.isArray(template.items)) return;
    const loaded: ItemForm[] = (template.items as any[]).map((i) => ({
      drugName: i.drugName || "",
      dosage: i.dosage || "",
      frequency: i.frequency || "",
      duration: i.duration || "",
      instructions: i.instructions || "",
      quantity: i.quantity != null ? String(i.quantity) : "",
    }));
    // Remplace la ligne vide de départ, sinon ajoute à la suite.
    setItems((prev) => [...prev.filter((i) => i.drugName.trim()), ...loaded]);
    toast.success(`Modèle « ${template.name} » chargé.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = items.filter((i) => i.drugName.trim() && i.dosage.trim() && i.frequency.trim());
    if (valid.length === 0) {
      toast.error("Renseignez au moins un médicament (nom, dosage, fréquence).");
      return;
    }
    try {
      const res = await guard(() =>
        createPrescription({
          patientId,
          prenatalVisitId,
          notes: notes.trim() || undefined,
          items: valid.map((i) => ({
            drugName: i.drugName.trim(),
            dosage: i.dosage.trim(),
            frequency: i.frequency.trim(),
            duration: i.duration.trim() || undefined,
            instructions: i.instructions.trim() || undefined,
            quantity: i.quantity ? Number(i.quantity) : undefined,
          })),
        })
      );
      if (!res) return;
      if (res.success) {
        toast.success("Ordonnance enregistrée. Envoyez-la à la pharmacie depuis l'onglet Ordonnances.");
        setOpen(false);
        reset();
        onSuccess?.();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement de l'ordonnance.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg text-xs" />}>
        <Pill className="h-3.5 w-3.5" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-[640px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-emerald-600" />
            Nouvelle ordonnance
          </DialogTitle>
          <DialogDescription>Les interactions sont vérifiées après enregistrement ; l&apos;envoi à la pharmacie se fait ensuite depuis l&apos;onglet Ordonnances.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {templates.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="rx-template" className="text-xs">Charger un modèle</Label>
              <SearchSelect
                id="rx-template"
                value=""
                onChange={(e) => e.target.value && loadTemplate(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base sm:h-9 sm:text-sm"
              >
                <option value="">— Choisir un modèle —</option>
                {templates.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </SearchSelect>
            </div>
          )}

          {items.map((item, index) => (
            <div key={index} className="relative space-y-2 rounded-xl border border-border/60 p-3">
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="absolute right-1.5 top-1.5 rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  title="Retirer ce médicament"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <div className="grid grid-cols-1 gap-2 pr-8 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Médicament *</Label>
                  <Input value={item.drugName} onChange={(e) => update(index, "drugName", e.target.value)} placeholder="ex: Fer + acide folique" className={FIELD} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dosage *</Label>
                  <Input value={item.dosage} onChange={(e) => update(index, "dosage", e.target.value)} placeholder="ex: 1 comprimé" className={FIELD} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Fréquence *</Label>
                  <Input value={item.frequency} onChange={(e) => update(index, "frequency", e.target.value)} placeholder="1x/jour" className={FIELD} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Durée</Label>
                  <Input value={item.duration} onChange={(e) => update(index, "duration", e.target.value)} placeholder="30 j" className={FIELD} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantité</Label>
                  <Input type="number" min="0" inputMode="numeric" value={item.quantity} onChange={(e) => update(index, "quantity", e.target.value)} className={FIELD} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Instructions</Label>
                <Input value={item.instructions} onChange={(e) => update(index, "instructions", e.target.value)} placeholder="ex: après le repas" className={FIELD} />
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" className="h-11 w-full gap-1.5 rounded-xl sm:h-9" onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}>
            <Plus className="h-4 w-4" />
            Ajouter un médicament
          </Button>

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-xl text-base sm:text-sm" />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-11 rounded-xl sm:h-9">Annuler</Button>
            <Button type="submit" disabled={loading} className="h-12 gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 sm:h-9">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pill className="h-4 w-4" />}
              Enregistrer l&apos;ordonnance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
