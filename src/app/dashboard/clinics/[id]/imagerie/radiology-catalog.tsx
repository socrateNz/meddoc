"use client";

import SearchSelect from "@/components/ui/search-select";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { upsertRadiologyExam } from "@/actions/radiology";
import RadiologyExamsImport from "@/components/imports/radiology-exams-import";
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
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const startEdit = (exam: Exam | null) => {
    setEditing(exam);
    setName(exam?.name ?? "");
    setModality((exam?.modality as RadiologyModality) ?? "XRAY");
    setPrice(exam ? String(exam.basePrice) : "");
    // Le formulaire est en haut de la page : sans ce défilement, cliquer sur le crayon d'un examen
    // en bas d'un long catalogue ne montrait rien et le bouton semblait sans effet.
    if (exam) {
      requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        nameRef.current?.focus({ preventScroll: true });
      });
    }
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
      <div className="flex justify-end">
        <RadiologyExamsImport clinicId={clinicId} />
      </div>
      <form
        ref={formRef}
        onSubmit={save}
        className={`flex flex-wrap items-end gap-2 rounded-2xl border p-4 scroll-mt-24 transition-colors ${
          editing
            ? "border-blue-400 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/30"
            : "border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40"
        }`}
      >
        {editing && (
          <p className="w-full text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Modification de : {editing.name}
          </p>
        )}
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-xs uppercase tracking-wider font-bold text-slate-400">Examen</label>
          <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Radiographie du thorax (face)" className="h-9 rounded-xl" />
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider font-bold text-slate-400">Modalité</label>
          <SearchSelect value={modality} onChange={(e) => setModality(e.target.value as RadiologyModality)} className={selectClass}>
            {RADIOLOGY_MODALITIES.map((m) => (
              <option key={m} value={m}>
                {RADIOLOGY_MODALITY_LABELS[m]}
              </option>
            ))}
          </SearchSelect>
        </div>
        <div className="space-y-1 w-36">
          <label className="text-xs uppercase tracking-wider font-bold text-slate-400">Tarif (FCFA)</label>
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
            <div key={exam.id} className={`flex items-center gap-3 px-4 py-2.5 ${exam.isActive ? "" : "opacity-50"} ${editing?.id === exam.id ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{exam.name}</p>
                <p className="text-xs text-muted-foreground">{RADIOLOGY_MODALITY_LABELS[exam.modality as RadiologyModality] || exam.modality}</p>
              </div>
              <span className="text-sm font-semibold">{formatFCFA(exam.basePrice)}</span>
              {!exam.isActive && <Badge variant="outline" className="text-xs">Désactivé</Badge>}
              <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => startEdit(exam)} title="Modifier" aria-label={`Modifier ${exam.name}`}>
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
