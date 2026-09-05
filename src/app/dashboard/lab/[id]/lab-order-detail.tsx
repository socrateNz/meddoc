"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FlaskConical, ShieldAlert, Droplet, User, FileText, Stethoscope,
  Loader2, CheckCircle2, Lock, PackageCheck, Truck, Sparkles, TrendingUp, AlertTriangle, Receipt,
} from "lucide-react";
import { collectSample, receiveAtLab, validateLabResult, markDelivered, analyzeLabResults } from "@/actions/lab";
import RecordLabResultDialog from "@/app/dashboard/lab/record-lab-result-dialog";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";
import PaymentStatusBadge from "@/components/payment-status-badge";
import { toast } from "sonner";

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

function calculateAge(birthDate: Date) {
  const today = new Date();
  let age = today.getFullYear() - new Date(birthDate).getFullYear();
  const m = today.getMonth() - new Date(birthDate).getMonth();
  if (m < 0 || (m === 0 && today.getDate() < new Date(birthDate).getDate())) age--;
  return age;
}

function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

const SAMPLE_TYPE_OPTIONS = [
  { value: "BLOOD", label: "Sang" },
  { value: "URINE", label: "Urine" },
  { value: "STOOL", label: "Selles" },
  { value: "SALIVA", label: "Salive" },
  { value: "BIOPSY", label: "Biopsie" },
  { value: "CSF", label: "Liquide céphalorachidien" },
  { value: "OTHER", label: "Autre" },
];

const STATUS_LABELS: Record<string, string> = {
  PRESCRIBED: "Prescrit",
  SAMPLE_COLLECTED: "Échantillon prélevé",
  RECEIVED_AT_LAB: "Reçu au laboratoire",
  IN_ANALYSIS: "En analyse",
  TO_VALIDATE: "À valider",
  VALIDATED: "Validé",
  DELIVERED: "Livré",
  CANCELLED: "Annulé",
};

