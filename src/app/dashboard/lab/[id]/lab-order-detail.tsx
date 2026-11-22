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
import { labOrderReference, MAX_TUBE_LABELS } from "@/lib/lab-label";
import { orderSamples, testsWithoutSample } from "@/lib/lab-rules";
import { parseStoredResult } from "@/lib/lab-templates";
import StructuredResultView from "@/components/lab/structured-result-view";

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
  // Examens décochés pour le prochain tube (ils iront dans un autre prélèvement).
  const [excludedTests, setExcludedTests] = useState<string[]>([]);
  const [savingSample, setSavingSample] = useState(false);
  const [labelCopies, setLabelCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ summary: string; trends: string[]; flags: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const canWrite = currentUserRole !== "ADMIN";
  const canValidate = currentUserRole === "COORDINATOR";
  const patient = order.patient;

  const refresh = () => router.refresh();

  const samples = orderSamples(order);
  const remainingTests = testsWithoutSample(order);
  const nextTubeTests = remainingTests.filter((t) => !excludedTests.includes(t));
  const canCollect = canWrite && remainingTests.length > 0 && !["CANCELLED", "VALIDATED", "DELIVERED"].includes(order.status);
  const pendingReception = samples.filter((s) => !s.receivedAt && s.id !== "legacy");
  const legacyAwaitingReception = samples.length === 1 && samples[0].id === "legacy" && order.status === "SAMPLE_COLLECTED";

  const handleCollectSample = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSample(true);
    try {
      if (nextTubeTests.length === 0) {
        toast.error("Cochez au moins un examen pour ce prélèvement.");
        return;
      }
      const res = await collectSample({ labOrderId: order.id, sampleType: sampleType as any, tests: nextTubeTests, sampleQuantity: sampleQuantity || undefined, sampleCondition: sampleCondition || undefined });
      if (res.success) {
        const left = remainingTests.length - nextTubeTests.length;
        toast.success(left > 0 ? `Prélèvement enregistré. ${left} examen(s) reste(nt) à prélever.` : "Prélèvement enregistré.");
        setOrder((prev: any) => ({ ...prev, ...res.data }));
        setExcludedTests([]);
        setSampleQuantity("");
        setSampleCondition("");
        refresh();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement du prélèvement.");
      }
    } finally {
      setSavingSample(false);
    }
  };

  const handleReceive = async (sampleId?: string) => {
    setBusy(true);
    try {
      const res = await receiveAtLab(order.id, sampleId);
      if (res.success) {
        toast.success(sampleId ? "Tube reçu au laboratoire." : "Échantillon(s) reçu(s) au laboratoire.");
        setOrder((prev: any) => ({ ...prev, ...res.data }));
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
          {order.partner && (
            <p>
              <span className="text-muted-foreground">Partenaire :</span>{" "}
              <span className="font-semibold text-violet-700 dark:text-violet-300">{order.partner.name}</span>
              {order.partnerReference ? ` • Bon n° ${order.partnerReference}` : ""}
              <span className="text-muted-foreground">
                {order.partner.billing === "PARTNER" ? " • facturé au partenaire (relevé mensuel)" : " • réglé par le patient au prix partenaire"}
              </span>
            </p>
          )}
          {order.prenatalVisit && (
            <p>
              <span className="text-muted-foreground">Visite prénatale d&apos;origine :</span>{" "}
              <Link href={`/dashboard/patients/${order.patientId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                {order.prenatalVisit.cpnNumber ? `CPN ${order.prenatalVisit.cpnNumber} • ` : ""}{formatDateTime(order.prenatalVisit.visitDate)}
                {order.prenatalVisit.gestationalWeeks != null ? ` • ${order.prenatalVisit.gestationalWeeks} SA` : ""}
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

      {/* Prélèvements : un tube commun ou un tube par examen */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> Prélèvements
            {samples.length > 0 && <Badge variant="secondary" className="text-[11px]">{samples.length} tube{samples.length > 1 ? "s" : ""}</Badge>}
          </CardTitle>
          {canWrite && pendingReception.length > 1 && (
            <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => handleReceive()} disabled={busy}>
              <Truck className="h-3.5 w-3.5" />
              Tout marquer reçu
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {samples.length === 0 && !canCollect && <p className="text-sm text-muted-foreground">Prélèvement pas encore enregistré.</p>}

          {samples.map((sample, index) => (
            <div key={sample.id} className="space-y-2 rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Tube {index + 1} — {SAMPLE_TYPE_OPTIONS.find((o) => o.value === sample.sampleType)?.label || sample.sampleType}
                </p>
                {sample.receivedAt ? (
                  <Badge variant="outline" className="gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" /> Reçu au laboratoire
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">En attente de réception</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sample.tests.map((t) => <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>)}
              </div>
              <p className="text-xs text-muted-foreground">
                Prélevé le {formatDateTime(sample.collectedAt)}{sample.collectedByName ? ` par ${sample.collectedByName}` : ""}
                {sample.quantity ? ` • ${sample.quantity}` : ""}
                {sample.condition ? ` • ${sample.condition}` : ""}
              </p>
              {order.status !== "CANCELLED" && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <PDFDownloadButton
                    documentName={`etiquette_${labOrderReference(order.id)}_tube${index + 1}`}
                    type="labtubelabel"
                    data={{ order: { ...order, tests: sample.tests, sampleType: sample.sampleType, sampleCollectedAt: sample.collectedAt }, copies: labelCopies }}
                    buttonText={`Étiquette du tube ${index + 1}`}
                    className="h-9 rounded-lg"
                  />
                  {canWrite && !sample.receivedAt && sample.id !== "legacy" && (
                    <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg" onClick={() => handleReceive(sample.id)} disabled={busy}>
                      <Truck className="h-3.5 w-3.5" />
                      Marquer reçu
                    </Button>
                  )}
                  {canWrite && legacyAwaitingReception && (
                    <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg" onClick={() => handleReceive()} disabled={busy}>
                      <Truck className="h-3.5 w-3.5" />
                      Marquer reçu au laboratoire
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}

          {samples.length > 0 && order.status !== "CANCELLED" && (
            <div className="flex items-center gap-2">
              <Label htmlFor="label-copies" className="text-xs text-muted-foreground">Copies par étiquette</Label>
              <Input
                id="label-copies"
                type="number"
                min={1}
                max={MAX_TUBE_LABELS}
                value={labelCopies}
                onChange={(e) => setLabelCopies(Math.min(MAX_TUBE_LABELS, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
                className="h-9 w-20 rounded-lg text-base sm:text-sm"
              />
            </div>
          )}

          {canCollect && (
            <form onSubmit={handleCollectSample} className="space-y-3 rounded-xl border border-dashed p-3">
              <p className="text-sm font-semibold">{samples.length === 0 ? "Enregistrer le prélèvement" : "Prélèvement suivant"}</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Examens couverts par ce tube</Label>
                <div className="flex flex-wrap gap-2">
                  {remainingTests.map((t) => {
                    const checked = !excludedTests.includes(t);
                    return (
                      <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-blue-500/40 bg-blue-500/5" : "opacity-60"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setExcludedTests((prev) => (checked ? [...prev, t] : prev.filter((x) => x !== t)))}
                          className="h-4 w-4 accent-blue-600"
                        />
                        {t}
                      </label>
                    );
                  })}
                </div>
                {remainingTests.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">Décochez les examens qui seront prélevés dans un autre tube (ex. urines, selles).</p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-4 items-end">
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
                  <Input value={sampleQuantity} onChange={(e) => setSampleQuantity(e.target.value)} placeholder="ex: 5 mL" className="rounded-xl text-base sm:text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">État</Label>
                  <Input value={sampleCondition} onChange={(e) => setSampleCondition(e.target.value)} placeholder="ex: Conforme" className="rounded-xl text-base sm:text-sm" />
                </div>
              </div>
              <Button type="submit" disabled={savingSample || nextTubeTests.length === 0} className="w-full gap-2 rounded-xl sm:w-auto">
                {savingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                Enregistrer ce prélèvement ({nextTubeTests.length} examen{nextTubeTests.length > 1 ? "s" : ""})
              </Button>
            </form>
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
                    {results.map((r) => {
                      const structured = parseStoredResult(r.data);
                      return (
                      <div key={r.id} className="flex flex-col gap-3 text-sm bg-slate-50/60 dark:bg-slate-900/40 rounded-lg p-2.5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          {structured ? (
                            <StructuredResultView result={structured} />
                          ) : (
                            <>
                              <span className="font-medium">{r.value} {r.unit || ""}</span>
                              {r.referenceRange && <span className="text-xs text-muted-foreground ml-2">(réf: {r.referenceRange})</span>}
                            </>
                          )}
                          {r.isAbnormal && (
                            <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-600 border-red-500/20 text-[10px]">Anormal</Badge>
                          )}
                          {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
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
                      );
                    })}
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
