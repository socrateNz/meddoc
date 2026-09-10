"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, ShoppingCart } from "lucide-react";
import { getStockPurchaseHistory } from "@/actions/stock";

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
}

export default function PurchaseHistoryPanel({ organizationId }: PurchaseHistoryPanelProps) {
  const [search, setSearch] = useState("");

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["stockPurchaseHistory", organizationId],
    queryFn: async () => {
      const res = await getStockPurchaseHistory(organizationId);
      if (!res.success) throw new Error(res.error);
      return (res.data ?? []) as any[];
    },
    enabled: !!organizationId,
  });

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p: any) => {
                const isInventoryAdjustment = p.batchNumber === "AJUSTEMENT-INVENTAIRE";
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
