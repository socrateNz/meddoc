import Link from "next/link";
import { ClipboardCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clinicTimeLabel } from "@/lib/clinic-day";
import { LATERALITY_LABELS, SURGERY_STATUS_LABELS, type Laterality } from "@/lib/surgery";

type Case = {
  id: string;
  operatingRoomId: string;
  patientName: string;
  ipp: string | null;
  procedure: string;
  laterality: string;
  priority: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  surgeonName: string | null;
  anesthetistName: string | null;
  checklistDone: number;
};

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "border-l-blue-500",
  IN_PROGRESS: "border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
  COMPLETED: "border-l-emerald-500 opacity-80",
  CANCELLED: "border-l-slate-300 opacity-50 line-through decoration-slate-400",
};

// Programme opératoire d'une journée : une colonne par salle, interventions dans l'ordre horaire.
export default function SurgeryDayPlan({ clinicId, rooms, cases }: { clinicId: string; rooms: { id: string; name: string; isActive: boolean }[]; cases: Case[] }) {
  if (rooms.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Aucune salle d&apos;opération. Le coordinateur les crée dans l&apos;onglet « Salles ».
      </div>
    );
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))` }}>
      {rooms.map((room) => {
        const roomCases = cases.filter((c) => c.operatingRoomId === room.id);
        return (
          <div key={room.id} className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-bold">{room.name}</p>
              <span className="text-xs text-muted-foreground">{roomCases.filter((c) => c.status !== "CANCELLED").length} intervention(s)</span>
            </div>
            {roomCases.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Salle libre</p>
            ) : (
              roomCases.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/clinics/${clinicId}/bloc/${c.id}`}
                  className={`block rounded-xl border border-slate-200/70 dark:border-slate-800 border-l-4 p-2.5 hover:shadow-sm transition-all ${STATUS_STYLES[c.status] ?? ""}`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {clinicTimeLabel(c.scheduledStart)} – {clinicTimeLabel(c.scheduledEnd)}
                    </span>
                    <div className="flex items-center gap-1">
                      {c.priority === "URGENT" && <Badge className="bg-red-600 text-white text-[10px]">Urgent</Badge>}
                      <Badge variant="outline" className="text-[10px]">
                        {SURGERY_STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm font-semibold mt-1">
                    {c.procedure}
                    {c.laterality !== "NA" && <span className="text-muted-foreground font-normal"> ({LATERALITY_LABELS[c.laterality as Laterality]})</span>}
                  </p>
                  <p className="text-xs">
                    {c.patientName} {c.ipp && <span className="font-mono text-muted-foreground">{c.ipp}</span>}
                  </p>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                    <span className="truncate">Dr {c.surgeonName ?? "-"}{c.anesthetistName ? ` • Anesth. ${c.anesthetistName}` : ""}</span>
                    <span className={`inline-flex items-center gap-0.5 shrink-0 ${c.checklistDone === 3 ? "text-emerald-600" : ""}`}>
                      <ClipboardCheck className="h-3 w-3" />
                      {c.checklistDone}/3
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
