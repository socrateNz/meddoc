"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ban, ShieldCheck, Loader2 } from "lucide-react";
import { setPharmacyItemSaleBlock } from "@/actions/stock";

interface SaleBlockDialogProps {
  item: { id: string; name: string; dosage?: string | null; saleBlockedAt?: unknown; saleBlockedReason?: string | null };
}

// Bouton + dialogue du coordinateur pour bloquer (avec motif obligatoire) ou débloquer un médicament :
// plus de vente à la caisse, ni d'achat, de commande ou de réception — cf. setPharmacyItemSaleBlock,
// qui refait le contrôle de rôle côté serveur (ce composant n'est que la commodité d'interface,
// jamais la protection).
export default function SaleBlockDialog({ item }: SaleBlockDialogProps) {
  const router = useRouter();
  const isBlocked = !!item.saleBlockedAt;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const label = `${item.name}${item.dosage ? ` (${item.dosage})` : ""}`;
  const reasonTooShort = !isBlocked && reason.trim().length < 3;

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setReason("");
      setError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await setPharmacyItemSaleBlock({
        pharmacyItemId: item.id,
        blocked: !isBlocked,
        reason: isBlocked ? undefined : reason.trim(),
      });
      if (res.success) {
        handleOpenChange(false);
        router.refresh();
      } else {
        setError(res.error || "Erreur lors de la modification du blocage.");
      }
    } catch (err: any) {
      setError(err.message || "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-8 gap-1 rounded-lg text-[11px] ${
              isBlocked
                ? "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                : "border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
            }`}
          />
        }
      >
        {isBlocked ? <ShieldCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
        {isBlocked ? "Débloquer" : "Bloquer"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isBlocked ? "text-emerald-600" : "text-rose-600 dark:text-rose-400"}`}>
            {isBlocked ? <ShieldCheck className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
            {isBlocked ? "Débloquer ce produit ?" : "Bloquer ce produit ?"}
          </DialogTitle>
          <DialogDescription>
            {isBlocked ? (
              <>
                <span className="font-semibold">{label}</span> est actuellement bloqué (vente et achat)
                {item.saleBlockedReason ? <> — motif : « {item.saleBlockedReason} »</> : null}. Le débloquer
                permettra de nouveau de l&apos;ajouter à un ticket et d&apos;en acheter ou commander.
              </>
            ) : (
              <>
                La caisse ne pourra plus ajouter <span className="font-semibold">{label}</span> à un ticket, et
                il ne pourra plus être acheté, commandé ni réceptionné. Les tickets déjà émis restent
                encaissables et remis normalement.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {!isBlocked && (
            <div className="space-y-1.5">
              <Label htmlFor={`saleBlockReason-${item.id}`} className="text-xs">Motif * (visible du caissier)</Label>
              <Textarea
                id={`saleBlockReason-${item.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: rappel de lot, produit périmé, retrait commercial..."
                className="text-sm rounded-xl"
                rows={3}
                required
                minLength={3}
              />
            </div>
          )}

          {error && (
            <div className="p-2.5 text-xs font-medium rounded-lg border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30">
              {error}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Retour
            </Button>
            <Button
              type="submit"
              disabled={loading || reasonTooShort}
              className={`gap-2 text-white ${isBlocked ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isBlocked ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              {isBlocked ? "Débloquer" : "Bloquer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
