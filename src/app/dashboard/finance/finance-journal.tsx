"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Printer, Loader2, RotateCcw, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { listFinancialTransactions } from "@/actions/finance";
import PaymentStatusBadge from "@/components/payment-status-badge";

const CATEGORY_LABELS: Record<string, string> = {
  PHARMACY_SALE: "Vente Pharmacie",
  SERVICE_FEE: "Frais de service",
  OPERATIONAL_EXPENSE: "Dépense opérationnelle",
  PHARMACY_PURCHASE: "Achat Pharmacie",
  STOCK_ADJUSTMENT: "Ajustement de stock",
  OTHER: "Autre",
};

type TypeFilter = "" | "INCOME" | "EXPENSE";

interface FinanceJournalProps {
  organizationId?: string;
  onSelectTransaction: (t: any) => void;
}

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

function formatDateTime(dateInput: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateInput));
}

export default function FinanceJournal({ organizationId, onSelectTransaction }: FinanceJournalProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [category, setCategory] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    transactions: any[];
    totalCount: number;
    totalPages: number;
    filteredIncome: number;
    filteredExpenses: number;
  }>({ transactions: [], totalCount: 0, totalPages: 1, filteredIncome: 0, filteredExpenses: 0 });

  // Revenir à la page 1 dès qu'un filtre change (sauf la pagination elle-même).
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, category, dateFrom, dateTo, minAmount, maxAmount]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Léger debounce : évite une requête par frappe sur la recherche texte / les montants.
    const timeout = setTimeout(async () => {
      const res = await listFinancialTransactions({
        organizationId,
        search: search.trim() || undefined,
        type: typeFilter || undefined,
        category: category !== "ALL" ? category : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
        page,
        pageSize: 30,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
      }
      setLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [organizationId, search, typeFilter, category, dateFrom, dateTo, minAmount, maxAmount, page]);

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setCategory("ALL");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
  };

  const hasActiveFilters = !!(search || typeFilter || category !== "ALL" || dateFrom || dateTo || minAmount || maxAmount);
  const netBalance = data.filteredIncome - data.filteredExpenses;

  return (
    <div className="space-y-4">
      {/* Recherche + type */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Rechercher par motif, patient ou caissier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 h-10 rounded-xl"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setTypeFilter("")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${typeFilter === "" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"}`}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("INCOME")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${typeFilter === "INCOME" ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"}`}
          >
            Encaissements (+)
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter("EXPENSE")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${typeFilter === "EXPENSE" ? "bg-white dark:bg-slate-900 text-rose-600 shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"}`}
          >
            Dépenses (-)
          </button>
        </div>
      </div>

      {/* Filtres détaillés */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Catégorie</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          >
            <option value="ALL">Toutes catégories</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Du</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-xs rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Au</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-xs rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Montant min (FCFA)</Label>
          <Input type="number" min="0" placeholder="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9 text-xs rounded-xl" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Montant max (FCFA)</Label>
          <Input type="number" min="0" placeholder="—" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-9 text-xs rounded-xl" />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
            className="h-9 w-full gap-1.5 text-xs rounded-xl"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
        </div>
      </div>

      {/* Totaux du résultat filtré */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Total encaissé (filtré)</p>
            <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">+{formatFCFA(data.filteredIncome)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/30">
          <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">Total dépensé (filtré)</p>
            <p className="text-sm font-extrabold text-rose-700 dark:text-rose-300">-{formatFCFA(data.filteredExpenses)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
          <Scale className="h-4 w-4 text-slate-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-slate-400">Solde net (filtré)</p>
            <p className={`text-sm font-extrabold ${netBalance >= 0 ? "text-slate-800 dark:text-slate-200" : "text-rose-600 dark:text-rose-400"}`}>
              {netBalance >= 0 ? "+" : ""}{formatFCFA(netBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xs">
        <Table>
          <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Date & Heure</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Type</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold max-w-[280px]">Motif / Description</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Patient / Rattaché</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Enregistré par</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Montant (FCFA)</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
                </TableCell>
              </TableRow>
            ) : data.transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500 font-medium">
                  Aucune transaction ne correspond à ces filtres.
                </TableCell>
              </TableRow>
            ) : (
              data.transactions.map((t) => {
                const isIncome = t.type === "INCOME";
                return (
                  <TableRow key={t.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50">
                    <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400 py-3.5">
                      {formatDateTime(t.createdAt)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-semibold ${isIncome ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"}`}
                      >
                        {CATEGORY_LABELS[t.category] || (isIncome ? "Encaissement" : "Dépense")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5 max-w-[280px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate" title={t.description}>{t.description}</span>
                        {t.pendingInvoice && t.pendingInvoice.status !== "PAID" && (
                          <PaymentStatusBadge status={t.pendingInvoice.status} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                      {t.patient?.user ? `${t.patient.user.lastName} ${t.patient.user.firstName}` : "-"}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                      {t.recordedBy ? `${t.recordedBy.firstName} ${t.recordedBy.lastName}` : "-"}
                    </TableCell>
                    <TableCell className={`text-right font-extrabold text-sm py-3.5 ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {isIncome ? "+" : "-"}{formatFCFA(t.amount)}
                    </TableCell>
                    <TableCell className="text-right py-3.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectTransaction(t)}
                        className="h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50/50 rounded-lg gap-1.5 text-xs font-medium"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Facture
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {data.totalCount} résultat{data.totalCount > 1 ? "s" : ""} au total
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-8 gap-1 rounded-lg text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Précédent
          </Button>
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            Page {page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages || loading}
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            className="h-8 gap-1 rounded-lg text-xs"
          >
            Suivant
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
