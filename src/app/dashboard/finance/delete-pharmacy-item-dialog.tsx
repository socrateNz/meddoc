"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, AlertTriangle, Ban } from "lucide-react";
import { getPharmacyItemDeletionInfo, deletePharmacyItem } from "@/actions/stock";

interface DeletionInfo {
  name: string;
  dosage?: string | null;
  stockQuantity: number;
  blockers: string[];
  lotsToRemove: number;
  inventoryLinesToRemove: number;
}

// Bouton + confirmation de suppression d'un produit du catalogue (coordinateur). La boîte
// interroge d'abord le serveur : si le produit a un historique à préserver, elle liste tout de
// suite pourquoi la suppression est impossible plutôt que de laisser cliquer pour rien. Le
// contrôle de rôle et d'éligibilité est refait côté serveur (deletePharmacyItem) — ce composant
// n'est que la commodité d'interface, jamais la protection.
export default function DeletePharmacyItemDialog({ item }: { item: { id: string; name: string; dosage?: string | null } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DeletionInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const label = `${item.name}${item.dosage ? ` (${item.dosage})` : ""}`;

  const handleOpenChange = async (v: boolean) => {
    setOpen(v);
    if (!v) {
      setInfo(null);
      setConfirmed(false);
      setError("");
      return;
    }
    setLoadingInfo(true);
    setError("");
    try {
      const res = await getPharmacyItemDeletionInfo(item.id);
      if (res.success && res.data) setInfo(res.data as DeletionInfo);
      else setError(res.error || "Impossible de vérifier ce produit.");
    } catch (err: any) {
      setError(err.message || "Erreur de connexion.");
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await deletePharmacyItem(item.id);
      if (res.success) {
        handleOpenChange(false);
        router.refresh();
      } else {
        setError(res.error || "Erreur lors de la suppression.");
      }
    } catch (err: any) {
      setError(err.message || "Erreur de connexion.");
    } finally {
      setDeleting(false);
    }
  };

  const blocked = !!info && info.blockers.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Supprimer ce produit"
            className="h-8 w-8 p-0 rounded-lg border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
          />
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            {blocked ? <Ban className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
            {blocked ? "Suppression impossible" : "Supprimer ce produit ?"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{label}</span>
          </DialogDescription>
        </DialogHeader>

        {loadingInfo ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : blocked ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-400">
              Ce produit ne peut pas être supprimé sans fausser l&apos;historique :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
              {info!.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <p className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 p-3 text-slate-600 dark:text-slate-400">
              Pour le retirer de la vente et des achats sans toucher à l&apos;historique, utilisez plutôt{" "}
              <span className="font-semibold">« Bloquer »</span>.
            </p>
          </div>
        ) : info ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-3 space-y-1.5 text-rose-800 dark:text-rose-300">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Cette action est définitive.
              </p>
              <ul className="list-disc pl-5 text-xs space-y-0.5">
                <li>La fiche produit sera supprimée du catalogue.</li>
                {info.stockQuantity > 0 && (
                  <li>Son stock actuel ({info.stockQuantity} unité{info.stockQuantity > 1 ? "s" : ""}) sera perdu.</li>
                )}
                {info.lotsToRemove > 0 && (
                  <li>{info.lotsToRemove} lot(s) d&apos;achat sans mouvement seront supprimés.</li>
                )}
                {info.inventoryLinesToRemove > 0 && (
                  <li>Il sera retiré de l&apos;inventaire non clôturé.</li>
                )}
              </ul>
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-rose-600"
              />
              <span>
                Je confirme la suppression définitive de <span className="font-semibold">{label}</span>.
              </span>
            </label>
          </div>
        ) : null}

        {error && (
          <div className="p-2.5 text-xs font-medium rounded-lg border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30">
            {error}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={deleting}>
            {blocked ? "Fermer" : "Annuler"}
          </Button>
          {!blocked && info && (
            <Button
              type="button"
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              className="gap-2 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Supprimer définitivement
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
