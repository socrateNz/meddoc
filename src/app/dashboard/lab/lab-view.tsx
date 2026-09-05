"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Clock, CheckCircle2, AlertTriangle, ChevronRight, Settings, Zap } from "lucide-react";
import NewLabOrderDialog from "./new-lab-order-dialog";
import PaymentStatusBadge from "@/components/payment-status-badge";

function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PRESCRIBED: { label: "Prescrit", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  SAMPLE_COLLECTED: { label: "Échantillon prélevé", className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
  RECEIVED_AT_LAB: { label: "Reçu au laboratoire", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  IN_ANALYSIS: { label: "En analyse", className: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  TO_VALIDATE: { label: "À valider", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  VALIDATED: { label: "Validé", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  DELIVERED: { label: "Livré", className: "bg-teal-500/10 text-teal-600 border-teal-500/20" },
  CANCELLED: { label: "Annulé", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

const PENDING_STATUSES = ["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB"];

interface LabViewProps {
  labOrders: any[];
  patients: any[];
  currentUserRole?: string;
}

export default function LabView({ labOrders, patients, currentUserRole }: LabViewProps) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // ADMIN (holding) consulte le laboratoire en lecture seule ; COORDINATOR/CAREGIVER gèrent.
  const canWrite = currentUserRole !== "ADMIN";
  const isCoordinator = currentUserRole === "COORDINATOR";

  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let pending = 0, inAnalysis = 0, toValidate = 0, validatedToday = 0, urgent = 0, critical = 0;
    for (const o of labOrders) {
      if (PENDING_STATUSES.includes(o.status)) pending++;
      if (o.status === "IN_ANALYSIS") inAnalysis++;
      if (o.status === "TO_VALIDATE") toValidate++;
      if ((o.status === "VALIDATED" || o.status === "DELIVERED") && new Date(o.updatedAt) >= startOfToday) validatedToday++;
      if (o.priority === "URGENT" && !["DELIVERED", "CANCELLED"].includes(o.status)) urgent++;
      if ((o.results || []).some((r: any) => r.isAbnormal && !r.validatedAt)) critical++;
    }
    return { pending, inAnalysis, toValidate, validatedToday, urgent, critical };
  }, [labOrders]);

  const filteredOrders = statusFilter === "ALL" ? labOrders : labOrders.filter((o) => o.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Tableau de bord */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-fade-up">
        <Card className="rounded-2xl">
          <CardContent className="py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">En attente</p>
            <p className="text-2xl font-extrabold mt-1">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">En analyse</p>
            <p className="text-2xl font-extrabold mt-1">{stats.inAnalysis}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-amber-300/60 dark:border-amber-900/40">
          <CardContent className="py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">À valider</p>
            <p className="text-2xl font-extrabold mt-1 text-amber-600">{stats.toValidate}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-emerald-300/60 dark:border-emerald-900/40">
          <CardContent className="py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Validés aujourd&apos;hui</p>
            <p className="text-2xl font-extrabold mt-1 text-emerald-600">{stats.validatedToday}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-blue-300/60 dark:border-blue-900/40">
          <CardContent className="py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1"><Zap className="h-3 w-3" /> Urgents</p>
            <p className="text-2xl font-extrabold mt-1 text-blue-600">{stats.urgent}</p>
          </CardContent>
        </Card>
        <Card className={`rounded-2xl ${stats.critical > 0 ? "border-red-400/60 dark:border-red-900/50" : ""}`}>
          <CardContent className="py-4">
            <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${stats.critical > 0 ? "text-red-600" : "text-slate-400"}`}>
              <AlertTriangle className="h-3 w-3" /> Critiques
            </p>
            <p className={`text-2xl font-extrabold mt-1 ${stats.critical > 0 ? "text-red-600 animate-pulse" : ""}`}>{stats.critical}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-up">
        <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${statusFilter === "ALL" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"}`}
          >
            Toutes ({labOrders.length})
          </button>
          {Object.entries(STATUS_LABELS).map(([status, info]) => {
            const count = labOrders.filter((o) => o.status === status).length;
            if (count === 0) return null;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${statusFilter === status ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"}`}
              >
                {info.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          {isCoordinator && (
            <Link href="/dashboard/lab/catalog">
              <Button variant="outline" className="gap-2 rounded-xl">
                <Settings className="h-4 w-4" />
                Catalogue des examens
              </Button>
            </Link>
          )}
          {canWrite && <NewLabOrderDialog patients={patients} />}
        </div>
      </div>

      {/* Liste */}
      {filteredOrders.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Aucune demande d&apos;analyse pour ce filtre.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredOrders.map((order) => {
            const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.PRESCRIBED;
            const hasCritical = (order.results || []).some((r: any) => r.isAbnormal && !r.validatedAt);
            return (
              <Link key={order.id} href={`/dashboard/lab/${order.id}`}>
                <Card className={`rounded-2xl hover:shadow-md transition-shadow ${hasCritical ? "border-red-400/60 dark:border-red-900/50" : ""}`}>
                  <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          {order.patient?.user ? `${order.patient.user.lastName} ${order.patient.user.firstName}` : "Patient"}
                        </p>
                        {order.priority === "URGENT" && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] gap-1">
                            <Zap className="h-3 w-3" /> Urgent
                          </Badge>
                        )}
                        {order.pendingInvoice && <PaymentStatusBadge status={order.pendingInvoice.status} className="text-[10px]" />}
                        {hasCritical && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] gap-1 animate-pulse">
                            <AlertTriangle className="h-3 w-3" /> Critique
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {order.tests.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Prescrit par {order.orderedBy?.firstName} {order.orderedBy?.lastName} • {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="outline" className={statusInfo.className}>{statusInfo.label}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