export default function LabOrderDetail({ order: initialOrder, currentUserRole }: { order: any; currentUserRole?: string }) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [sampleType, setSampleType] = useState("BLOOD");
  const [sampleQuantity, setSampleQuantity] = useState("");
  const [sampleCondition, setSampleCondition] = useState("");
  const [savingSample, setSavingSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ summary: string; trends: string[]; flags: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const canWrite = currentUserRole !== "ADMIN";
  const canValidate = currentUserRole === "COORDINATOR";
  const patient = order.patient;

  const refresh = () => router.refresh();

  const handleCollectSample = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSample(true);
    try {
      const res = await collectSample({ labOrderId: order.id, sampleType: sampleType as any, sampleQuantity: sampleQuantity || undefined, sampleCondition: sampleCondition || undefined });
      if (res.success) {
        toast.success("Prélèvement enregistré.");
        setOrder((prev: any) => ({ ...prev, ...res.data }));
        refresh();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement du prélèvement.");
      }
    } finally {
      setSavingSample(false);
    }
  };

  const handleReceive = async () => {
    setBusy(true);
    try {
      const res = await receiveAtLab(order.id);
      if (res.success) {
        toast.success("Échantillon reçu au laboratoire.");
        setOrder((prev: any) => ({ ...prev, status: "RECEIVED_AT_LAB" }));
      } else {
        toast.error(res.error || "Erreur.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async (resultId: string) => {
    setBusy(true);
    try {
      const res = await validateLabResult(resultId);
      if (res.success) {
        toast.success("Résultat validé et verrouillé.");
        refresh();
        setOrder((prev: any) => ({
          ...prev,
          results: prev.results.map((r: any) => r.id === resultId ? { ...r, validatedAt: new Date().toISOString(), validatedBy: { firstName: "Vous", lastName: "" } } : r),
        }));
      } else {
        toast.error(res.error || "Erreur lors de la validation.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeliver = async () => {
    setBusy(true);
    try {
      const res = await markDelivered(order.id);
      if (res.success) {
        toast.success("Résultats marqués comme livrés.");
        setOrder((prev: any) => ({ ...prev, status: "DELIVERED" }));
      } else {
        toast.error(res.error || "Erreur.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyze = async () => {
    setAiLoading(true);
    try {
      const res = await analyzeLabResults(order.id);
      if (res.success && res.data) {
        setAiAnalysis(res.data);
      } else {
        toast.error(res.error || "Erreur lors de l'analyse IA.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const resultsByTest = (order.results || []).reduce((acc: Record<string, any[]>, r: any) => {
    (acc[r.testName] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/lab">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-blue-500" />
            Demande d&apos;analyse
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            Statut actuel : <Badge variant="outline">{STATUS_LABELS[order.status] || order.status}</Badge>
            {order.pendingInvoice && <PaymentStatusBadge status={order.pendingInvoice.status} />}
          </p>
        </div>
      </div>

      {/* Patient */}
      <Card className="rounded-2xl">
        <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{patient?.user?.lastName} {patient?.user?.firstName}</span>
            <span className="text-sm text-muted-foreground">• {calculateAge(patient.dateOfBirth)} ans{patient?.sex ? ` • ${patient.sex}` : ""}</span>
          </div>
          {patient?.bloodType && (
            <div className="flex items-center gap-1.5 text-sm">
              <Droplet className="h-3.5 w-3.5 text-red-500" />
              Groupe {patient.bloodType}
            </div>
          )}
          {patient?.allergies?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
              {patient.allergies.map((a: string, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px] border-red-500/30 text-red-600 bg-red-500/5">{a}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Infos médicales */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Informations médicales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Prescripteur :</span> {order.orderedBy?.firstName} {order.orderedBy?.lastName}</p>
          {order.notes && <p><span className="text-muted-foreground">Motif :</span> {order.notes}</p>}
          {order.medicalRecord?.diagnosisLabel && (
            <p><span className="text-muted-foreground">Diagnostic suspecté :</span> {order.medicalRecord.diagnosisLabel}</p>
          )}
          {order.appointment && (
            <p>
              <span className="text-muted-foreground">Consultation d&apos;origine :</span>{" "}
              <Link href={`/dashboard/appointments/${order.appointment.id}/consultation`} className="text-blue-600 dark:text-blue-400 hover:underline">
                {order.appointment.title} • {formatDateTime(order.appointment.scheduledAt)}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-muted-foreground text-sm">Examens demandés :</span>
            {order.tests.map((t: string) => <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>)}
          </div>
        </CardContent>
      </Card>

      {/* Facturation */}
      {Array.isArray(order.testDetails) && order.testDetails.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Facturation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.testDetails.map((td: any, idx: number) => (
              <div key={idx} className="border rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{td.testName}</p>
                  <p className="font-bold">{formatFCFA(td.totalPrice)}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Prix de base : {formatFCFA(td.basePrice)}</p>
                {Array.isArray(td.consumables) && td.consumables.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {td.consumables.map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{c.name} x{c.quantity}</span>
                        <span>{formatFCFA((c.unitPrice || 0) * c.quantity)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Prélèvement */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4" /> Prélèvement</CardTitle>
        </CardHeader>
        <CardContent>
          {order.status === "PRESCRIBED" ? (
            canWrite ? (
              <form onSubmit={handleCollectSample} className="grid gap-3 sm:grid-cols-4 items-end">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Type d&apos;échantillon</Label>
                  <Select items={SAMPLE_TYPE_OPTIONS} value={sampleType} onValueChange={(v) => v && setSampleType(v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SAMPLE_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantité</Label>
                  <Input value={sampleQuantity} onChange={(e) => setSampleQuantity(e.target.value)} placeholder="ex: 5 mL" className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">État</Label>
                  <Input value={sampleCondition} onChange={(e) => setSampleCondition(e.target.value)} placeholder="ex: Conforme" className="rounded-xl" />
                </div>
                <div className="sm:col-span-4">
                  <Button type="submit" disabled={savingSample} className="gap-2 rounded-xl">
                    {savingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                    Enregistrer le prélèvement
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Prélèvement pas encore enregistré.</p>
            )
          ) : (
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Type :</span> {SAMPLE_TYPE_OPTIONS.find((o) => o.value === order.sampleType)?.label || order.sampleType}</p>
              <p><span className="text-muted-foreground">Prélevé le :</span> {order.sampleCollectedAt ? formatDateTime(order.sampleCollectedAt) : "-"} par {order.sampleCollectedBy?.firstName} {order.sampleCollectedBy?.lastName}</p>
              {order.sampleQuantity && <p><span className="text-muted-foreground">Quantité :</span> {order.sampleQuantity}</p>}
              {order.sampleCondition && <p><span className="text-muted-foreground">État :</span> {order.sampleCondition}</p>}
              {order.status === "SAMPLE_COLLECTED" && canWrite && (
                <Button size="sm" variant="outline" className="gap-1.5 rounded-lg mt-2" onClick={handleReceive} disabled={busy}>
                  <Truck className="h-3.5 w-3.5" />
                  Marquer reçu au laboratoire
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Résultats */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Résultats</CardTitle>
          {canWrite && order.status !== "CANCELLED" && (
            <RecordLabResultDialog labOrder={order} onSuccess={() => refresh()} />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {order.tests.map((testName: string) => {
            const results: any[] = resultsByTest[testName] || [];
            return (
              <div key={testName} className="border rounded-xl p-3">
                <p className="font-semibold text-sm mb-2">{testName}</p>
                {results.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun résultat saisi.</p>
                ) : (
                  <div className="space-y-2">
                    {results.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 text-sm bg-slate-50/60 dark:bg-slate-900/40 rounded-lg p-2.5">
                        <div>
                          <span className="font-medium">{r.value} {r.unit || ""}</span>
                          {r.referenceRange && <span className="text-xs text-muted-foreground ml-2">(réf: {r.referenceRange})</span>}
                          {r.isAbnormal && (
                            <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-600 border-red-500/20 text-[10px]">Anormal</Badge>
                          )}
                        </div>
                        {r.validatedAt ? (
                          <Badge variant="outline" className="gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            <Lock className="h-3 w-3" />
                            Validé par {r.validatedBy?.firstName} {r.validatedBy?.lastName} • {formatDateTime(r.validatedAt)}
                          </Badge>
                        ) : canValidate ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 rounded-lg" onClick={() => handleValidate(r.id)} disabled={busy}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Valider
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">En attente de validation</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Assistance IA */}
      {canWrite && (order.results || []).length > 0 && (
        <Card className="rounded-2xl border-violet-200 dark:border-violet-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-violet-600 dark:text-violet-400">
              <Sparkles className="h-4 w-4" /> Assistance IA — tendances & résumé
            </CardTitle>
            <CardDescription>Analyse consultative uniquement, basée sur l&apos;historique du patient. Ne remplace pas le jugement clinique.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!aiAnalysis ? (
              <Button variant="outline" className="gap-2 rounded-xl" onClick={handleAnalyze} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer l&apos;analyse IA
              </Button>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-slate-700 dark:text-slate-300">{aiAnalysis.summary}</p>
                {aiAnalysis.trends.length > 0 && (
                  <div className="space-y-1.5">
                    {aiAnalysis.trends.map((t, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-lg p-2">
                        <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                )}
                {aiAnalysis.flags.length > 0 && (
                  <div className="space-y-1.5">
                    {aiAnalysis.flags.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg p-2">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs rounded-lg" onClick={handleAnalyze} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Régénérer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {order.status === "VALIDATED" && canWrite && (
          <Button className="gap-2 rounded-xl" onClick={handleDeliver} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            Marquer comme livré
          </Button>
        )}
        {(order.status === "VALIDATED" || order.status === "DELIVERED") && (
          <PDFDownloadButton
            documentName={`rapport_labo_${patient?.user?.lastName || "patient"}`}
            type="labreport"
            data={{ order, organizationName: order.organization?.name, organizationLogoUrl: order.organization?.logoUrl }}
            buttonText="Télécharger le rapport (PDF)"
          />
        )}
      </div>
    </div>
  );
}
