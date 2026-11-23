"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveClinicService } from "@/actions/clinic-services";
import { toast } from "sonner";

export type ClinicServiceRow = {
  id: string;
  name: string;
  consultationPrice: number | null;
  isTransversal: boolean;
  isActive: boolean;
  patientCount: number;
};

const SUGGESTIONS = ["Médecine générale", "Ophtalmologie", "Dentaire", "Maternité", "Pédiatrie", "Chirurgie"];

function formatFCFA(value: number) {
  return `${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

// Services de la clinique : l'accueil y oriente les patients, chaque service ne voit que ses
// dossiers, et la consultation est facturée à son tarif.
export default function ServicesCard({ clinicId, services, readOnly }: { clinicId: string; services: ClinicServiceRow[]; readOnly: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<ClinicServiceRow> | null>(null);
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const open = (service?: ClinicServiceRow, name = "") => {
    setEditing(service ?? { name, isTransversal: false, isActive: true });
    setPrice(service?.consultationPrice != null ? String(service.consultationPrice) : "");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const priceValue = price.trim() === "" ? null : Number(price.replace(/\s/g, "").replace(",", "."));
    if (priceValue !== null && (!Number.isFinite(priceValue) || priceValue < 0)) {
      toast.error("Prix de consultation invalide.");
      return;
    }
    setSaving(true);
    const res = await saveClinicService({
      clinicId,
      id: editing.id,
      name: editing.name ?? "",
      consultationPrice: priceValue,
      isTransversal: !!editing.isTransversal,
      isActive: editing.isActive !== false,
    });
    setSaving(false);
    if (res.success) {
      toast.success(editing.id ? "Service mis à jour." : `Service « ${res.data.name} » créé.`);
      setEditing(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const missingSuggestions = SUGGESTIONS.filter((n) => !services.some((s) => s.name.toLowerCase() === n.toLowerCase()));

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/60 p-5 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Layers className="h-4 w-4 text-blue-600" />
            Services de la clinique
          </h2>
          <p className="text-xs text-muted-foreground">
            L&apos;accueil oriente chaque patient vers un service, qui prend son dossier en charge. Les médecins et infirmiers rattachés à
            un service ne voient que ses patients. Sans aucun service, tout le monde voit tous les patients.
          </p>
        </div>
        {!readOnly && (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => open()}>
            <Plus className="h-4 w-4" />
            Nouveau service
          </Button>
        )}
      </div>

      {services.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Aucun service pour le moment.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
          {services.map((s) => (
            <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 ${s.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {s.name}
                  {s.isTransversal && <span className="ml-2 rounded bg-violet-500/10 px-1.5 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">Transversal</span>}
                  {!s.isActive && <span className="ml-2 rounded bg-slate-500/10 px-1.5 py-0.5 text-xs font-semibold text-slate-600">Désactivé</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.consultationPrice != null ? `Consultation ${formatFCFA(s.consultationPrice)}` : "Tarif saisi à la caisse"} • {s.patientCount} dossier
                  {s.patientCount > 1 ? "s" : ""}
                </p>
              </div>
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => open(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && missingSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Ajout rapide :
          {missingSuggestions.map((n) => (
            <button key={n} type="button" onClick={() => open(undefined, n)} className="rounded-full border px-2 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800">
              + {n}
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Modifier le service" : "Nouveau service"}</DialogTitle>
            <DialogDescription>Nom, tarif de consultation et fonctionnement du service.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="service-name">Nom *</Label>
              <Input
                id="service-name"
                value={editing?.name ?? ""}
                onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="ex: Ophtalmologie"
                className="h-11 text-base sm:h-9 sm:text-sm"
                required
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-price">Prix de la consultation (FCFA)</Label>
              <Input
                id="service-price"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Vide = saisi à la caisse"
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              <p className="text-xs text-muted-foreground">Repris automatiquement sur le ticket de caisse à la clôture de la consultation.</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={!!editing?.isTransversal}
                onChange={(e) => setEditing((prev) => ({ ...prev, isTransversal: e.target.checked }))}
              />
              <span>
                <span className="font-medium">Service transversal</span>
                <span className="block text-xs text-muted-foreground">
                  Travaille pour tous les services (laboratoire, imagerie, urgences) : son personnel voit tous les patients. Pas proposé à
                  l&apos;orientation des consultations.
                </span>
              </span>
            </label>
            {editing?.id && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={editing?.isActive !== false}
                  onChange={(e) => setEditing((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <span>
                  <span className="font-medium">Service actif</span>
                  <span className="block text-xs text-muted-foreground">Désactivé : plus proposé à l&apos;accueil ni aux transferts. Les dossiers existants restent.</span>
                </span>
              </label>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
