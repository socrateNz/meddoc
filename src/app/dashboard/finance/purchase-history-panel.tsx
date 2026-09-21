"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, ShoppingCart, Undo2 } from "lucide-react";
import { getStockPurchaseHistory, cancelStockPurchase } from "@/actions/stock";

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount || 0)) + " FCFA";
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

interface PurchaseHistoryPanelProps {
  organizationId?: string;
  // Annulation d'un achat : COORDINATOR uniquement (cf. cancelStockPurchase côté serveur) — plus
  // strict que le simple droit d'écriture sur le stock.
  canCancel?: boolean;
}

export default function PurchaseHistoryPanel({ organizationId, canCancel: canCancelPurchases = false }: PurchaseHistoryPanelProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cancellingPurchase, setCancellingPurchase] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const queryKey = ["stockPurchaseHistory", organizationId];
  const { data: purchases = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await getStockPurchaseHistory(organizationId);
      if (!res.success) throw new Error(res.error);
      return (res.data ?? []) as any[];
    },
    enabled: !!organizationId,
  });

  const closeCancelDialog = () => {
    setCancellingPurchase(null);
    setCancelReason("");
    setCancelError(null);
  };

  const handleCancelPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingPurchase) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await cancelStockPurchase(cancellingPurchase.id, cancelReason.trim() || undefined);
      if (res.success) {
        closeCancelDialog();
        queryClient.invalidateQueries({ queryKey });
      } else {
        setCancelError(res.error || "Erreur lors de l'annulation de l'achat.");
      }
    } catch (err: any) {
      setCancelError(err.message || "Erreur de connexion.");
    } finally {
      setCancelling(false);
    }
  };

  if (!organizationId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-muted-foreground">
        <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-40" />
        Sélectionnez une clinique active pour consulter l&apos;historique des achats.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? purchases.filter((p: any) => {
        const name = `${p.pharmacyItem?.name || ""} ${p.pharmacyItem?.dosage || ""}`.toLowerCase();
        const supplier = (p.supplier || "").toLowerCase();
        const batch = (p.batchNumber || "").toLowerCase();
        return name.includes(q) || supplier.includes(q) || batch.includes(q);
      })
    : purchases;

  const totalCost = filtered.reduce((sum: number, p: any) => sum + Number(p.totalCost || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par produit, fournisseur, lot..."
            className="pl-9 h-9 text-sm rounded-xl"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} achat{filtered.length > 1 ? "s" : ""} · Total{" "}
          <span className="font-bold text-slate-700 dark:text-slate-300">{formatFCFA(totalCost)}</span>
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">
            {purchases.length === 0 ? "Aucun achat enregistré pour le moment." : "Aucun achat ne correspond à votre recherche."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
              <TableRow>
                <TableHead className="text-xs uppercase font-bold">Date</TableHead>
                <TableHead className="text-xs uppercase font-bold">Produit</TableHead>
                <TableHead className="text-xs uppercase font-bold">Qté</TableHead>
                <TableHead className="text-xs uppercase font-bold text-right">Prix unitaire</TableHead>
                <TableHead className="text-xs uppercase font-bold text-right">Coût total</TableHead>
                <TableHead className="text-xs uppercase font-bold">Fournisseur</TableHead>
                <TableHead className="text-xs uppercase font-bold">Lot / Expiration</TableHead>
                <TableHead className="text-xs uppercase font-bold">Enregistré par</TableHead>
                {canCancelPurchases && <TableHead className="text-xs uppercase font-bold text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p: any) => {
                const isInventoryAdjustment = p.batchNumber === "AJUSTEMENT-INVENTAIRE";
                const isDispenseCancellationReturn = p.batchNumber === "ANNULATION-REMISE";
                const isUntouched = p.remainingQuantity === p.quantity;
                const canCancel = canCancelPurchases && !isInventoryAdjustment && !isDispenseCancellationReturn;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(p.createdAt)}</TableCell>
                    <TableCell className="font-semibold py-3">
                      {p.pharmacyItem?.name}
                      {p.pharmacyItem?.dosage && <span className="text-xs text-muted-foreground"> ({p.pharmacyItem.dosage})</span>}
                    </TableCell>
                    <TableCell>{p.quantity}</TableCell>
                    <TableCell className="text-right">{formatFCFA(p.purchasePrice)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatFCFA(p.totalCost)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.supplier || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {isInventoryAdjustment ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                          Surplus d&apos;inventaire
                        </Badge>
                      ) : (
                        <>
                          {p.batchNumber || "—"}
                          {p.expiryDate && <div>Exp. {formatDate(p.expiryDate)}</div>}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.purchasedBy ? `${p.purchasedBy.firstName} ${p.purchasedBy.lastName}` : "—"}
                    </TableCell>
                    {canCancelPurchases && (
                      <TableCell className="text-right">
                        {canCancel && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!isUntouched}
                            title={
                              isUntouched
                                ? "Annuler cet achat (erreur de saisie)"
                                : "Impossible d'annuler : une partie de ce lot a déjà été vendue, remise ou consommée."
                            }
                            onClick={() => setCancellingPurchase(p)}
                            className={`h-7 text-[11px] gap-1 rounded-lg ${isUntouched ? "text-rose-600 hover:bg-rose-500/10" : "text-slate-300"}`}
                          >
                            <Undo2 className="h-3 w-3" />
                            Annuler
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!cancellingPurchase} onOpenChange={(v) => !v && closeCancelDialog()}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          {cancellingPurchase && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <Undo2 className="h-5 w-5" />
                  Annuler cet achat ?
                </DialogTitle>
                <DialogDescription>
                  {cancellingPurchase.quantity}x {cancellingPurchase.pharmacyItem?.name}
                  {cancellingPurchase.pharmacyItem?.dosage ? ` (${cancellingPurchase.pharmacyItem.dosage})` : ""} —{" "}
                  {formatFCFA(cancellingPurchase.totalCost)}. Le stock sera décrémenté et la dépense associée
                  supprimée. Action réservée aux achats dont aucune unité n&apos;a encore été consommée.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCancelPurchase} className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="cancelPurchaseReason" className="text-xs">Motif (recommandé)</Label>
                  <Textarea
                    id="cancelPurchaseReason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Ex: erreur de saisie sur la quantité/le prix..."
                    className="text-sm rounded-xl"
                    rows={2}
                  />
                </div>

                {cancelError && (
                  <div className="p-2.5 text-xs font-medium rounded-lg border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30">
                    {cancelError}
                  </div>
                )}

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={closeCancelDialog} disabled={cancelling}>
                    Retour
                  </Button>
                  <Button type="submit" disabled={cancelling} className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
                    {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    Annuler l&apos;achat
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
