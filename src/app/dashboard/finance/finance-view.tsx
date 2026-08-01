"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Printer,
  Receipt,
  Package,
  ClipboardList,
  Activity,
  ArrowRight,
} from "lucide-react";
import PharmacyDialog from "./pharmacy-dialog";
import StockPurchaseDialog from "./stock-purchase-dialog";
import InventoryPanel from "./inventory-panel";
import InvoiceModal from "./invoice-modal";
import SaleInvoiceDialog from "./sale-invoice-dialog";
import ExpenseDialog from "./expense-dialog";

interface FinanceViewProps {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    cashBalance: number;
    todayIncome: number;
    todayExpenses: number;
    lowStockCount: number;
    transactions: any[];
    pharmacyItems: any[];
  };
  patients: any[];
  organizationId?: string;
  organizationName?: string;
  currentUserRole?: string;
}

export default function FinanceView({ summary, patients, organizationId, organizationName, currentUserRole }: FinanceViewProps) {
  const [selectedInvoiceTransaction, setSelectedInvoiceTransaction] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("journal");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "INCOME" | "EXPENSE" | "PHARMACY">("ALL");

  // ADMIN (holding) consulte la finance en lecture seule ; COORDINATOR/PHARMACIST gèrent.
  const canWrite = currentUserRole !== "ADMIN";

  const formatFCFA = (val: number) => {
    const num = Math.round(Number(val) || 0);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  };

  const formatDateTime = (dateInput: string | Date) => {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateInput));
  };

  // Filter transactions (Journal tab)
  const filteredTransactions = summary.transactions.filter((t) => {
    if (filterType === "INCOME" && t.type !== "INCOME") return false;
    if (filterType === "EXPENSE" && t.type !== "EXPENSE") return false;
    if (filterType === "PHARMACY" && t.category !== "PHARMACY_SALE") return false;

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const desc = (t.description || "").toLowerCase();
    const patientName = t.patient?.user ? `${t.patient.user.firstName} ${t.patient.user.lastName}`.toLowerCase() : "";
    const recorderName = t.recordedBy ? `${t.recordedBy.firstName} ${t.recordedBy.lastName}`.toLowerCase() : "";

    return desc.includes(q) || patientName.includes(q) || recorderName.includes(q);
  });

  // Recent activity preview (overview section)
  const recentTransactions = summary.transactions.slice(0, 5);

  // Stock alerts preview (overview section) — rupture/périmé en priorité, puis stock faible/péremption proche
  const now = new Date();
  const stockAlerts = summary.pharmacyItems
    .map((item) => {
      const isOutOfStock = item.stockQuantity <= 0;
      const isLowStock = !isOutOfStock && item.stockQuantity <= item.reorderLevel;
      const expDate = item.expiryDate ? new Date(item.expiryDate) : null;
      const isExpired = expDate ? expDate < now : false;
      const daysUntilExp = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : null;
      const isExpiringSoon = daysUntilExp !== null && daysUntilExp >= 0 && daysUntilExp <= 30;

      let severity: "critical" | "warning" | null = null;
      let reason = "";
      if (isOutOfStock) { severity = "critical"; reason = "Rupture de stock"; }
      else if (isExpired) { severity = "critical"; reason = "Périmé"; }
      else if (isLowStock) { severity = "warning"; reason = `Stock faible (${item.stockQuantity})`; }
      else if (isExpiringSoon) { severity = "warning"; reason = `Expire dans ${daysUntilExp}j`; }

      return severity ? { ...item, severity, reason } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up">
        {/* Solde de Caisse */}
        <Card className="rounded-2xl border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 text-emerald-500/20 pointer-events-none">
            <Wallet className="h-20 w-20 -mr-4 -mt-4" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Wallet className="h-4 w-4" />
              Solde de Caisse Actuel
            </CardDescription>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-1">
              {formatFCFA(summary.cashBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-emerald-700/80 dark:text-emerald-400/80 font-medium">
            Entrées totales : {formatFCFA(summary.totalIncome)}
          </CardContent>
        </Card>

        {/* Recettes du jour */}
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Recettes du Jour
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              +{formatFCFA(summary.todayIncome)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500 font-medium">
            Encaissements enregistrés aujourd&apos;hui
          </CardContent>
        </Card>

        {/* Dépenses du jour */}
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              Dépenses / Retraits du Jour
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              -{formatFCFA(summary.todayExpenses)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500 font-medium">
            Sorties de caisse aujourd&apos;hui
          </CardContent>
        </Card>

        {/* Alertes Stock Pharmacie */}
        <Card className={`rounded-2xl border ${summary.lowStockCount > 0 ? "border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20" : "border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60"} backdrop-blur-md shadow-xs`}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <AlertTriangle className={`h-4 w-4 ${summary.lowStockCount > 0 ? "text-amber-500 animate-pulse" : "text-slate-400"}`} />
              Alertes Stock Pharmacie
            </CardDescription>
            <CardTitle className={`text-2xl font-bold mt-1 ${summary.lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
              {summary.lowStockCount} {summary.lowStockCount > 1 ? "produits" : "produit"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500 font-medium">
            {summary.lowStockCount > 0 ? "Stock faible ou rupture imminente !" : "Tous les stocks sont suffisants"}
          </CardContent>
        </Card>
      </div>

      {/* Primary actions */}
      {canWrite && (
        <div className="flex flex-wrap gap-3 animate-fade-up">
          <SaleInvoiceDialog
            pharmacyItems={summary.pharmacyItems}
            patients={patients}
            organizationId={organizationId}
            onSuccess={setSelectedInvoiceTransaction}
          />
          <ExpenseDialog organizationId={organizationId} onSuccess={setSelectedInvoiceTransaction} />
        </div>
      )}

      {/* Overview: recent activity + stock alerts */}
      <div className="grid gap-6 lg:grid-cols-2 animate-fade-up">
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Activité récente
              </CardTitle>
              <CardDescription className="text-xs">Derniers mouvements de caisse enregistrés.</CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("journal")}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent className="pt-2">
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Aucun mouvement enregistré pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((t) => {
                  const isIncome = t.type === "INCOME";
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{t.description}</p>
                        <p className="text-[10px] text-slate-400">{formatDateTime(t.createdAt)}</p>
                      </div>
                      <span className={`font-bold shrink-0 ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {isIncome ? "+" : "-"}{formatFCFA(t.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-amber-200/50 dark:border-amber-900/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertes stock
              </CardTitle>
              <CardDescription className="text-xs">Ruptures, stock faible et péremptions proches.</CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("pharmacie")}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent className="pt-2">
            {stockAlerts.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Rien à signaler, tous les stocks sont suffisants.</p>
            ) : (
              <div className="space-y-3">
                {stockAlerts.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{item.name}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${item.severity === "critical" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}
                    >
                      {item.reason}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800/60 pb-3">
          <TabsList className="bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
            <TabsTrigger value="journal" className="rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
              <Receipt className="h-4 w-4 text-blue-500" />
              Journal de Caisse ({summary.transactions.length})
            </TabsTrigger>
            <TabsTrigger value="pharmacie" className="rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
              <Package className="h-4 w-4 text-indigo-500" />
              Stock Pharmacie ({summary.pharmacyItems.length})
            </TabsTrigger>
            <TabsTrigger value="inventaire" className="rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
              <ClipboardList className="h-4 w-4 text-rose-500" />
              Inventaire
            </TabsTrigger>
          </TabsList>

          {activeTab === "pharmacie" && canWrite && (
            <div className="flex gap-2">
              <StockPurchaseDialog pharmacyItems={summary.pharmacyItems} organizationId={organizationId} />
              <PharmacyDialog organizationId={organizationId} />
            </div>
          )}
        </div>

        {/* TAB: Journal de Caisse & Historique */}
        <TabsContent value="journal" className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Rechercher par motif, patient ou caissier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2.5 h-10 rounded-xl"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "ALL" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-500"}`}
              >
                Tous ({summary.transactions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("INCOME")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "INCOME" ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xs" : "text-slate-500"}`}
              >
                Encaissements (+)
              </button>
              <button
                type="button"
                onClick={() => setFilterType("EXPENSE")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "EXPENSE" ? "bg-white dark:bg-slate-900 text-rose-600 shadow-xs" : "text-slate-500"}`}
              >
                Dépenses (-)
              </button>
              <button
                type="button"
                onClick={() => setFilterType("PHARMACY")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "PHARMACY" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs" : "text-slate-500"}`}
              >
                Ventes Pharmacie
              </button>
            </div>
          </div>

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
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500 font-medium">
                      Aucune transaction trouvée.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((t) => {
                    const isIncome = t.type === "INCOME";
                    const isPharmacy = t.category === "PHARMACY_SALE";

                    return (
                      <TableRow key={t.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50">
                        <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400 py-3.5">
                          {formatDateTime(t.createdAt)}
                        </TableCell>
                        <TableCell className="py-3.5">
                          {isIncome ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[11px] font-semibold">
                              {isPharmacy ? "Vente Pharmacie" : "Encaissement"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 text-[11px] font-semibold">
                              Dépense / Retrait
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5 max-w-[280px] truncate" title={t.description}>
                          {t.description}
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
                            onClick={() => setSelectedInvoiceTransaction(t)}
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
        </TabsContent>

        {/* TAB: Stock Pharmacie & Alertes */}
        <TabsContent value="pharmacie" className="pt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xs">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Produit / Médicament</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Dosage & Emplacement</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">N° Lot & Péremption</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Prix unitaire (FCFA)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Stock actuel</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">État & Traçabilité</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.pharmacyItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500 font-medium">
                      Aucun produit en stock. Cliquez sur &quot;Nouveau produit&quot; pour ajouter des médicaments.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.pharmacyItems.map((item) => {
                    const isOutOfStock = item.stockQuantity <= 0;
                    const isLowStock = item.stockQuantity <= item.reorderLevel;

                    const expDate = item.expiryDate ? new Date(item.expiryDate) : null;
                    const isExpired = expDate ? expDate < now : false;
                    const daysUntilExp = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : null;
                    const isExpiringSoon = daysUntilExp !== null && daysUntilExp >= 0 && daysUntilExp <= 30;

                    return (
                      <TableRow key={item.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50">
                        <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4" />
                            </div>
                            <div>
                              <span>{item.name}</span>
                              {item.supplier && (
                                <p className="text-[10px] text-slate-400 font-normal">Fournisseur: {item.supplier}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                          <div>{item.dosage || "-"}</div>
                          {item.location && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">{item.location}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                          {item.batchNumber ? (
                            <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 block">{item.batchNumber}</span>
                          ) : (
                            <span className="text-slate-400 block">-</span>
                          )}
                          {expDate ? (
                            <span className={`text-[10px] ${isExpired ? "text-rose-600 font-bold" : isExpiringSoon ? "text-amber-600 font-bold" : "text-slate-500"}`}>
                              Exp: {new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(expDate)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Pas de date</span>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-slate-800 dark:text-slate-200 py-3.5">
                          {formatFCFA(item.unitPrice)}
                        </TableCell>
                        <TableCell className="font-extrabold py-3.5">
                          {item.stockQuantity} unités
                        </TableCell>
                        <TableCell className="py-3.5 space-y-1">
                          {isOutOfStock ? (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 gap-1 text-[11px]">
                              <XCircle className="h-3 w-3" />
                              Rupture de stock
                            </Badge>
                          ) : isLowStock ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 text-[11px]">
                              <AlertTriangle className="h-3 w-3" />
                              Stock faible ({item.reorderLevel})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" />
                              En stock
                            </Badge>
                          )}

                          {isExpired ? (
                            <Badge variant="outline" className="bg-rose-600 text-white border-rose-600 gap-1 text-[10px] font-bold block w-fit">
                              ⚠️ Périmé !
                            </Badge>
                          ) : isExpiringSoon ? (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 text-[10px] font-bold block w-fit">
                              ⏳ Péremption ({daysUntilExp}j)
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right py-3.5">
                          {canWrite && <PharmacyDialog item={item} organizationId={organizationId} />}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB: Inventaire (comptage physique vs stock système) */}
        <TabsContent value="inventaire" className="pt-6 space-y-4">
          <InventoryPanel organizationId={organizationId} canWrite={canWrite} />
        </TabsContent>
      </Tabs>

      {/* Invoice Modal for Printable Receipt & PDF */}
      <InvoiceModal
        transaction={selectedInvoiceTransaction}
        organizationName={organizationName}
        open={!!selectedInvoiceTransaction}
        onOpenChange={(open) => !open && setSelectedInvoiceTransaction(null)}
      />
    </div>
  );
}
