"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  Printer,
  Loader2,
  CircleDot,
  Circle,
  Landmark,
  AlertCircle,
  ArrowRight,
  Search,
  History,
  CheckCircle2,
  Clock,
  UserCog,
  Filter,
} from "lucide-react";
import PaymentStatusBadge from "@/components/payment-status-badge";
import { listRegistersWithStatus, openRegisterSession, getSessionSummary, closeRegisterSession, correctOpeningFloat } from "@/actions/registers";
import { listPendingInvoices, listCaisseHistoryInvoices } from "@/actions/finance";
import { OpenSessionDialog, CloseSessionDialog, CreateRegisterDialog, EditOpeningFloatDialog } from "./register-session-dialogs";
import CaisseCartDialog from "./caisse-cart-dialog";
import CaisseExpenseDialog from "./caisse-expense-dialog";
import RecordPaymentDialog from "./record-payment-dialog";
import CloseInvoiceDialog from "./close-invoice-dialog";
import { EditInvoiceClientDialog } from "./edit-invoice-client-dialog";
import { EditInvoiceStatusDialog } from "./edit-invoice-status-dialog";
import { DeleteInvoiceDialog } from "./delete-invoice-dialog";
import InvoiceModal from "@/app/dashboard/finance/invoice-modal";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

function formatDateTime(d: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

interface RegisterRow {
  id: string;
  name: string;
  isActive: boolean;
  openSession: { id: string; openedAt: string; openingFloat: number; openedBy: { firstName: string; lastName: string } } | null;
}

interface CaisseViewProps {
  initialRegisters: RegisterRow[];
  initialHistory?: any[];
  initialHistoryTotal?: number;
  organizationId: string;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  currentUserId: string;
  currentUserRole?: string;
  patients: any[];
  pharmacyItems: any[];
}

const HISTORY_PAGE_SIZE = 20;

export default function CaisseView({
  initialRegisters,
  initialHistory = [],
  initialHistoryTotal = 0,
  organizationId,
  organizationName,
  organizationLogoUrl,
  currentUserId,
  currentUserRole,
  patients,
  pharmacyItems,
}: CaisseViewProps) {
  const [registers, setRegisters] = useState<RegisterRow[]>(initialRegisters);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>(() => {
    const mine = initialRegisters.find((r) => r.openSession);
    return mine?.id || initialRegisters[0]?.id || "";
  });
  const [summary, setSummary] = useState<any>(null);
  // Page des mouvements de la session affichée (20 par page) ; les totaux viennent du serveur.
  const [summaryPage, setSummaryPage] = useState(1);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [opening, setOpening] = useState(false);
  const [activeTab, setActiveTab] = useState("caisse");
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  // Tickets impayés : une page à la fois ; le total et le bandeau viennent du serveur.
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [unpaidPage, setUnpaidPage] = useState(1);
  const [unpaidSummary, setUnpaidSummary] = useState({ totalValue: 0, totalPaid: 0, partialCount: 0 });
  const [loadingUnpaid, setLoadingUnpaid] = useState(false);

  // Historique des tickets de caisse — paginé et filtré côté serveur (listCaisseHistoryInvoices),
  // mis en cache par react-query : une réponse plus ancienne ne remplace jamais une plus récente.
  const queryClient = useQueryClient();
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDebouncedSearch, setHistoryDebouncedSearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"ALL" | "PAID" | "PARTIAL" | "PENDING" | "CANCELLED">("ALL");
  const historyKey = ["caisseHistory", organizationId] as const;
  const isDefaultHistoryView = historyPage === 1 && historyDebouncedSearch === "" && historyStatusFilter === "ALL";
  const historyQuery = useQuery({
    queryKey: [...historyKey, historyPage, historyDebouncedSearch, historyStatusFilter],
    queryFn: async () => {
      const res = await listCaisseHistoryInvoices(organizationId, {
        page: historyPage,
        pageSize: HISTORY_PAGE_SIZE,
        search: historyDebouncedSearch,
        status: historyStatusFilter === "ALL" ? undefined : historyStatusFilter,
      });
      if (!res.success) throw new Error(res.error);
      return { items: (res.data ?? []) as any[], total: res.total ?? 0 };
    },
    initialData: isDefaultHistoryView ? { items: initialHistory, total: initialHistoryTotal } : undefined,
    placeholderData: keepPreviousData,
  });
  const historyInvoices = historyQuery.data?.items ?? [];
  const historyTotal = historyQuery.data?.total ?? 0;
  const loadingHistory = historyQuery.isFetching;

  // PHARMACIST inclus temporairement ("pour le moment") : peut se comporter comme un caissier
  // (ouvrir/fermer une caisse, encaisser) — cf. register-permissions.ts:REGISTER_OPERATE_ROLES.
  const canOperate = currentUserRole === "COORDINATOR" || currentUserRole === "CASHIER" || currentUserRole === "PHARMACIST";
  const canManageRegisters = currentUserRole === "COORDINATOR";
  const canManageStatus = currentUserRole === "COORDINATOR" || currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN";

  const selectedRegister = registers.find((r) => r.id === selectedRegisterId) || null;

  const refreshRegisters = useCallback(async () => {
    const res = await listRegistersWithStatus(organizationId);
    if (res.success) setRegisters(res.data as any);
  }, [organizationId]);

  const refreshSummary = useCallback(async (sessionId: string, page = 1) => {
    setLoadingSummary(true);
    const res = await getSessionSummary(sessionId, { page });
    setLoadingSummary(false);
    if (res.success) {
      setSummary(res.data);
      setSummaryPage(page);
    }
  }, []);

  // Org-wide (PENDING + PARTIAL) — alimente l'onglet "Tickets impayés", indépendant de la caisse
  // sélectionnée : un ticket peut avoir été ouvert sur une autre caisse ou une autre session.
  const refreshUnpaidInvoices = useCallback(
    async (page = 1) => {
      setLoadingUnpaid(true);
      const res = await listPendingInvoices(organizationId, { page });
      setLoadingUnpaid(false);
      if (res.success) {
        setUnpaidInvoices(res.data as any[]);
        setUnpaidTotal(res.total);
        setUnpaidSummary(res.summary);
        setUnpaidPage(page);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    if (selectedRegister?.openSession) {
      refreshSummary(selectedRegister.openSession.id);
    } else {
      setSummary(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegisterId, selectedRegister?.openSession?.id]);

  useEffect(() => {
    refreshUnpaidInvoices();
  }, [refreshUnpaidInvoices]);

  useEffect(() => {
    const timer = setTimeout(() => setHistoryDebouncedSearch(historySearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [historySearch]);

  const handleOpen = async (openingFloat: number) => {
    if (!selectedRegister) return { success: false, error: "Aucune caisse sélectionnée." };
    setOpening(true);
    const res = await openRegisterSession({ registerId: selectedRegister.id, openingFloat });
    setOpening(false);
    if (res.success) await refreshRegisters();
    return res;
  };

  const handleClose = async (countedAmount: number, notes?: string) => {
    if (!selectedRegister?.openSession) return { success: false, error: "Aucune session ouverte." };
    const res = await closeRegisterSession({ sessionId: selectedRegister.openSession.id, countedAmount, notes });
    if (res.success) {
      await refreshRegisters();
      setSummary(null);
    }
    return res;
  };

  const handleCorrectOpeningFloat = async (newOpeningFloat: number, reason?: string) => {
    if (!selectedRegister?.openSession) return { success: false, error: "Aucune session ouverte." };
    const res = await correctOpeningFloat({ sessionId: selectedRegister.openSession.id, newOpeningFloat, reason });
    if (res.success) {
      await refreshSummary(selectedRegister.openSession.id);
      await refreshRegisters();
    }
    return res;
  };

  const handleMutationSuccess = (transaction?: any) => {
    if (transaction) setSelectedTransaction(transaction);
    if (selectedRegister?.openSession) refreshSummary(selectedRegister.openSession.id);
    refreshUnpaidInvoices();
    queryClient.invalidateQueries({ queryKey: historyKey });
  };

  const handlePrintInvoice = (inv: any) => {
    const items = Array.isArray(inv.items) ? inv.items : [];
    const total = items.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
    const amountPaid = inv.amountPaid ?? (inv.status === "PAID" ? total : 0);
    const desc = items.map((it: any) => `${it.description || "Article"} x${it.quantity || 1}`).join(", ") || "Ticket de caisse";
    setSelectedTransaction({
      id: inv.id,
      pendingInvoiceId: inv.id,
      type: "INCOME",
      category: items.some((i: any) => i.type === "PHARMACY") ? "PHARMACY_SALE" : "SERVICE_PAYMENT",
      // Montant réellement encaissé (cumulé), jamais le total facturé — invoice-modal.tsx/
      // invoice-pdf.tsx distinguent déjà "encaissé" du "total facture" dès qu'un solde existe
      // (partiel, ou abandonné pour un ticket clôturé).
      amount: amountPaid,
      amountPaid,
      invoiceTotalAmount: total,
      remainingDue: Math.max(0, total - amountPaid),
      description: desc,
      items: items,
      patient: inv.patient,
      customPatientName: inv.customPatientName,
      customPatientPhone: inv.customPatientPhone,
      createdAt: inv.createdAt,
      status: inv.status,
    });
  };

  const selectHistoryStatus = (status: "ALL" | "PAID" | "PARTIAL" | "PENDING" | "CANCELLED") => {
    setHistoryStatusFilter(status);
    setHistoryPage(1);
  };

  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));
  const historyFrom = historyTotal === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyTo = Math.min(historyPage * HISTORY_PAGE_SIZE, historyTotal);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl h-auto flex-wrap justify-start">
          <TabsTrigger value="caisse" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
            <Landmark className="h-4 w-4 text-blue-500" />
            Caisse
          </TabsTrigger>
          <TabsTrigger value="impayes" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Tickets impayés ({unpaidTotal})
          </TabsTrigger>
          <TabsTrigger value="historique" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
            <History className="h-4 w-4 text-emerald-500" />
            Historique des tickets ({historyTotal})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="caisse" className="space-y-6">
      {/* Grille des caisses */}
      <div className="flex items-center justify-between animate-fade-up">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Caisses de la clinique ({registers.length})
        </h2>
        {canManageRegisters && <CreateRegisterDialog organizationId={organizationId} onCreated={refreshRegisters} />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
        {registers.length === 0 ? (
          <Card className="col-span-full rounded-2xl border-dashed">
            <CardContent className="py-10 text-center text-sm text-slate-500">
              Aucune caisse configurée. {canManageRegisters ? "Créez la première caisse pour commencer à encaisser." : "Contactez votre coordinateur pour en créer une."}
            </CardContent>
          </Card>
        ) : (
          registers.map((r) => {
            const isSelected = r.id === selectedRegisterId;
            const isOpen = !!r.openSession;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRegisterId(r.id)}
                className={`text-left rounded-2xl border p-4 transition-all ${isSelected ? "border-blue-500/60 bg-blue-500/5 shadow-xs" : "border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 hover:border-blue-500/30"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{r.name}</span>
                  {isOpen ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
                      <CircleDot className="h-3 w-3" /> Ouverte
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20 text-[10px] gap-1">
                      <Circle className="h-3 w-3" /> Fermée
                    </Badge>
                  )}
                </div>
                {isOpen && r.openSession && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Par {r.openSession.openedBy.firstName} {r.openSession.openedBy.lastName} depuis {formatDateTime(r.openSession.openedAt)}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Panneau de la caisse sélectionnée */}
      {selectedRegister && (
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs animate-fade-up">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg font-bold">{selectedRegister.name}</CardTitle>
              <CardDescription>
                {selectedRegister.openSession ? "Session en cours" : "Aucune session ouverte pour le moment."}
              </CardDescription>
            </div>
            {canOperate && (
              selectedRegister.openSession ? (
                <CloseSessionDialog registerName={selectedRegister.name} expectedAmount={summary?.expectedAmount ?? selectedRegister.openSession.openingFloat} onClose={handleClose} />
              ) : (
                <OpenSessionDialog registerName={selectedRegister.name} onOpen={handleOpen} />
              )
            )}
          </CardHeader>

          {selectedRegister.openSession && (
            <CardContent className="pt-0 space-y-6">
              {loadingSummary && !summary ? (
                <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : summary ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Fond de départ</p>
                        {canOperate && (
                          <EditOpeningFloatDialog
                            currentOpeningFloat={summary.session.openingFloat}
                            disabledReason={
                              summary.transactionsTotal > 0 && !canManageRegisters
                                ? "Des opérations ont déjà été enregistrées sur cette session : seul un coordinateur peut encore corriger le fond de départ."
                                : undefined
                            }
                            onSubmit={handleCorrectOpeningFloat}
                          />
                        )}
                      </div>
                      <p className="text-sm font-extrabold mt-1">{formatFCFA(summary.session.openingFloat)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
                      <p className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-1"><TrendingUp className="h-3 w-3" />Encaissements</p>
                      <p className="text-sm font-extrabold mt-1 text-emerald-700 dark:text-emerald-400">+{formatFCFA(summary.totalIncome)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/30">
                      <p className="text-[10px] font-bold uppercase text-rose-600 flex items-center gap-1"><TrendingDown className="h-3 w-3" />Dépenses</p>
                      <p className="text-sm font-extrabold mt-1 text-rose-700 dark:text-rose-400">-{formatFCFA(summary.totalExpenses)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30">
                      <p className="text-[10px] font-bold uppercase text-blue-600 flex items-center gap-1"><Wallet className="h-3 w-3" />Montant théorique</p>
                      <p className="text-sm font-extrabold mt-1 text-blue-700 dark:text-blue-400">{formatFCFA(summary.expectedAmount)}</p>
                    </div>
                  </div>

                  {canOperate && (
                    <div className="flex flex-wrap gap-3">
                      <CaisseCartDialog mode="sale" cashSessionId={selectedRegister.openSession.id} pharmacyItems={pharmacyItems} patients={patients} organizationId={organizationId} onSuccess={handleMutationSuccess} />
                      <CaisseExpenseDialog cashSessionId={selectedRegister.openSession.id} organizationId={organizationId} onSuccess={handleMutationSuccess} />
                    </div>
                  )}

                  {summary.pendingInvoices.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5" />
                          Tickets impayés ({summary.pendingInvoicesTotal})
                        </p>
                        <button type="button" onClick={() => setActiveTab("impayes")} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                          Voir tout <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                      {summary.pendingInvoices.slice(0, 3).map((inv: any) => {
                        const total = (inv.items || []).reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
                        const name = inv.patient?.user ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}` : (inv.customPatientName || "Client comptant");
                        return (
                          <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{name}</p>
                              <p className="text-[11px] text-slate-500">{formatDateTime(inv.createdAt)} • {formatFCFA(total)}</p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${inv.status === "PARTIAL" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"}`}>
                              {inv.status === "PARTIAL" ? "Partiel" : "Non payé"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mouvements de cette session ({summary.transactionsTotal})</p>
                    {summary.transactions.length === 0 ? (
                      <p className="text-sm text-slate-500 py-4 text-center">Aucun mouvement pour l&apos;instant.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {summary.transactions.map((t: any) => {
                          const isIncome = t.type === "INCOME";
                          return (
                            <div key={t.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 text-sm">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{t.description}</p>
                                <p className="text-[10px] text-slate-400">{formatDateTime(t.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`font-bold ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                  {isIncome ? "+" : "-"}{formatFCFA(t.amount)}
                                </span>
                                {isIncome && (
                                  <Button variant="ghost" size="sm" onClick={() => setSelectedTransaction(t)} className="h-7 w-7 p-0 text-blue-600 dark:text-blue-400">
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {summary.session && (
                      <PaginationFooter
                        page={summaryPage}
                        pageSize={summary.pageSize}
                        total={summary.transactionsTotal}
                        onPageChange={(p) => refreshSummary(summary.session.id, p)}
                        loading={loadingSummary}
                        itemLabel="mouvement"
                      />
                    )}
                  </div>
                </>
              ) : null}
            </CardContent>
          )}
        </Card>
      )}
          <PaginationFooter page={unpaidPage} pageSize={20} total={unpaidTotal} onPageChange={(p) => refreshUnpaidInvoices(p)} loading={loadingUnpaid} itemLabel="ticket" />
        </TabsContent>

        <TabsContent value="impayes" className="space-y-3">
          {loadingUnpaid && unpaidInvoices.length === 0 ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : unpaidTotal === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                Aucun ticket impayé. Tous les tickets de la clinique sont réglés.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(() => {
                // Totaux calculés par le serveur sur toutes les factures impayées (pas seulement la page).
                const { totalValue, totalPaid, partialCount } = unpaidSummary;
                const totalUnpaid = Math.max(0, totalValue - totalPaid);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Tickets impayés</p>
                      <p className="text-sm font-extrabold mt-1">{unpaidTotal}{partialCount > 0 && <span className="font-medium text-slate-400"> · {partialCount} partiel{partialCount > 1 ? "s" : ""}</span>}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30">
                      <p className="text-[10px] font-bold uppercase text-blue-600 flex items-center gap-1"><Wallet className="h-3 w-3" />Valeur totale des tickets</p>
                      <p className="text-sm font-extrabold mt-1 text-blue-700 dark:text-blue-400">{formatFCFA(totalValue)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30">
                      <p className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />Montant total impayé</p>
                      <p className="text-sm font-extrabold mt-1 text-amber-700 dark:text-amber-400">{formatFCFA(totalUnpaid)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
                      <p className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-1"><TrendingUp className="h-3 w-3" />Déjà encaissé</p>
                      <p className="text-sm font-extrabold mt-1 text-emerald-700 dark:text-emerald-400">{formatFCFA(totalPaid)}</p>
                    </div>
                  </div>
                );
              })()}
              {!selectedRegister?.openSession && (
                <div className="p-3 text-xs font-medium rounded-xl border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/30 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Ouvrez une caisse (onglet « Caisse ») pour pouvoir encaisser un règlement.
                </div>
              )}
              {unpaidInvoices.map((inv: any) => {
                const invoiceTotalAmount = (inv.items || []).reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
                const name = inv.patient?.user ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}` : (inv.customPatientName || "Client comptant");
                const phone = inv.patient?.user?.phone || inv.customPatientPhone;
                const openSessionId = selectedRegister?.openSession?.id;
                return (
                  <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{name}</p>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${inv.patient?.user ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/20"}`}>
                          {inv.patient?.user ? "Patient" : "Client comptant"}
                        </Badge>
                        {phone && <span className="text-xs font-medium text-slate-500 font-mono">({phone})</span>}
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${inv.status === "PARTIAL" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"}`}>
                          {inv.status === "PARTIAL" ? "Partiel" : "Non payé"}
                        </Badge>
                        {!inv.patient && !inv.customPatientName?.trim() && !inv.customPatientPhone?.trim() && (
                          <EditInvoiceClientDialog
                            pendingInvoiceId={inv.id}
                            currentName={inv.customPatientName}
                            currentPhone={inv.customPatientPhone}
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {formatDateTime(inv.createdAt)} • Total {formatFCFA(invoiceTotalAmount)}
                        {inv.status === "PARTIAL" && ` • Réglé ${formatFCFA(inv.amountPaid)} • Reste ${formatFCFA(invoiceTotalAmount - inv.amountPaid)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canOperate && openSessionId && (
                        inv.status === "PARTIAL" ? (
                          <RecordPaymentDialog
                            cashSessionId={openSessionId}
                            pendingInvoice={{ id: inv.id, invoiceTotalAmount, amountPaid: inv.amountPaid, patient: inv.patient, customPatientName: inv.customPatientName, customPatientPhone: inv.customPatientPhone }}
                            onSuccess={handleMutationSuccess}
                          />
                        ) : (
                          <CaisseCartDialog mode="pay" cashSessionId={openSessionId} pharmacyItems={pharmacyItems} pendingInvoice={inv} onSuccess={handleMutationSuccess} />
                        )
                      )}
                      {/* Ne nécessite pas de caisse ouverte : aucun mouvement d'argent, simple
                          clôture de statut — cf. closeUnpaidInvoice. */}
                      {canOperate && (
                        <CloseInvoiceDialog
                          pendingInvoice={{
                            id: inv.id,
                            invoiceTotalAmount,
                            amountPaid: inv.amountPaid,
                            patient: inv.patient,
                            customPatientName: inv.customPatientName,
                            customPatientPhone: inv.customPatientPhone,
                            cartLines: inv.cartLines,
                            labLines: inv.labLines,
                            labConsumablesDispensedAt: inv.labConsumablesDispensedAt,
                          }}
                          onSuccess={handleMutationSuccess}
                        />
                      )}
                      {canManageStatus && (
                        <>
                          <EditInvoiceStatusDialog
                            pendingInvoice={{
                              id: inv.id,
                              status: inv.status,
                              amountPaid: inv.amountPaid,
                              invoiceTotalAmount,
                              patient: inv.patient,
                              customPatientName: inv.customPatientName,
                            }}
                            onSuccess={handleMutationSuccess}
                          />
                          {/* Bouton de suppression temporaire (commenté)
                          <DeleteInvoiceDialog
                            pendingInvoice={{
                              id: inv.id,
                              amountPaid: inv.amountPaid,
                              invoiceTotalAmount,
                              patient: inv.patient,
                              customPatientName: inv.customPatientName,
                            }}
                            onSuccess={handleMutationSuccess}
                          /> */}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historique" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryPage(1);
                }}
                placeholder="Rechercher par patient, téléphone, ticket #..."
                className="h-9 pl-9 text-sm rounded-xl"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => selectHistoryStatus("ALL")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  historyStatusFilter === "ALL"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Tous ({historyTotal})
              </button>
              <button
                type="button"
                onClick={() => selectHistoryStatus("PAID")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  historyStatusFilter === "PAID"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Payés
              </button>
              <button
                type="button"
                onClick={() => selectHistoryStatus("PARTIAL")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  historyStatusFilter === "PARTIAL"
                    ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Partiels
              </button>
              <button
                type="button"
                onClick={() => selectHistoryStatus("PENDING")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  historyStatusFilter === "PENDING"
                    ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Impayés
              </button>
              <button
                type="button"
                onClick={() => selectHistoryStatus("CANCELLED")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  historyStatusFilter === "CANCELLED"
                    ? "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Clôturés
              </button>
            </div>
          </div>

          {loadingHistory && historyInvoices.length === 0 ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : historyInvoices.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                {historyTotal === 0 && !historyDebouncedSearch && historyStatusFilter === "ALL"
                  ? "Aucun ticket enregistré pour le moment."
                  : "Aucun ticket ne correspond à vos critères de recherche."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {historyInvoices.map((inv: any) => {
                const items = Array.isArray(inv.items) ? inv.items : [];
                const total = items.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
                const name = inv.patient?.user
                  ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}`
                  : (inv.customPatientName || "Client comptant");
                const phone = inv.patient?.user?.phone || inv.customPatientPhone;
                const ticketNum = String(inv.id).slice(-6).toUpperCase();
                const isPharmacy = items.some((it: any) => it.type === "PHARMACY");
                const isDispensed = !!inv.dispensedAt;

                return (
                  <Card key={inv.id} className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-800 dark:text-slate-200">{name}</p>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${inv.patient?.user ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/20"}`}>
                              {inv.patient?.user ? "Patient" : "Client comptant"}
                            </Badge>
                            {phone && <span className="text-xs font-medium text-slate-500 font-mono">({phone})</span>}
                            <Badge variant="outline" className="text-[10px] font-mono bg-slate-500/10 text-slate-500 border-slate-500/20">
                              #{ticketNum}
                            </Badge>
                            <PaymentStatusBadge status={inv.status} amountPaid={inv.amountPaid} totalAmount={total} />
                            {isPharmacy && (
                              isDispensed ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                                  <CheckCircle2 className="h-2.5 w-2.5" /> Remis
                                </Badge>
                              ) : inv.status !== "CANCELLED" ? (
                                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 gap-1">
                                  <Clock className="h-2.5 w-2.5" /> Attente remise
                                </Badge>
                              ) : null
                            )}
                            {!inv.patient && !inv.customPatientName?.trim() && !inv.customPatientPhone?.trim() && (
                              <EditInvoiceClientDialog
                                pendingInvoiceId={inv.id}
                                currentName={inv.customPatientName}
                                currentPhone={inv.customPatientPhone}
                                onSuccess={() => queryClient.invalidateQueries({ queryKey: historyKey })}
                              />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Créé le {formatDateTime(inv.createdAt)} • Total {formatFCFA(total)}
                            {inv.status === "PARTIAL" && ` • Réglé ${formatFCFA(inv.amountPaid)} • Reste ${formatFCFA(total - inv.amountPaid)}`}
                            {inv.status === "CANCELLED" && (
                              ` • Encaissé ${formatFCFA(inv.amountPaid)}` +
                              (total - inv.amountPaid > 0 ? ` • Solde abandonné ${formatFCFA(total - inv.amountPaid)}` : "")
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintInvoice(inv)}
                            className="gap-1.5 text-xs rounded-xl border-slate-200 dark:border-slate-800"
                          >
                            <Printer className="h-3.5 w-3.5 text-blue-600" />
                            Imprimer
                          </Button>
                          {canOperate && selectedRegister?.openSession && !["PAID", "CANCELLED"].includes(inv.status) && (
                            inv.status === "PARTIAL" ? (
                              <RecordPaymentDialog
                                cashSessionId={selectedRegister.openSession.id}
                                pendingInvoice={{
                                  id: inv.id,
                                  invoiceTotalAmount: total,
                                  amountPaid: inv.amountPaid,
                                  patient: inv.patient,
                                  customPatientName: inv.customPatientName,
                                  customPatientPhone: inv.customPatientPhone,
                                }}
                                onSuccess={handleMutationSuccess}
                              />
                            ) : (
                              <CaisseCartDialog
                                mode="pay"
                                cashSessionId={selectedRegister.openSession.id}
                                pharmacyItems={pharmacyItems}
                                pendingInvoice={inv}
                                onSuccess={handleMutationSuccess}
                              />
                            )
                          )}
                          {canManageStatus && (
                            <>
                              <EditInvoiceStatusDialog
                                pendingInvoice={{
                                  id: inv.id,
                                  status: inv.status,
                                  amountPaid: inv.amountPaid,
                                  invoiceTotalAmount: total,
                                  patient: inv.patient,
                                  customPatientName: inv.customPatientName,
                                }}
                                onSuccess={handleMutationSuccess}
                              />
                              {/* Bouton de suppression temporaire (commenté)
                              <DeleteInvoiceDialog
                                pendingInvoice={{
                                  id: inv.id,
                                  amountPaid: inv.amountPaid,
                                  invoiceTotalAmount: total,
                                  patient: inv.patient,
                                  customPatientName: inv.customPatientName,
                                }}
                                onSuccess={handleMutationSuccess}
                              /> */}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Detail des articles du ticket */}
                      <div className="rounded-xl border border-slate-100 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                        {items.length === 0 ? (
                          <p className="p-2.5 text-xs text-slate-400">Aucun article listé.</p>
                        ) : (
                          items.map((it: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs bg-slate-50/60 dark:bg-slate-800/30">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{it.description}</span>
                              <div className="flex items-center gap-3">
                                <span className="font-semibold text-slate-500">x{it.quantity || 1}</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">{formatFCFA(it.amount || 0)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {historyTotal > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-500">
                {historyFrom}–{historyTo} sur {historyTotal} ticket{historyTotal > 1 ? "s" : ""}
              </span>
              {historyTotalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs"
                    disabled={historyPage <= 1 || loadingHistory}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  >
                    Précédent
                  </Button>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                    Page {historyPage} / {historyTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs"
                    disabled={historyPage >= historyTotalPages || loadingHistory}
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <InvoiceModal
        transaction={selectedTransaction}
        organizationName={organizationName}
        organizationLogoUrl={organizationLogoUrl}
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
      />
    </div>
  );
}
