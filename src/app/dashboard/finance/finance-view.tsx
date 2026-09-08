"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Receipt,
  PieChart,
  Activity,
  ArrowRight,
  History,
  CircleDot,
  Circle,
  Coins,
  Pill,
  FlaskConical,
  Stethoscope,
} from "lucide-react";
import InvoiceModal from "./invoice-modal";
import ZReportDownloadButton from "./z-report-download-button";
import FinanceJournal, { TRANSACTION_CATEGORY_LABELS } from "./finance-journal";

// Icône + couleur par catégorie facturable — utilisées pour les cartes "Répartition des
// revenus"/"Répartition du bénéfice" (une carte par catégorie, même gabarit que les KPI du
// haut). Les classes Tailwind sont écrites en toutes lettres (jamais interpolées) pour rester
// détectables par le scan statique du build.
const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PHARMACY_SALE: Pill,
  LAB_EXAM_FEE: FlaskConical,
  SERVICE_FEE: Stethoscope,
};
const CATEGORY_COLOR: Record<string, string> = {
  PHARMACY_SALE: "indigo",
  LAB_EXAM_FEE: "violet",
  SERVICE_FEE: "sky",
};

const COLOR_THEME: Record<
  string,
  { cardClass: string; iconOverlayClass: string; labelClass: string; titleClass: string; subtitleClass: string }
> = {
  indigo: {
    cardClass: "rounded-2xl border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent dark:from-indigo-950/40 shadow-xs relative overflow-hidden",
    iconOverlayClass: "absolute top-0 right-0 p-4 text-indigo-500/20 pointer-events-none",
    labelClass: "text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5",
    titleClass: "text-2xl sm:text-3xl font-extrabold text-indigo-900 dark:text-indigo-100 mt-1",
    subtitleClass: "pt-0 text-xs text-indigo-700/80 dark:text-indigo-400/80 font-medium",
  },
  violet: {
    cardClass: "rounded-2xl border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent dark:from-violet-950/40 shadow-xs relative overflow-hidden",
    iconOverlayClass: "absolute top-0 right-0 p-4 text-violet-500/20 pointer-events-none",
    labelClass: "text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400 flex items-center gap-1.5",
    titleClass: "text-2xl sm:text-3xl font-extrabold text-violet-900 dark:text-violet-100 mt-1",
    subtitleClass: "pt-0 text-xs text-violet-700/80 dark:text-violet-400/80 font-medium",
  },
  sky: {
    cardClass: "rounded-2xl border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent dark:from-sky-950/40 shadow-xs relative overflow-hidden",
    iconOverlayClass: "absolute top-0 right-0 p-4 text-sky-500/20 pointer-events-none",
    labelClass: "text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1.5",
    titleClass: "text-2xl sm:text-3xl font-extrabold text-sky-900 dark:text-sky-100 mt-1",
    subtitleClass: "pt-0 text-xs text-sky-700/80 dark:text-sky-400/80 font-medium",
  },
  emerald: {
    cardClass: "rounded-2xl border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 shadow-xs relative overflow-hidden",
    iconOverlayClass: "absolute top-0 right-0 p-4 text-emerald-500/20 pointer-events-none",
    labelClass: "text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5",
    titleClass: "text-2xl sm:text-3xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-1",
    subtitleClass: "pt-0 text-xs text-emerald-700/80 dark:text-emerald-400/80 font-medium",
  },
  rose: {
    cardClass: "rounded-2xl border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 shadow-xs relative overflow-hidden",
    iconOverlayClass: "absolute top-0 right-0 p-4 text-rose-500/20 pointer-events-none",
    labelClass: "text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5",
    titleClass: "text-2xl sm:text-3xl font-extrabold text-rose-900 dark:text-rose-100 mt-1",
    subtitleClass: "pt-0 text-xs text-rose-700/80 dark:text-rose-400/80 font-medium",
  },
  slate: {
    cardClass: "rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs relative overflow-hidden",
    iconOverlayClass: "absolute top-0 right-0 p-4 text-slate-400/10 pointer-events-none",
    labelClass: "text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5",
    titleClass: "text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1",
    subtitleClass: "pt-0 text-xs text-slate-500 font-medium",
  },
};

