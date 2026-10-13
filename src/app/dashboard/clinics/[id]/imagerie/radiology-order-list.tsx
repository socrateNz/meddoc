"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RADIOLOGY_STATUS_LABELS } from "@/lib/radiology";

export interface RadiologyOrderRow {
  id: string;
  patientName: string;
  ipp: string | null;
  exams: { name: string }[];
  status: string;
  priority: string;
  orderedBy: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  PRESCRIBED: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  PERFORMED: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  REPORTED: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  VALIDATED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  CANCELLED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const formatDateTime = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export default function RadiologyOrderList({ orders, clinicId, showPatient = true }: { orders: RadiologyOrderRow[]; clinicId: string; showPatient?: boolean }) {
  if (orders.length === 0) {
    return <div className="border border-dashed rounded-xl p-10 text-center text-sm text-muted-foreground">Aucun examen d&apos;imagerie.</div>;
  }
  return (
    <div className="space-y-2.5">
      {orders.map((o) => (
        <Link key={o.id} href={`/dashboard/clinics/${clinicId}/imagerie/${o.id}`}>
          <div className={`border rounded-xl p-4 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors ${o.priority === "URGENT" && o.status === "PRESCRIBED" ? "border-red-400/60" : ""}`}>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {showPatient && <span className="font-semibold text-sm">{o.patientName}</span>}
                {showPatient && o.ipp && <span className="text-[11px] font-mono text-muted-foreground">{o.ipp}</span>}
                {o.exams.map((e) => (
                  <Badge key={e.name} variant="outline" className="text-[11px]">{e.name}</Badge>
                ))}
                {o.priority === "URGENT" && (
                  <Badge className="bg-red-600 text-white text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Urgent
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Prescrit le {formatDateTime(o.createdAt)}
                {o.orderedBy ? ` par ${o.orderedBy}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[o.status] || ""}`}>{RADIOLOGY_STATUS_LABELS[o.status] || o.status}</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
