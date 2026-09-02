"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, Receipt, Printer, Loader2, CircleDot, Circle, Landmark } from "lucide-react";
import { listRegistersWithStatus, openRegisterSession, getSessionSummary, closeRegisterSession } from "@/actions/registers";
import { OpenSessionDialog, CloseSessionDialog, CreateRegisterDialog } from "./register-session-dialogs";
import CaisseCartDialog from "./caisse-cart-dialog";
import CaisseExpenseDialog from "./caisse-expense-dialog";
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
  organizationId: string;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  currentUserId: string;
  currentUserRole?: string;
  patients: any[];
  pharmacyItems: any[];
}

export default function CaisseView({ initialRegisters, organizationId, organizationName, organizationLogoUrl, currentUserId, currentUserRole, patients, pharmacyItems }: CaisseViewProps) {
  const [registers, setRegisters] = useState<RegisterRow[]>(initialRegisters);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>(() => {
    const mine = initialRegisters.find((r) => r.openSession);
    return mine?.id || initialRegisters[0]?.id || "";
  });
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [opening, setOpening] = useState(false);

  const canOperate = currentUserRole === "COORDINATOR" || currentUserRole === "CASHIER";
  const canManageRegisters = currentUserRole === "COORDINATOR";

  const selectedRegister = registers.find((r) => r.id === selectedRegisterId) || null;

  const refreshRegisters = useCallback(async () => {
    const res = await listRegistersWithStatus(organizationId);
    if (res.success) setRegisters(res.data as any);
  }, [organizationId]);

  const refreshSummary = useCallback(async (sessionId: string) => {
    setLoadingSummary(true);
    const res = await getSessionSummary(sessionId);
    setLoadingSummary(false);
    if (res.success) setSummary(res.data);
  }, []);

  useEffect(() => {
    if (selectedRegister?.openSession) {
      refreshSummary(selectedRegister.openSession.id);
    } else {
      setSummary(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegisterId, selectedRegister?.openSession?.id]);

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

  const handleMutationSuccess = (transaction: any) => {
    if (transaction) setSelectedTransaction(transaction);
    if (selectedRegister?.openSession) refreshSummary(selectedRegister.openSession.id);
  };

  return (
    <div className="space-y-6">
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
                      <p className="text-[10px] font-bold uppercase text-slate-400">Fond de départ</p>
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
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5" />
                        Tickets en attente de règlement ({summary.pendingInvoices.length})
                      </p>
                      {summary.pendingInvoices.map((inv: any) => {
                        const total = (inv.items || []).reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
                        const name = inv.patient?.user ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}` : "Client comptant";
                        return (
                          <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{name}</p>
                              <p className="text-[11px] text-slate-500">{formatDateTime(inv.createdAt)} • {formatFCFA(total)}</p>
                            </div>
                            {canOperate && (
                              <CaisseCartDialog mode="pay" cashSessionId={selectedRegister.openSession!.id} pharmacyItems={pharmacyItems} pendingInvoice={inv} onSuccess={handleMutationSuccess} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mouvements de cette session ({summary.transactions.length})</p>
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
                  </div>
                </>
              ) : null}
            </CardContent>
          )}
        </Card>
      )}

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