function CategoryStatCard({
  icon: Icon,
  color,
  label,
  amount,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: React.ReactNode;
  amount: string;
  subtitle: React.ReactNode;
}) {
  const theme = COLOR_THEME[color] || COLOR_THEME.slate;
  return (
    <Card className={theme.cardClass}>
      <div className={theme.iconOverlayClass}>
        <Icon className="h-20 w-20 -mr-4 -mt-4" />
      </div>
      <CardHeader className="pb-2">
        <CardDescription className={theme.labelClass}>
          <Icon className="h-4 w-4" />
          {label}
        </CardDescription>
        <CardTitle className={theme.titleClass}>{amount}</CardTitle>
      </CardHeader>
      <CardContent className={theme.subtitleClass}>{subtitle}</CardContent>
    </Card>
  );
}

// Carte "bénéfice" — contrairement à CategoryStatCard (un seul chiffre en avant), montre le
// détail du calcul avant le résultat : prix de vente total, puis prix d'achat total, puis le
// bénéfice (revenu - coût) en évidence, pour que la marge ne soit jamais un chiffre "sorti de
// nulle part".
function ProfitBreakdownCard({
  icon: Icon,
  color,
  label,
  revenue,
  cost,
  profit,
  footer,
  formatFCFA,
  soldCost,
  soldProfit,
  todaySoldProfit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: React.ReactNode;
  revenue: number;
  cost: number;
  profit: number;
  footer: React.ReactNode;
  formatFCFA: (val: number) => string;
  // Second calcul, Médicament uniquement : coût des seules unités déjà vendues plutôt que des
  // achats de la période — cf. getFinanceSummary. Absent pour les autres catégories.
  soldCost?: number;
  soldProfit?: number;
  todaySoldProfit?: number;
}) {
  const theme = COLOR_THEME[color] || COLOR_THEME.slate;
  return (
    <Card className={theme.cardClass}>
      <div className={theme.iconOverlayClass}>
        <Icon className="h-20 w-20 -mr-4 -mt-4" />
      </div>
      <CardHeader className="pb-2">
        <CardDescription className={theme.labelClass}>
          <Icon className="h-4 w-4" />
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Prix de vente total</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{formatFCFA(revenue)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Prix d&apos;achat total</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{formatFCFA(cost)}</span>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Bénéfice</span>
          <span className={`text-xl font-extrabold ${color === "rose" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {formatFCFA(profit)}
          </span>
        </div>
        <div className="text-[11px] text-slate-400">{footer}</div>

        {soldProfit !== undefined && (
          <div className="pt-2 mt-1.5 border-t border-dashed border-slate-200/60 dark:border-slate-800/60 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Coût des ventes réalisées</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{formatFCFA(soldCost || 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Bénéfice sur ventes réalisées</span>
              <span className={`text-lg font-extrabold ${soldProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {formatFCFA(soldProfit)}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Basé sur le coût des unités déjà vendues (pas les achats de la période)
              {!!todaySoldProfit && <> · {todaySoldProfit > 0 ? "+" : ""}{formatFCFA(todaySoldProfit)} auj.</>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CashSessionRow {
  id: string;
  registerName: string;
  status: string;
  openedAt: string | Date;
  openedBy: { firstName: string; lastName: string } | null;
  openingFloat: number;
  closedAt: string | Date | null;
  closedBy: { firstName: string; lastName: string } | null;
  countedAmount: number | null;
  notes: string | null;
  totalIncome: number;
  totalExpenses: number;
  expectedAmount: number;
  variance: number | null;
  transactionCount: number;
}

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
    revenueByCategory?: { category: string; totalIncome: number; todayIncome: number }[];
    profitByCategory?: {
      category: string;
      revenue: number;
      cost: number;
      profit: number;
      todayRevenue: number;
      todayCost: number;
      todayProfit: number;
      soldCost?: number;
      soldProfit?: number;
      todaySoldCost?: number;
      todaySoldProfit?: number;
    }[];
  };
  organizationId?: string;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  currentUserRole?: string;
  sessions?: CashSessionRow[];
  valuation?: {
    totalCostValue: number;
    totalSaleValue: number;
    potentialMargin: number;
    byCategory: { category: string; costValue: number; saleValue: number }[];
    byLocation: { location: string; costValue: number; saleValue: number }[];
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  MEDICATION: "Médicaments",
  CONSUMABLE: "Consommables",
  EQUIPMENT: "Matériel médical",
};

export default function FinanceView({ summary, organizationId, organizationName, organizationLogoUrl, currentUserRole, sessions = [], valuation }: FinanceViewProps) {
  const [selectedInvoiceTransaction, setSelectedInvoiceTransaction] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("journal");

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

  const pharmacieHref = organizationId ? `/dashboard/clinics/${organizationId}/pharmacie` : "/dashboard/pharmacie";

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

      {/* Répartition des revenus par catégorie — une carte par catégorie facturable (même gabarit
          que les KPI du haut), calculée côté serveur sur l'ensemble des transactions (pas
          seulement l'aperçu récent), pour rester exacte quel que soit le volume de la clinique. */}
      {summary.revenueByCategory && summary.revenueByCategory.length > 0 && (
        <div className="space-y-2 animate-fade-up">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
            <PieChart className="h-4 w-4 text-indigo-500" />
            Répartition des revenus
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary.revenueByCategory.map((c) => {
              const pct = summary.totalIncome > 0 ? Math.round((c.totalIncome / summary.totalIncome) * 100) : 0;
              return (
                <CategoryStatCard
                  key={c.category}
                  icon={CATEGORY_ICON[c.category] || PieChart}
                  color={CATEGORY_COLOR[c.category] || "slate"}
                  label={TRANSACTION_CATEGORY_LABELS[c.category] || c.category}
                  amount={formatFCFA(c.totalIncome)}
                  subtitle={
                    <>
                      {pct}% du chiffre d&apos;affaires
                      {c.todayIncome > 0 && <> · +{formatFCFA(c.todayIncome)} aujourd&apos;hui</>}
                    </>
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Bénéfice par catégorie — marge simple (revenu - achats/coûts de la même période, pas le
          coût exact de chaque vente individuelle, cf. décision produit). Couleur par signe
          (emerald = bénéfice, rose = perte) plutôt que par catégorie, pour repérer la
          rentabilité d'un coup d'œil ; l'icône reste propre à chaque catégorie. */}
      {summary.profitByCategory && summary.profitByCategory.length > 0 && (() => {
        const totalProfit = summary.profitByCategory.reduce((sum, c) => sum + c.profit, 0);
        return (
          <div className="space-y-2 animate-fade-up">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
              <Coins className="h-4 w-4 text-emerald-500" />
              Répartition du bénéfice
              <span className="text-xs font-normal text-slate-400">— total : {formatFCFA(totalProfit)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.profitByCategory.map((c) => {
                const marginRate = c.revenue > 0 ? Math.round((c.profit / c.revenue) * 100) : 0;
                const isNegative = c.profit < 0;
                // Une "part du bénéfice total" n'a de sens que si le total ET cette catégorie
                // sont tous deux positifs — sinon le ratio devient un nombre incompréhensible
                // (ex : une catégorie en perte rapportée à un total lui-même négatif affiche un
                // pourcentage POSITIF d'une perte). On l'omet plutôt que d'afficher ça.
                const share = totalProfit > 0 && c.profit >= 0 ? Math.round((c.profit / totalProfit) * 100) : null;
                // Pour le médicament, un "bénéfice" négatif signifie le plus souvent que du stock
                // a été acheté mais pas encore vendu (marge simple = achats de la période, pas le
                // coût des seules ventes) — pas une perte réelle. On le précise, avec la valeur
                // du stock actuellement en rayon quand elle est disponible.
                const isLikelyUnsoldStock = isNegative && c.category === "PHARMACY_SALE";
                return (
                  <ProfitBreakdownCard
                    key={c.category}
                    icon={CATEGORY_ICON[c.category] || PieChart}
                    color={isNegative ? "rose" : "emerald"}
                    label={TRANSACTION_CATEGORY_LABELS[c.category] || c.category}
                    revenue={c.revenue}
                    cost={c.cost}
                    profit={c.profit}
                    formatFCFA={formatFCFA}
                    soldCost={c.soldCost}
                    soldProfit={c.soldProfit}
                    todaySoldProfit={c.todaySoldProfit}
                    footer={
                      <>
                        {isLikelyUnsoldStock ? (
                          <>
                            Achats supérieurs aux ventes de la période : probablement du stock pas
                            encore vendu, pas une perte réelle
                            {valuation && <> (stock actuel en valeur : {formatFCFA(valuation.totalCostValue)})</>}.
                          </>
                        ) : (
                          <>Marge {marginRate}%{share !== null && <> · {share}% du bénéfice total</>}</>
                        )}
                        {c.todayProfit !== 0 && (
                          <> · {c.todayProfit > 0 ? "+" : ""}{formatFCFA(c.todayProfit)} auj.</>
                        )}
                      </>
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })()}

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
            <Link
              href={pharmacieHref}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
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
          <TabsList className="bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl h-auto flex-wrap justify-start">
            <TabsTrigger value="journal" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <Receipt className="h-4 w-4 text-blue-500" />
              Journal de Caisse
            </TabsTrigger>
            <TabsTrigger value="rapports" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <History className="h-4 w-4 text-purple-500" />
              Rapport de Caisse ({sessions.length})
            </TabsTrigger>
            <TabsTrigger value="valorisation" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <PieChart className="h-4 w-4 text-indigo-500" />
              Valorisation
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB: Journal de Caisse — recherche, filtres et pagination gérés côté serveur pour ne
            jamais masquer de mouvements au-delà d'un plafond (cf. finance-journal.tsx). */}
        <TabsContent value="journal" className="pt-6">
          <FinanceJournal organizationId={organizationId} onSelectTransaction={setSelectedInvoiceTransaction} />
        </TabsContent>

        {/* TAB: Rapport de Caisse (ouvertures/fermetures de session) */}
        <TabsContent value="rapports" className="pt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xs">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Caisse</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Ouverture</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Fermeture</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Fond initial</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Encaiss. / Dép.</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Théorique</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Compté</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Écart</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-slate-500 font-medium">
                      Aucune session de caisse enregistrée pour le moment.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => (
                    <TableRow key={s.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {s.status === "OPEN" ? (
                            <CircleDot className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          )}
                          {s.registerName}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400 py-3.5">
                        <div>{formatDateTime(s.openedAt)}</div>
                        <div className="text-[10px] text-slate-400">
                          {s.openedBy ? `${s.openedBy.firstName} ${s.openedBy.lastName}` : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400 py-3.5">
                        {s.closedAt ? (
                          <>
                            <div>{formatDateTime(s.closedAt)}</div>
                            <div className="text-[10px] text-slate-400">
                              {s.closedBy ? `${s.closedBy.firstName} ${s.closedBy.lastName}` : "-"}
                            </div>
                          </>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-semibold">
                            En cours
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-700 dark:text-slate-300 py-3.5">
                        {formatFCFA(s.openingFloat)}
                      </TableCell>
                      <TableCell className="text-right py-3.5 text-xs">
                        <div className="text-emerald-600 dark:text-emerald-400 font-semibold">+{formatFCFA(s.totalIncome)}</div>
                        <div className="text-rose-600 dark:text-rose-400 font-semibold">-{formatFCFA(s.totalExpenses)}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                        {formatFCFA(s.expectedAmount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                        {s.countedAmount != null ? formatFCFA(s.countedAmount) : "-"}
                      </TableCell>
                      <TableCell className="text-right py-3.5">
                        {s.variance == null ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className={`font-extrabold text-sm ${s.variance === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {s.variance > 0 ? "+" : ""}{formatFCFA(s.variance)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-3.5">
                        {s.status === "CLOSED" ? (
                          <ZReportDownloadButton
                            sessionId={s.id}
                            registerName={s.registerName}
                            organizationName={organizationName}
                            organizationLogoUrl={organizationLogoUrl}
                          />
                        ) : (
                          <span className="text-[11px] text-slate-400">Session ouverte</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB: Valorisation du stock */}
        <TabsContent value="valorisation" className="pt-6 space-y-4">
          {valuation ? (
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Valorisation du stock</CardTitle>
                <CardDescription>Valeur au coût d&apos;achat (FEFO par lot) et à la vente, par catégorie et par emplacement.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Valeur au coût</p>
                    <p className="text-lg font-extrabold">{formatFCFA(valuation.totalCostValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Valeur à la vente</p>
                    <p className="text-lg font-extrabold">{formatFCFA(valuation.totalSaleValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Marge potentielle</p>
                    <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{formatFCFA(valuation.potentialMargin)}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Par catégorie</p>
                    <div className="space-y-1">
                      {valuation.byCategory.map((c) => (
                        <div key={c.category} className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 dark:text-slate-400">{CATEGORY_LABELS[c.category] || c.category}</span>
                          <span className="font-semibold">{formatFCFA(c.costValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Par emplacement</p>
                    <div className="space-y-1">
                      {valuation.byLocation.map((l) => (
                        <div key={l.location} className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 dark:text-slate-400">{l.location}</span>
                          <span className="font-semibold">{formatFCFA(l.costValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                Valorisation du stock indisponible.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <InvoiceModal
        transaction={selectedInvoiceTransaction}
        organizationName={organizationName}
        organizationLogoUrl={organizationLogoUrl}
        open={!!selectedInvoiceTransaction}
        onOpenChange={(open) => !open && setSelectedInvoiceTransaction(null)}
      />
    </div>
  );
}
