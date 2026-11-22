"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Handshake, ImageUp, Loader2, Pencil, Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { savePartner } from "@/actions/partners";
import { fileToResizedDataUrl } from "./settings-form";
import PartnerPricesDialog from "./partner-prices-dialog";
import { toast } from "sonner";

export type PartnerRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  billing: string;
  isActive: boolean;
};

const EMPTY: Omit<PartnerRow, "id"> & { id?: string } = { name: "", logoUrl: null, address: null, phone: null, email: null, billing: "PARTNER", isActive: true };

// Cliniques partenaires : leurs patients font leurs examens ici, les résultats sortent à leur
// en-tête, au prix partenaire du catalogue.
export default function PartnersCard({ clinicId, partners, readOnly }: { clinicId: string; partners: PartnerRow[]; readOnly: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<(Omit<PartnerRow, "id"> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [pricing, setPricing] = useState<PartnerRow | null>(null);

  const set = (patch: Partial<PartnerRow>) => setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Format d'image non pris en charge (PNG, JPEG ou WebP).");
      return;
    }
    try {
      set({ logoUrl: await fileToResizedDataUrl(file) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image invalide.");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const res = await savePartner({
      clinicId,
      id: editing.id,
      name: editing.name,
      logoUrl: editing.logoUrl ?? "",
      address: editing.address ?? undefined,
      phone: editing.phone ?? undefined,
      email: editing.email ?? undefined,
      billing: editing.billing === "PATIENT" ? "PATIENT" : "PARTNER",
      isActive: editing.isActive,
    });
    setSaving(false);
    if (res.success) {
      toast.success(editing.id ? "Partenaire mis à jour." : `Partenaire « ${res.data.name} » ajouté.`);
      setEditing(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const inputClass = "h-11 text-base sm:h-9 sm:text-sm";

  return (
    <div id="partenaires" className="scroll-mt-24 space-y-4 rounded-2xl border border-slate-200 bg-white/60 p-5 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Handshake className="h-4 w-4 text-violet-600" />
            Cliniques partenaires
          </h2>
          <p className="text-xs text-muted-foreground">
            Cliniques dont les patients font leurs examens à votre laboratoire : prix partenaire (catalogue), rapport à leur en-tête, relevé mensuel.
          </p>
        </div>
        <div className="flex gap-2">
          {partners.length > 0 && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/dashboard/clinics/${clinicId}/partenaires`}>
                <FileText className="h-4 w-4" />
                Relevés
              </Link>
            </Button>
          )}
          {!readOnly && (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="h-4 w-4" />
              Nouveau partenaire
            </Button>
          )}
        </div>
      </div>

      {partners.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Aucun partenaire pour le moment.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
          {partners.map((p) => (
            <li key={p.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${p.isActive ? "" : "opacity-60"}`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-50 dark:bg-slate-950/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.logoUrl ? <img src={p.logoUrl} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-5 w-5 text-slate-300" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {p.name}
                    {!p.isActive && <span className="ml-2 text-[10px] font-semibold text-slate-500">Désactivé</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.billing === "PARTNER" ? "Facturé au partenaire (relevé mensuel)" : "Réglé par le patient, au prix partenaire"}</p>
                </div>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setPricing(p)}>
                    <Tags className="h-3.5 w-3.5" />
                    Tarifs
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditing({ ...p })}>
                    <Pencil className="h-3.5 w-3.5" />
                    Modifier
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pricing && <PartnerPricesDialog partnerId={pricing.id} partnerName={pricing.name} open={!!pricing} onOpenChange={(v) => !v && setPricing(null)} />}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Modifier le partenaire" : "Nouveau partenaire"}</DialogTitle>
            <DialogDescription>Le logo et les coordonnées forment l&apos;en-tête des rapports d&apos;analyses de ce partenaire.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="partner-name">Nom de la clinique *</Label>
                <Input id="partner-name" value={editing.name} onChange={(e) => set({ name: e.target.value })} required maxLength={80} className={inputClass} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50 dark:bg-slate-950/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {editing.logoUrl ? <img src={editing.logoUrl} alt="" className="h-full w-full object-contain" /> : <Building2 className="h-6 w-6 text-slate-300" />}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogo} />
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
                  <ImageUp className="h-4 w-4" />
                  {editing.logoUrl ? "Changer le logo" : "Ajouter le logo"}
                </Button>
                {editing.logoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ logoUrl: null })}>
                    Retirer
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="partner-address">Adresse</Label>
                <Input id="partner-address" value={editing.address ?? ""} onChange={(e) => set({ address: e.target.value })} maxLength={200} className={inputClass} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="partner-phone">Téléphone</Label>
                  <Input id="partner-phone" value={editing.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} maxLength={40} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="partner-email">E-mail</Label>
                  <Input id="partner-email" type="email" value={editing.email ?? ""} onChange={(e) => set({ email: e.target.value })} maxLength={120} className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Facturation</Label>
                {(["PARTNER", "PATIENT"] as const).map((b) => (
                  <label key={b} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200/70 p-2.5 text-sm dark:border-slate-800">
                    <input type="radio" name="billing" className="mt-0.5" checked={editing.billing === b} onChange={() => set({ billing: b })} />
                    <span>
                      <span className="font-medium">{b === "PARTNER" ? "Au partenaire, en fin de mois" : "Au patient, à la caisse"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {b === "PARTNER"
                          ? "Aucun ticket de caisse : les examens figurent sur le relevé mensuel du partenaire."
                          : "Le patient règle à la caisse, au prix partenaire."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {editing.id && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editing.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                  Partenaire actif (proposé sur les nouvelles demandes)
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
