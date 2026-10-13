"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { upsertRadiologyExam } from "@/actions/radiology";
import { RADIOLOGY_MODALITIES, RADIOLOGY_MODALITY_LABELS, type RadiologyModality } from "@/lib/radiology";

type Exam = { id: string; name: string; modality: string; basePrice: number; isActive: boolean };

function formatFCFA(v: number) {
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

const selectClass = "h-9 px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

// Catalogue des examens d'imagerie de la clinique (coordinateur) : un nouveau tarif ne change
// jamais un examen déjà prescrit (tarif figé dans la demande).
export default function RadiologyCatalog({ clinicId, exams }: { clinicId: string; exams: Exam[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Exam | null>(null);
  const [name, setName] = useState("");
  const [modality, setModality] = useState<RadiologyModality>("XRAY");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (exam: Exam | null) => {
    setEditing(exam);
    setName(exam?.name ?? "");
    setModality((exam?.modality as RadiologyModality) ?? "XRAY");
    setPrice(exam ? String(exam.basePrice) : "");
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
      startEdit(null);
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
      <form onSubmit={save} className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-4 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Examen</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Radiographie du thorax (face)" className="h-9 rounded-xl" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Modalité</label>
          <select value={modality} onChange={(e) => setModality(e.target.value as RadiologyModality)} className={selectClass}>
            {RADIOLOGY_MODALITIES.map((m) => (
              <option key={m} value={m}>
                {RADIOLOGY_MODALITY_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 w-36">
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Tarif (FCFA)</label>
          <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex: 15000" className="h-9 rounded-xl" />
        </div>
        <Button type="submit" disabled={saving} className="h-9 gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing ? "Enregistrer" : "Ajouter"}
        </Button>
        {editing && (
          <Button type="button" variant="ghost" className="h-9 rounded-xl" onClick={() => startEdit(null)}>
            Annuler
          </Button>
        )}
      </form>

      {exams.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Catalogue vide : ajoutez les examens réalisés dans cette clinique.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
          {exams.map((exam) => (
            <div key={exam.id} className={`flex items-center gap-3 px-4 py-2.5 ${exam.isActive ? "" : "opacity-50"}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{exam.name}</p>
                <p className="text-[11px] text-muted-foreground">{RADIOLOGY_MODALITY_LABELS[exam.modality as RadiologyModality] || exam.modality}</p>
              </div>
              <span className="text-sm font-semibold">{formatFCFA(exam.basePrice)}</span>
              {!exam.isActive && <Badge variant="outline" className="text-[10px]">Désactivé</Badge>}
              <Button size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => startEdit(exam)}>
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
