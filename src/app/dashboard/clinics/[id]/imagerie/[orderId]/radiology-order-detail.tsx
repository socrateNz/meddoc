"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Images, Loader2, PlayCircle, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getRadiologyOrder, updateRadiologyOrder } from "@/actions/radiology";
import { listPatientFiles } from "@/actions/medical-files";
import { RADIOLOGY_MODALITY_LABELS, RADIOLOGY_STATUS_LABELS, radiologyReference, type RadiologyAction } from "@/lib/radiology";
import MedicalFileUploader from "@/components/medical-files/medical-file-uploader";
import MedicalFileList, { type MedicalFileItem } from "@/components/medical-files/medical-file-list";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";
import PaymentStatusBadge from "@/components/payment-status-badge";

type Order = Extract<Awaited<ReturnType<typeof getRadiologyOrder>>, { success: true }>["data"];

const formatDateTime = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export default function RadiologyOrderDetail({ order, clinicId }: { order: Order; clinicId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<RadiologyAction | null>(null);
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState(order.report ?? "");
  const [conclusion, setConclusion] = useState(order.conclusion ?? "");
  const [cancelReason, setCancelReason] = useState("");
  const [images, setImages] = useState<MedicalFileItem[] | null>(null);
  const [imagesKey, setImagesKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listPatientFiles({ patientId: order.patientId, radiologyOrderId: order.id }).then((res) => {
      if (!cancelled) setImages(res.success ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [order.patientId, order.id, imagesKey]);

  const act = async (action: RadiologyAction, extra: Record<string, string> = {}) => {
    setBusy(action);
    const res = await updateRadiologyOrder({ orderId: order.id, action, ...extra });
    setBusy(null);
    if (res.success) {
      toast.success(
        action === "PERFORM" ? "Examen marqué réalisé." : action === "REPORT" ? "Compte-rendu enregistré." : action === "VALIDATE" ? "Compte-rendu validé." : "Examen annulé."
      );
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const patientName = order.patient?.user ? `${order.patient.user.lastName} ${order.patient.user.firstName}` : "Patient";
  const reference = radiologyReference(order.id);
  const editableReport = order.permissions.report && (order.status === "PERFORMED" || order.status === "REPORTED");
  const canUpload = order.permissions.upload && ["PRESCRIBED", "PERFORMED", "REPORTED"].includes(order.status);

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/clinics/${clinicId}/imagerie`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Imagerie
      </Link>

      <div className="rounded-2xl border bg-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{patientName}</h1>
            {order.patient?.ipp && <span className="font-mono text-sm text-muted-foreground">{order.patient.ipp}</span>}
            {order.priority === "URGENT" && (
              <Badge className="bg-red-600 text-white gap-1">
                <AlertTriangle className="h-3 w-3" />
                Urgent
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {order.exams.map((e) => (
              <Badge key={e.examId} variant="outline">
                {e.name} • {RADIOLOGY_MODALITY_LABELS[e.modality as keyof typeof RADIOLOGY_MODALITY_LABELS] || e.modality}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {reference} • Prescrit le {formatDateTime(order.createdAt)} par {order.orderedByName || "-"}
          </p>
          {order.patient?.allergies && order.patient.allergies.length > 0 && (
            <p className="text-xs font-semibold text-rose-700 flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              Allergies : {order.patient.allergies.join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-col items-start md:items-end gap-2">
          <Badge variant="outline" className="text-xs">{RADIOLOGY_STATUS_LABELS[order.status] || order.status}</Badge>
          {order.invoiceStatus && <PaymentStatusBadge status={order.invoiceStatus} />}
          {order.status === "VALIDATED" && (
            <PDFDownloadButton
              documentName={`compte_rendu_imagerie_${reference}`}
              type="radiologyreport"
              data={{
                report: {
                  reference,
                  organization: order.organization,
                  patient: order.patient,
                  exams: order.exams,
                  modalityLabels: RADIOLOGY_MODALITY_LABELS,
                  clinicalIndication: order.clinicalIndication,
                  orderedByName: order.orderedByName,
                  createdAt: order.createdAt,
                  performedAt: order.performedAt,
                  report: order.report,
                  conclusion: order.conclusion,
                  reportedByName: order.reportedByName,
                  validatedByName: order.validatedByName,
                  validatedAt: order.validatedAt,
                },
              }}
              buttonText="Compte-rendu (PDF)"
            />
          )}
        </div>
      </div>

      {order.clinicalIndication && (
        <Card className="rounded-2xl">
          <CardContent className="pt-5 text-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Indication clinique</span>
            {order.clinicalIndication}
          </CardContent>
        </Card>
      )}

      {order.status === "CANCELLED" && (
        <div className="rounded-2xl border border-slate-300 bg-slate-500/5 p-4 text-sm">
          Annulé le {order.cancelledAt ? formatDateTime(order.cancelledAt) : "-"} par {order.cancelledByName || "-"} — motif : {order.cancelReason}
        </div>
      )}

      {/* Réalisation */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-blue-500" />
            Réalisation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {order.status === "PRESCRIBED" ? (
            order.permissions.perform ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-60 space-y-1">
                  <Label className="text-xs">Remarques de réalisation</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex: Patient peu coopérant, incidence complémentaire..." className="rounded-xl" />
                </div>
                <Button onClick={() => act("PERFORM", notes.trim() ? { notes: notes.trim() } : {})} disabled={busy !== null} className="gap-2 rounded-xl">
                  {busy === "PERFORM" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Marquer réalisé
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Examen pas encore réalisé.</p>
            )
          ) : order.performedAt ? (
            <p>
              Réalisé le {formatDateTime(order.performedAt)} par {order.performedByName || "-"}
              {order.performedNotes ? ` — ${order.performedNotes}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Clichés */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Images className="h-4 w-4 text-indigo-500" />
            Clichés et documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canUpload && (
            <MedicalFileUploader patientId={order.patientId} category="RADIOLOGY_IMAGE" radiologyOrderId={order.id} buttonLabel="Ajouter un cliché" onUploaded={() => setImagesKey((k) => k + 1)} />
          )}
          {images === null ? <p className="text-xs text-muted-foreground">Chargement...</p> : <MedicalFileList files={images} showPreviews onChanged={() => setImagesKey((k) => k + 1)} />}
        </CardContent>
      </Card>

      {/* Compte-rendu */}
      {order.status !== "PRESCRIBED" && order.status !== "CANCELLED" && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              Compte-rendu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {editableReport ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Compte-rendu *</Label>
                  <Textarea rows={7} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Technique, description des images..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Conclusion *</Label>
                  <Textarea rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} placeholder="Conclusion de l'examen" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => act("REPORT", { report: report.trim(), conclusion: conclusion.trim() })} disabled={busy !== null} variant="outline" className="gap-2 rounded-xl">
                    {busy === "REPORT" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                    {order.status === "REPORTED" ? "Mettre à jour le compte-rendu" : "Enregistrer le compte-rendu"}
                  </Button>
                  {order.status === "REPORTED" && (
                    <Button onClick={() => act("VALIDATE")} disabled={busy !== null} className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                      {busy === "VALIDATE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Valider le compte-rendu
                    </Button>
                  )}
                </div>
                {order.status === "REPORTED" && order.reportedAt && (
                  <p className="text-xs text-muted-foreground">Rédigé le {formatDateTime(order.reportedAt)} par {order.reportedByName || "-"}.</p>
                )}
              </>
            ) : order.report ? (
              <>
                <p className="whitespace-pre-line">{order.report}</p>
                <p className="font-semibold">Conclusion : {order.conclusion}</p>
                <p className="text-xs text-muted-foreground">
                  Rédigé par {order.reportedByName || "-"}
                  {order.validatedAt ? ` — validé le ${formatDateTime(order.validatedAt)} par ${order.validatedByName || "-"}` : ""}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Compte-rendu pas encore rédigé.</p>
            )}
          </CardContent>
        </Card>
      )}

      {order.status === "PRESCRIBED" && order.permissions.cancel && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-red-200/60 p-4">
          <div className="flex-1 min-w-60 space-y-1">
            <Label className="text-xs">Motif d&apos;annulation</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="ex: Examen non nécessaire, doublon..." className="rounded-xl" />
          </div>
          <Button variant="outline" className="gap-2 rounded-xl text-red-600" disabled={busy !== null || !cancelReason.trim()} onClick={() => act("CANCEL", { reason: cancelReason.trim() })}>
            {busy === "CANCEL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Annuler l&apos;examen
          </Button>
        </div>
      )}
    </div>
  );
}
