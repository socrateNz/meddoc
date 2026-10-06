"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PaginationNav } from "@/components/ui/pagination-nav";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FlaskConical,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Settings,
  Zap,
  Kanban,
  List,
  Search,
  User,
  ShieldAlert,
  ArrowRight,
  Filter,
} from "lucide-react";
import NewLabOrderDialog from "./new-lab-order-dialog";
import PaymentStatusBadge from "@/components/payment-status-badge";

function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PRESCRIBED: { label: "Prescrit", className: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20" },
  SAMPLE_COLLECTED: { label: "Échantillon prélevé", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20" },
  RECEIVED_AT_LAB: { label: "Reçu au labo", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" },
  IN_ANALYSIS: { label: "En cours d'analyse", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20" },
  TO_VALIDATE: { label: "À valider", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  VALIDATED: { label: "Validé", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  DELIVERED: { label: "Livré", className: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20" },
  CANCELLED: { label: "Annulé", className: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20" },
};

const PENDING_STATUSES = ["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB"];

export interface LabStats {
  pending: number;
  inAnalysis: number;
  toValidate: number;
  validatedToday: number;
  urgent: number;
  critical: number;
  open: number;
}

interface LabViewProps {
  // Une page de demandes (20 au plus), filtrée côté serveur par `query`.
  labOrders: any[];
  total: number;
  page: number;
  pageSize: number;
  // Indicateurs calculés en base sur tout le périmètre (pas sur la page affichée).
  stats: LabStats;
  // Paramètres d'URL courants (recherche q, filtre urgent) : conservés lors du changement de page.
  query: Record<string, string | undefined>;
  pathname: string;
  patients: any[];
  currentUserRole?: string;
  // Pour la réplication du catalogue hors-ligne (cf. new-lab-order-dialog.tsx) — absent sur la
  // vue globale holding (patients de plusieurs cliniques à la fois, aucun établissement unique).
  organizationId?: string;
}

export default function LabView({ labOrders, total, page, pageSize, stats, query, pathname, patients, currentUserRole, organizationId }: LabViewProps) {
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const router = useRouter();
  // Recherche et filtre « urgences » sont dans l'URL : chaque requête part au serveur, qui filtre
  // toutes les demandes avant de paginer. Le champ garde sa valeur localement pour rester fluide.
  const [searchQuery, setSearchQuery] = useState(query.q ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urgentOnly = query.urgent === "1";

  const navigate = (changes: Record<string, string | undefined>) => {
    // Tout changement de filtre revient à la première page.
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes, page: undefined })) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ q: value.trim() || undefined }), 300);
  };

  const canWrite = currentUserRole !== "ADMIN";
  const isCoordinator = currentUserRole === "COORDINATOR";

  // La page affichée est déjà filtrée par le serveur.
  const filteredOrders = labOrders;

  // Kanban Columns
  const kanbanColumns = useMemo(() => {
    const col1 = filteredOrders.filter((o) => PENDING_STATUSES.includes(o.status));
    const col2 = filteredOrders.filter((o) => o.status === "IN_ANALYSIS");
    const col3 = filteredOrders.filter((o) => o.status === "TO_VALIDATE");
    const col4 = filteredOrders.filter((o) => o.status === "VALIDATED" || o.status === "DELIVERED");

    return [
      {
        id: "pending",
        title: "1. Prescriptions & Prélèvements",
        subtitle: "En attente d'acheminement",
        badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
        headerBorder: "border-t-blue-500",
        orders: col1,
      },
      {
        id: "analysis",
        title: "2. En cours d'analyse",
        subtitle: "Traitements automate / paillasse",
        badgeColor: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
        headerBorder: "border-t-violet-500",
        orders: col2,
      },
      {
        id: "validate",
        title: "3. À valider biologiste",
        subtitle: "Revue & approbation médicale",
        badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
        headerBorder: "border-t-amber-500",
        orders: col3,
      },
      {
        id: "completed",
        title: "4. Validés & Livrés",
        subtitle: "Résultats disponibles au médecin",
        badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
        headerBorder: "border-t-emerald-500",
        orders: col4,
      },
    ];
  }, [filteredOrders]);

  return (
    <div className="space-y-6">
      {/* 1. LIMS Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 animate-fade-up">
        <Card className="rounded-2xl border-border/70 shadow-xs">
          <CardContent className="py-3.5 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">En attente</p>
            <p className="text-2xl font-extrabold mt-1 text-foreground">{stats.pending}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-xs">
          <CardContent className="py-3.5 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">En analyse</p>
            <p className="text-2xl font-extrabold mt-1 text-violet-600 dark:text-violet-400">{stats.inAnalysis}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-amber-300/60 dark:border-amber-900/40 shadow-xs">
          <CardContent className="py-3.5 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">À valider</p>
            <p className="text-2xl font-extrabold mt-1 text-amber-600">{stats.toValidate}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-emerald-300/60 dark:border-emerald-900/40 shadow-xs">
          <CardContent className="py-3.5 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Validés (24h)</p>
            <p className="text-2xl font-extrabold mt-1 text-emerald-600">{stats.validatedToday}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-blue-300/60 dark:border-blue-900/40 shadow-xs">
          <CardContent className="py-3.5 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
              <Zap className="h-3 w-3" /> Urgents
            </p>
            <p className="text-2xl font-extrabold mt-1 text-blue-600">{stats.urgent}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-2xl shadow-xs ${stats.critical > 0 ? "border-red-400/60 dark:border-red-900/50 bg-red-500/5" : "border-border/70"}`}>
          <CardContent className="py-3.5 px-4">
            <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${stats.critical > 0 ? "text-red-600 font-extrabold" : "text-muted-foreground"}`}>
              <AlertTriangle className="h-3 w-3" /> Critiques
            </p>
            <p className={`text-2xl font-extrabold mt-1 ${stats.critical > 0 ? "text-red-600 animate-pulse" : "text-foreground"}`}>
              {stats.critical}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Controls & Search Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card border border-border/70 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher patient, analyse (NFS, CRP...), médecin..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 pr-4 h-10 text-xs bg-muted/20 border-border/70 focus-visible:bg-background"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Urgent / Critical Quick Toggle */}
          <button
            type="button"
            onClick={() => navigate({ urgent: urgentOnly ? undefined : "1" })}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 ${
              urgentOnly
                ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
                : "border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            Urgences & Critiques
          </button>

          {/* Catalog link */}
          {isCoordinator && (
            <Link href="/dashboard/lab/catalog">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs rounded-xl border-border/70">
                <Settings className="h-3.5 w-3.5" />
                Catalogue
              </Button>
            </Link>
          )}

          {/* New lab order button */}
          {canWrite && <NewLabOrderDialog patients={patients} organizationId={organizationId} />}

          {/* View mode toggle */}
          <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "kanban" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Vue Pipeline LIMS (Kanban)"
            >
              <Kanban className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "list" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Vue Liste"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Empty State */}
      {filteredOrders.length === 0 && (
        <Card className="rounded-2xl border-border/70">
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-base font-bold text-foreground">Aucune demande d&apos;analyse trouvée</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Aucun examen de laboratoire ne correspond aux critères de recherche actuels.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4. Kanban Pipeline View (LIMS) */}
      {viewMode === "kanban" && filteredOrders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {kanbanColumns.map((col) => (
            <div
              key={col.id}
              className={`rounded-2xl bg-muted/20 border border-border/70 border-t-4 ${col.headerBorder} p-3.5 space-y-3 min-h-[500px] flex flex-col`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">{col.title}</h4>
                  <p className="text-[10px] text-muted-foreground">{col.subtitle}</p>
                </div>
                <Badge variant="outline" className={`${col.badgeColor} font-bold text-xs px-2 py-0.5`}>
                  {col.orders.length}
                </Badge>
              </div>

              {/* Cards list in column */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {col.orders.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground/60 border border-dashed border-border/60 rounded-xl">
                    Aucune analyse dans cette étape
                  </div>
                ) : (
                  col.orders.map((order) => {
                    const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.PRESCRIBED;
                    const hasCritical = (order.results || []).some((r: any) => r.isAbnormal && !r.validatedAt);
                    const isUrgent = order.priority === "URGENT";

                    return (
                      <Link key={order.id} href={`/dashboard/lab/${order.id}`}>
                        <div
                          className={`
                            p-4 rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer space-y-2.5 hover:border-primary/40 group relative overflow-hidden
                            ${hasCritical ? "border-red-400/80 dark:border-red-900/60 bg-red-500/5 shadow-xs" : "border-border/70 shadow-xs"}
                            ${isUrgent && !hasCritical ? "border-amber-300/70 dark:border-amber-800/60" : ""}
                          `}
                        >
                          {/* Priority / Critical badges */}
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isUrgent && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                                  <Zap className="h-3 w-3" /> URGENT
                                </span>
                              )}
                              {hasCritical && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 text-[10px] font-bold animate-pulse">
                                  <AlertTriangle className="h-3 w-3" /> CRITIQUE
                                </span>
                              )}
                            </div>

                            {order.pendingInvoice && (
                              <PaymentStatusBadge status={order.pendingInvoice.status} className="text-[10px]" />
                            )}
                          </div>

                          {/* Patient name */}
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                              {order.patient?.user?.lastName?.[0] || "P"}
                            </div>
                            <span className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {order.patient?.user ? `${order.patient.user.lastName} ${order.patient.user.firstName}` : "Patient"}
                            </span>
                          </div>

                          {/* Tests list */}
                          <div className="flex flex-wrap gap-1">
                            {order.tests.map((t: string) => (
                              <Badge key={t} variant="outline" className="text-[10px] py-0 px-1.5 bg-muted/40 font-medium">
                                {t}
                              </Badge>
                            ))}
                          </div>

                          {/* Footer */}
                          <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="truncate">
                              Dr. {order.orderedBy?.lastName || "Médecin"}
                            </span>
                            <span className="flex items-center gap-0.5 text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                              Voir <ChevronRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. List View */}
      {viewMode === "list" && filteredOrders.length > 0 && (
        <div className="grid gap-2.5">
          {filteredOrders.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.PRESCRIBED;
            const hasCritical = (order.results || []).some((r: any) => r.isAbnormal && !r.validatedAt);
            const isUrgent = order.priority === "URGENT";

            return (
              <Link key={order.id} href={`/dashboard/lab/${order.id}`}>
                <Card
                  className={`rounded-2xl hover:shadow-md transition-shadow cursor-pointer ${
                    hasCritical ? "border-red-400/80 dark:border-red-900/60 bg-red-500/5" : "border-border/70"
                  }`}
                >
                  <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                          {order.patient?.user?.lastName?.[0] || "P"}
                        </div>
                        <p className="font-bold text-sm text-foreground">
                          {order.patient?.user ? `${order.patient.user.lastName} ${order.patient.user.firstName}` : "Patient"}
                        </p>
                        {isUrgent && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-bold">
                            <Zap className="h-3 w-3" /> Urgent
                          </Badge>
                        )}
                        {hasCritical && (
                          <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30 text-[10px] gap-1 animate-pulse font-bold">
                            <AlertTriangle className="h-3 w-3" /> Critique
                          </Badge>
                        )}
                        {order.pendingInvoice && <PaymentStatusBadge status={order.pendingInvoice.status} className="text-[10px]" />}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {order.tests.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-[10px] font-medium">
                            {t}
                          </Badge>
                        ))}
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Prescrit par {order.orderedBy?.firstName} {order.orderedBy?.lastName} • {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="outline" className={statusInfo.className}>
                        {statusInfo.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <PaginationNav
        page={page}
        pageSize={pageSize}
        total={total}
        pathname={pathname}
        query={query}
        itemLabel="demande"
      />
    </div>
  );
}
