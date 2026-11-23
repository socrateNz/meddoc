"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPartnerPriceGrid, savePartnerPrices } from "@/actions/partners";
import CsvImportDialog from "@/components/csv-import-dialog";
import { normalizeKey, parseNumberCell } from "@/lib/csv";
import { toast } from "sonner";

type GridRow = { id: string; name: string; department: string | null; basePrice: number; partnerPrice: number | null; ownPrice: number | null };

function formatFCFA(v: number) {
  return `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

// Tarifs propres d'un partenaire : un prix par examen, prioritaire sur le prix partenaire commun du
// catalogue (lui-même prioritaire sur le prix maison). Saisie à l'écran ou par import CSV.
export default function PartnerPricesDialog({ partnerId, partnerName, open, onOpenChange }: { partnerId: string; partnerName: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [grid, setGrid] = useState<GridRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = (res: Awaited<ReturnType<typeof getPartnerPriceGrid>>) => {
    if (!res.success) {
      toast.error(res.error);
      setGrid([]);
      return;
    }
    setGrid(res.data);
    setDraft(Object.fromEntries(res.data.filter((t) => t.ownPrice != null).map((t) => [t.id, String(t.ownPrice)])));
  };
  const load = async () => apply(await getPartnerPriceGrid(partnerId));

  // La fenêtre est montée à l'ouverture (cf. partners-card.tsx) : la grille part de null.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPartnerPriceGrid(partnerId).then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [open, partnerId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (grid ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.department?.toLowerCase().includes(q));
  }, [grid, search]);

  const toPrices = (values: Record<string, string>) => {
    const prices: Record<string, number> = {};
    for (const [id, v] of Object.entries(values)) {
      const n = parseNumberCell(v);
      if (n != null && n >= 0) prices[id] = n;
    }
    return prices;
  };

  const save = async () => {
    setSaving(true);
    const res = await savePartnerPrices({ partnerId, prices: toPrices(draft) });
    setSaving(false);
    if (res.success) {
      toast.success(`${res.data.count} tarif(s) propre(s) enregistré(s) pour ${partnerName}.`);
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  };

  const idByName = new Map((grid ?? []).map((t) => [normalizeKey(t.name), t.id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-violet-600" />
            Tarifs de {partnerName}
          </DialogTitle>
          <DialogDescription>
            Prix propre à ce partenaire. Vide = prix partenaire commun du catalogue, ou à défaut le prix maison.
          </DialogDescription>
        </DialogHeader>
        {grid === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : grid.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Le catalogue d&apos;examens est vide.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un examen…" className="h-9 pl-8" />
              </div>
              <CsvImportDialog<{ id: string; price: number }>
                title={`Importer les tarifs de ${partnerName}`}
                itemLabel="tarif"
                templateFileName={`tarifs_${normalizeKey(partnerName) || "partenaire"}.csv`}
                description="Une ligne par examen : son nom exact au catalogue et le prix pour ce partenaire. Les autres tarifs déjà saisis sont conservés."
                columns={[
                  { key: "name", header: "Nom de l'examen", aliases: ["examen", "analyse"], required: true },
                  { key: "price", header: "Prix partenaire (FCFA)", aliases: ["prix", "tarif"], required: true },
                ]}
                sampleRows={grid.slice(0, 3).map((t) => [t.name, String(t.ownPrice ?? t.partnerPrice ?? t.basePrice)])}
                parseRow={(get) => {
                  const id = idByName.get(normalizeKey(get("name")));
                  if (!id) return { error: `Examen absent du catalogue : « ${get("name")} ».` };
                  const price = parseNumberCell(get("price"));
                  if (price == null || price < 0) return { error: `Prix invalide pour « ${get("name")} ».` };
                  return { item: { id, price } };
                }}
                onImport={async (items) => {
                  const merged = { ...toPrices(draft), ...Object.fromEntries(items.map((i) => [i.id, i.price])) };
                  const res = await savePartnerPrices({ partnerId, prices: merged });
                  if (!res.success) return res;
                  await load();
                  return { success: true, data: { created: items.length, failures: [] } };
                }}
              />
            </div>
            <div className="max-h-[50dvh] divide-y overflow-y-auto rounded-xl border">
              {visible.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Maison {formatFCFA(t.basePrice)}
                      {t.partnerPrice != null ? ` • partenaire commun ${formatFCFA(t.partnerPrice)}` : ""}
                    </p>
                  </div>
                  <Input
                    inputMode="numeric"
                    className="h-9 w-28 text-right"
                    placeholder={String(t.partnerPrice ?? t.basePrice)}
                    value={draft[t.id] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Fermer
          </Button>
          <Button onClick={save} disabled={saving || !grid || grid.length === 0} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer les tarifs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
