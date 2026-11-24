"use client";

import SearchSelect from "@/components/ui/search-select";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { upsertRadiologyExam } from "@/actions/radiology";
import RadiologyExamsImport from "@/components/imports/radiology-exams-import";
import { RADIOLOGY_MODALITIES, RADIOLOGY_MODALITY_LABELS, type RadiologyModality } from "@/lib/radiology";

type Exam = { id: string; name: string; modality: string; basePrice: number; isActive: boolean };

function formatFCFA(v: number) {
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

const selectClass = "h-9 w-full px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

// Catalogue des examens d'imagerie de la clinique (coordinateur) : un nouveau tarif ne change
// jamais un examen déjà prescrit (tarif figé dans la demande).
export default function RadiologyCatalog({ clinicId, exams }: { clinicId: string; exams: Exam[] }) {
  const router = useRouter();
  // Boîte de dialogue d'ajout (editing = null) ou de modification d'un examen.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [name, setName] = useState("");
  const [modality, setModality] = useState<RadiologyModality>("XRAY");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const openDialog = (exam: Exam | null) => {
    setEditing(exam);
    setName(exam?.name ?? "");
    setModality((exam?.modality as RadiologyModality) ?? "XRAY");
    setPrice(exam ? String(exam.basePrice) : "");
    setDialogOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const basePrice = Number(price.replace(/\s/g, ""));
    if (!name.trim() || !Number.isFinite(basePrice) || basePrice < 0) {
      toast.error("Nom et tarif (en FCFA, positif) requis.");
      return;
    }
    setSaving(true);
    const res = await upsertRadiologyExam({ id: editing?.id, clinicId, name: name.trim(), modality, basePrice });
    setSaving(false);
    if (res.success) {
      toast.success(editing ? "Examen mis à jour." : "Examen ajouté au catalogue.");
      setDialogOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const toggleActive = async (exam: Exam) => {
    const res = await upsertRadiologyExam({ id: exam.id, clinicId, name: exam.name, modality: exam.modality as RadiologyModality, basePrice: exam.basePrice, isActive: !exam.isActive });
    if (res.success) router.refresh();
    else toast.error(res.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <RadiologyExamsImport clinicId={clinicId} />
        <Button type="button" onClick={() => openDialog(null)} className="h-9 gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" />
          Nouvel examen
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <form onSubmit={save} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editing ? <Pencil className="h-4 w-4 text-blue-600" /> : <Plus className="h-4 w-4 text-blue-600" />}
                {editing ? "Modifier l'examen" : "Nouvel examen d'imagerie"}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? "Le nouveau tarif s'applique aux prochaines demandes ; les examens déjà prescrits gardent leur tarif."
                  : "L'examen sera proposé dans les demandes d'imagerie et à la caisse."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="radiology-exam-name">Examen *</Label>
              <Input
                id="radiology-exam-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Radiographie du thorax (face)"
                className="h-9 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="radiology-exam-modality">Modalité *</Label>
                <SearchSelect id="radiology-exam-modality" value={modality} onChange={(e) => setModality(e.target.value as RadiologyModality)} className={selectClass}>
                  {RADIOLOGY_MODALITIES.map((m) => (
                    <option key={m} value={m}>
                      {RADIOLOGY_MODALITY_LABELS[m]}
                    </option>
                  ))}
                </SearchSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="radiology-exam-price">Tarif (FCFA) *</Label>
                <Input id="radiology-exam-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex: 15000" className="h-9 rounded-xl" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)} className="rounded-xl">
                Annuler
              </Button>
              <Button type="submit" disabled={saving} className="gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Enregistrer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {exams.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Catalogue vide : ajoutez les examens réalisés dans cette clinique.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
          {exams.map((exam) => (
            <div key={exam.id} className={`flex items-center gap-3 px-4 py-2.5 ${exam.isActive ? "" : "opacity-50"}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{exam.name}</p>
                <p className="text-xs text-muted-foreground">{RADIOLOGY_MODALITY_LABELS[exam.modality as RadiologyModality] || exam.modality}</p>
              </div>
              <span className="text-sm font-semibold">{formatFCFA(exam.basePrice)}</span>
              {!exam.isActive && <Badge variant="outline" className="text-xs">Désactivé</Badge>}
              <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => openDialog(exam)} title="Modifier" aria-label={`Modifier ${exam.name}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => toggleActive(exam)}>
                {exam.isActive ? "Désactiver" : "Réactiver"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
