"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Baby, Loader2, Plus, X } from "lucide-react";
import { recordDelivery } from "@/actions/maternity";
import { toast } from "sonner";

interface NewbornDraft {
  sex: "M" | "F" | "Indéterminé";
  weightGrams: string;
  apgarScore1: string;
  apgarScore5: string;
  vitalStatus: "LIVE_BIRTH" | "STILLBIRTH";
}

const emptyNewborn: NewbornDraft = { sex: "F", weightGrams: "", apgarScore1: "", apgarScore5: "", vitalStatus: "LIVE_BIRTH" };

const MODE_OPTIONS = [
  { value: "VAGINAL", label: "Voie basse" },
  { value: "C_SECTION", label: "Césarienne" },
  { value: "ASSISTED", label: "Voie basse assistée" },
];

const SEX_OPTIONS = [
  { value: "F", label: "Fille" },
  { value: "M", label: "Garçon" },
  { value: "Indéterminé", label: "Indéterminé" },
];

const VITAL_STATUS_OPTIONS = [
  { value: "LIVE_BIRTH", label: "Né(e) vivant(e)" },
  { value: "STILLBIRTH", label: "Mort-né(e)" },
];

export default function RecordDeliveryDialog({ pregnancyId }: { pregnancyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deliveredAt, setDeliveredAt] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"VAGINAL" | "C_SECTION" | "ASSISTED">("VAGINAL");
  const [complicationInput, setComplicationInput] = useState("");
  const [complications, setComplications] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [newborns, setNewborns] = useState<NewbornDraft[]>([{ ...emptyNewborn }]);

  const handleAddComplication = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && complicationInput.trim()) {
      e.preventDefault();
      if (!complications.includes(complicationInput.trim())) setComplications([...complications, complicationInput.trim()]);
      setComplicationInput("");
    }
  };
  const handleRemoveComplication = (idx: number) => setComplications(complications.filter((_, i) => i !== idx));

  const updateNewborn = (idx: number, patch: Partial<NewbornDraft>) => {
    setNewborns((prev) => prev.map((n, i) => (i === idx ? { ...n, ...patch } : n)));
  };
  const addNewbornRow = () => setNewborns((prev) => [...prev, { ...emptyNewborn }]);
  const removeNewbornRow = (idx: number) => setNewborns((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newborns.some((n) => !n.weightGrams)) {
      toast.error("Le poids est requis pour chaque nouveau-né.");
      return;
    }
    setLoading(true);
    try {
      const res = await recordDelivery({
        pregnancyId,
        deliveredAt: deliveredAt || undefined,
        mode,
        complications,
        notes: notes || undefined,
        newborns: newborns.map((n) => ({
          sex: n.sex,
          weightGrams: Number(n.weightGrams),
          apgarScore1: n.apgarScore1 ? Number(n.apgarScore1) : undefined,
          apgarScore5: n.apgarScore5 ? Number(n.apgarScore5) : undefined,
          vitalStatus: n.vitalStatus,
        })),
      });
      if (res.success) {
        toast.success("Accouchement enregistré.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white" />}>
        <Baby className="h-3.5 w-3.5" />Enregistrer l&apos;accouchement
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-pink-600 dark:text-pink-400">
            <Baby className="h-5 w-5" />
            Enregistrer l&apos;accouchement
          </DialogTitle>
          <DialogDescription>Cette action clôture le suivi de grossesse actif.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date de l&apos;accouchement</Label>
              <Input type="date" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select items={MODE_OPTIONS} value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Complications (Appuyez sur Entrée pour ajouter)</Label>
            <Input
              placeholder="Ex: Hémorragie post-partum"
              value={complicationInput}
              onChange={(e) => setComplicationInput(e.target.value)}
              onKeyDown={handleAddComplication}
              className="rounded-xl"
            />
            {complications.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {complications.map((c, idx) => (
                  <Badge key={idx} variant="outline" className="gap-1 pr-1.5 py-0.5 border-red-500/30 text-red-600 bg-red-500/5">
                    {c}
                    <button type="button" onClick={() => handleRemoveComplication(idx)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Nouveau-né(s) *</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={addNewbornRow}>
                <Plus className="h-3.5 w-3.5" />Ajouter
              </Button>
            </div>
            <div className="space-y-3">
              {newborns.map((n, idx) => (
                <div key={idx} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Nouveau-né {idx + 1}</span>
                    {newborns.length > 1 && (
                      <button type="button" onClick={() => removeNewbornRow(idx)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select items={SEX_OPTIONS} value={n.sex} onValueChange={(v: any) => updateNewborn(idx, { sex: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sexe" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEX_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      required
                      placeholder="Poids (g) *"
                      value={n.weightGrams}
                      onChange={(e) => updateNewborn(idx, { weightGrams: e.target.value })}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="number" min="0" max="10" placeholder="Apgar 1min" value={n.apgarScore1} onChange={(e) => updateNewborn(idx, { apgarScore1: e.target.value })} className="rounded-xl" />
                    <Input type="number" min="0" max="10" placeholder="Apgar 5min" value={n.apgarScore5} onChange={(e) => updateNewborn(idx, { apgarScore5: e.target.value })} className="rounded-xl" />
                    <Select items={VITAL_STATUS_OPTIONS} value={n.vitalStatus} onValueChange={(v: any) => updateNewborn(idx, { vitalStatus: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="État" />
                      </SelectTrigger>
                      <SelectContent>
                        {VITAL_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-xl" placeholder="Observations complémentaires..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Baby className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
