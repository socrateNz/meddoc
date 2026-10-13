"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardCheck, Loader2, PlayCircle, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { amendOperativeReport, getSurgeryCase, rescheduleSurgery, updateSurgeryStatus } from "@/actions/surgery";
import { clinicDateKey, clinicTimeLabel } from "@/lib/clinic-day";
import { ANESTHESIA_LABELS, CHECKLIST, CHECKLIST_PHASES, LATERALITY_LABELS, SURGERY_STATUS_LABELS, surgeryReference, type AnesthesiaType, type Laterality } from "@/lib/surgery";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";
import PaymentStatusBadge from "@/components/payment-status-badge";
import SurgeryChecklist from "./surgery-checklist";

type SurgeryCase = Extract<Awaited<ReturnType<typeof getSurgeryCase>>, { success: true }>["data"];

const formatDateTime = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const selectClass = "h-9 w-full px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      <p className="text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

export default function SurgeryCaseDetail({ surgery, clinicId, rooms }: { surgery: SurgeryCase; clinicId: string; rooms: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState({
    operativeReport: surgery.operativeReport ?? "",
    complications: surgery.complications ?? "",
    postOpInstructions: surgery.postOpInstructions ?? "",
  });
  const [amending, setAmending] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [slot, setSlot] = useState({
    operatingRoomId: surgery.operatingRoomId,
    date: clinicDateKey(new Date(surgery.scheduledStart)),
    time: clinicTimeLabel(surgery.scheduledStart),
    duration: String(Math.round((new Date(surgery.scheduledEnd).getTime() - new Date(surgery.scheduledStart).getTime()) / 60000)),
  });
  const [showReschedule, setShowReschedule] = useState(false);

  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, message: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.success) {
      toast.success(message);
      setAmending(false);
      setShowReschedule(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const reportPayload = {
    operativeReport: report.operativeReport.trim(),
    complications: report.complications.trim() || undefined,
    postOpInstructions: report.postOpInstructions.trim(),
  };
  const patientName = surgery.patient?.user ? `${surgery.patient.user.lastName} ${surgery.patient.user.firstName}` : "Patient";
  const reference = surgeryReference(surgery.id);
  const checklistDone = CHECKLIST_PHASES.filter((p) => surgery.checklist[p]).length;
  const showReportForm = surgery.permissions.report && (surgery.status === "IN_PROGRESS" || (surgery.status === "COMPLETED" && amending));

  const pdfData = {
    report: {
      reference,
      organization: surgery.organization,
      patient: surgery.patient,
      procedure: surgery.procedure,
      lateralityLabel: surgery.laterality !== "NA" ? LATERALITY_LABELS[surgery.laterality as Laterality] : null,
      anesthesiaLabel: ANESTHESIA_LABELS[surgery.anesthesiaType as AnesthesiaType] ?? surgery.anesthesiaType,
      indication: surgery.indication,
      roomName: surgery.roomName,
      surgeonName: surgery.surgeonName,
      anesthetistName: surgery.anesthetistName,
      scrubNurseName: surgery.scrubNurseName,
      actualStart: surgery.actualStart,
      actualEnd: surgery.actualEnd,
      operativeReport: surgery.operativeReport,
      complications: surgery.complications,
      postOpInstructions: surgery.postOpInstructions,
      reportedByName: surgery.reportedByName,
      reportedAt: surgery.reportedAt,
      checklist: CHECKLIST_PHASES.filter((p) => surgery.checklist[p]).map((p) => ({
        label: CHECKLIST[p].label,
        checkedByName: surgery.checklist[p]!.checkedByName,
        checkedAt: surgery.checklist[p]!.checkedAt,
      })),
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/clinics/${clinicId}/bloc?date=${clinicDateKey(new Date(surgery.scheduledStart))}`}>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="Retour au programme">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {surgery.procedure}
              {surgery.laterality !== "NA" && <span className="text-muted-foreground font-semibold"> ({LATERALITY_LABELS[surgery.laterality as Laterality]})</span>}
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{reference}</span> • {patientName} {surgery.patient?.ipp && <span className="font-mono">({surgery.patient.ipp})</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {surgery.priority === "URGENT" && <Badge className="bg-red-600 text-white">Urgent</Badge>}
          <Badge variant="outline">{SURGERY_STATUS_LABELS[surgery.status] ?? surgery.status}</Badge>
          {surgery.invoiceStatus && <PaymentStatusBadge status={surgery.invoiceStatus} />}
          {surgery.status === "COMPLETED" && <PDFDownloadButton type="operativereport" documentName={`compte-rendu-operatoire-${reference}`} data={pdfData} buttonText="Compte-rendu PDF" />}
        </div>
      </div>

      {surgery.patient && surgery.patient.allergies.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/20 px-4 py-2 text-sm font-semibold text-rose-700 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Allergies : {surgery.patient.allergies.join(", ")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Check-list de sécurité ({checklistDone}/3)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SurgeryChecklist caseId={surgery.id} status={surgery.status} checklist={surgery.checklist} canSign={surgery.permissions.checklist} />
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Compte-rendu opératoire</CardTitle>
              {surgery.status === "COMPLETED" && surgery.permissions.report && !amending && (
                <Button size="sm" variant="outline" onClick={() => setAmending(true)}>
                  Corriger
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {showReportForm ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Compte-rendu *</Label>
                    <Textarea rows={8} value={report.operativeReport} onChange={(e) => setReport((r) => ({ ...r, operativeReport: e.target.value }))} placeholder="Installation, voie d'abord, constatations, gestes réalisés, fermeture..." maxLength={10000} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Incidents / complications</Label>
                    <Textarea rows={2} value={report.complications} onChange={(e) => setReport((r) => ({ ...r, complications: e.target.value }))} placeholder="Aucun" maxLength={2000} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Consignes post-opératoires *</Label>
                    <Textarea rows={3} value={report.postOpInstructions} onChange={(e) => setReport((r) => ({ ...r, postOpInstructions: e.target.value }))} placeholder="Surveillance, antalgie, reprise alimentaire, pansements..." maxLength={2000} />
                  </div>
                  {surgery.status === "IN_PROGRESS" ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{surgery.checklist.SIGN_OUT ? "Prêt à clore." : "Signez d'abord l'étape « avant la sortie de salle »."}</p>
                      <Button
                        disabled={busy !== null || !surgery.checklist.SIGN_OUT}
                        onClick={() => run("COMPLETE", () => updateSurgeryStatus({ caseId: surgery.id, action: "COMPLETE", ...reportPayload }), "Intervention terminée.")}
                        className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {busy === "COMPLETE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Terminer l&apos;intervention
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setAmending(false)}>
                        Annuler
                      </Button>
                      <Button disabled={busy !== null} onClick={() => run("AMEND", () => amendOperativeReport({ caseId: surgery.id, ...reportPayload }), "Compte-rendu corrigé.")}>
                        {busy === "AMEND" && <Loader2 className="h-4 w-4 animate-spin" />}
                        Enregistrer la correction
                      </Button>
                    </div>
                  )}
                </>
              ) : surgery.operativeReport ? (
                <div className="space-y-3 text-sm">
                  <p className="whitespace-pre-wrap">{surgery.operativeReport}</p>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Incidents / complications</p>
                    <p className="whitespace-pre-wrap">{surgery.complications || "Aucun"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Consignes post-opératoires</p>
                    <p className="whitespace-pre-wrap">{surgery.postOpInstructions}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Rédigé par {surgery.reportedByName ?? "-"}
                    {surgery.reportedAt && ` le ${formatDateTime(surgery.reportedAt)}`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {surgery.status === "IN_PROGRESS" ? "Rédigé par le chirurgien de l'intervention (ou le coordinateur)." : "Rédigé pendant l'intervention, pour la clore."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Intervention</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Info label="Salle" value={surgery.roomName} />
              <Info label="Anesthésie" value={ANESTHESIA_LABELS[surgery.anesthesiaType as AnesthesiaType] ?? surgery.anesthesiaType} />
              <Info label="Créneau" value={`${formatDateTime(surgery.scheduledStart)} → ${clinicTimeLabel(surgery.scheduledEnd)}`} />
              <Info label="Groupe sanguin" value={surgery.patient?.bloodType} />
              <Info label="Chirurgien" value={surgery.surgeonName} />
              <Info label="Anesthésiste" value={surgery.anesthetistName} />
              <Info label="Infirmier(e) de bloc" value={surgery.scrubNurseName} />
              <Info label="Programmée par" value={surgery.createdByName} />
              {surgery.actualStart && <Info label="Début réel" value={formatDateTime(surgery.actualStart)} />}
              {surgery.actualEnd && <Info label="Fin réelle" value={formatDateTime(surgery.actualEnd)} />}
              {surgery.indication && (
                <div className="col-span-2">
                  <Info label="Indication" value={surgery.indication} />
                </div>
              )}
              {surgery.status === "CANCELLED" && (
                <div className="col-span-2">
                  <Info label="Annulée" value={`${surgery.cancelReason ?? ""} — ${surgery.cancelledByName ?? "-"}`} />
                </div>
              )}
            </CardContent>
          </Card>

          {surgery.permissions.schedule && surgery.status === "SCHEDULED" && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Déroulement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={busy !== null || !surgery.checklist.SIGN_IN || !surgery.checklist.TIME_OUT}
                  onClick={() => run("START", () => updateSurgeryStatus({ caseId: surgery.id, action: "START" }), "Intervention commencée.")}
                >
                  {busy === "START" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Commencer l&apos;intervention
                </Button>
                {(!surgery.checklist.SIGN_IN || !surgery.checklist.TIME_OUT) && (
                  <p className="text-xs text-muted-foreground -mt-2">Possible une fois les étapes « avant induction » et « avant incision » signées.</p>
                )}

                <div className="border-t pt-3 space-y-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowReschedule((v) => !v)}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    Déplacer
                  </Button>
                  {showReschedule && (
                    <div className="grid grid-cols-2 gap-2">
                      <select className={`${selectClass} col-span-2`} value={slot.operatingRoomId} onChange={(e) => setSlot((s) => ({ ...s, operatingRoomId: e.target.value }))}>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <Input type="date" value={slot.date} onChange={(e) => setSlot((s) => ({ ...s, date: e.target.value }))} className="h-9 rounded-xl" />
                      <Input type="time" value={slot.time} onChange={(e) => setSlot((s) => ({ ...s, time: e.target.value }))} className="h-9 rounded-xl" />
                      <Input type="number" min={10} step={5} value={slot.duration} onChange={(e) => setSlot((s) => ({ ...s, duration: e.target.value }))} className="h-9 rounded-xl" aria-label="Durée en minutes" />
                      <Button
                        size="sm"
                        className="h-9"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            "RESCHEDULE",
                            () => rescheduleSurgery({ caseId: surgery.id, operatingRoomId: slot.operatingRoomId, date: slot.date, time: slot.time, durationMinutes: Number(slot.duration) }),
                            "Intervention déplacée."
                          )
                        }
                      >
                        Enregistrer
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motif d'annulation" className="h-9 rounded-xl" maxLength={500} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                    disabled={busy !== null || !cancelReason.trim()}
                    onClick={() => run("CANCEL", () => updateSurgeryStatus({ caseId: surgery.id, action: "CANCEL", reason: cancelReason.trim() }), "Intervention annulée.")}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Annuler l&apos;intervention
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
