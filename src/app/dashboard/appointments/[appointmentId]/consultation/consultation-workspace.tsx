"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { completeConsultation } from "@/actions/appointments";
import { listLabOrders } from "@/actions/lab";
import { listPrescriptionTemplates, createPrescriptionTemplate } from "@/actions/prescriptions";
import { transcribeConsultationAudio } from "@/actions/ai";
import { Loader2, FileText, Activity, Stethoscope, Pill, Plus, Trash2, Search, X, ShieldAlert, HeartPulse, FlaskConical, Mic, Square, ChevronRight, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchIcd10Codes, type Icd10Code } from "@/lib/icd10-codes";
import NewLabOrderDialog from "@/app/dashboard/lab/new-lab-order-dialog";

import PDFDownloadButton from "@/components/pdf/pdf-download-button";

function calculateAge(birthDate: Date) {
  const today = new Date();
  let age = today.getFullYear() - new Date(birthDate).getFullYear();
  const m = today.getMonth() - new Date(birthDate).getMonth();
  if (m < 0 || (m === 0 && today.getDate() < new Date(birthDate).getDate())) age--;
  return age;
}

export default function ConsultationWorkspace({ patient, appointment }: { patient: any, appointment?: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");

  // Form State
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");

  // Diagnostic ICD-10
  const [diagnosisCode, setDiagnosisCode] = useState<Icd10Code | null>(null);
  const [icdQuery, setIcdQuery] = useState("");
  const [icdOpen, setIcdOpen] = useState(false);
  const icdResults = useMemo(() => (icdQuery.trim() ? searchIcd10Codes(icdQuery, 8) : []), [icdQuery]);

  // Medications State
  const [medications, setMedications] = useState<{name: string, dosage: string, frequency: string, instructions: string}[]>([]);
  const [currentMed, setCurrentMed] = useState({ name: "", dosage: "", frequency: "", instructions: "" });

  // Modèles d'ordonnance
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templatePathology, setTemplatePathology] = useState("");
  const [templateShared, setTemplateShared] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Laboratoire
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [labLoading, setLabLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listLabOrders({ patientId: patient.id }).then((res) => {
      if (!cancelled && res.success) setLabOrders(res.data || []);
      if (!cancelled) setLabLoading(false);
    });
    listPrescriptionTemplates().then((res) => {
      if (!cancelled && res.success) setTemplates(res.data || []);
    });
    return () => { cancelled = true; };
  }, [patient.id]);

  // Dictée vocale IA
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;

        setTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const res = await transcribeConsultationAudio(base64, recorder.mimeType || "audio/webm");
          if (res.success && res.data) {
            if (res.data.symptoms) setSymptoms((prev) => (prev ? `${prev}\n\n${res.data!.symptoms}` : res.data!.symptoms));
            if (res.data.diagnosis) setDiagnosis((prev) => (prev ? `${prev}\n\n${res.data!.diagnosis}` : res.data!.diagnosis));
            if (res.data.plan) setPlan((prev) => (prev ? `${prev}\n\n${res.data!.plan}` : res.data!.plan));
            if (!res.data.symptoms && !res.data.diagnosis && !res.data.plan) {
              toast.error("Aucune information exploitable détectée dans l'enregistrement.");
            } else {
              toast.success("Transcription ajoutée — relisez et corrigez avant de clôturer.");
            }
          } else {
            toast.error(res.error || "Erreur lors de la transcription.");
          }
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.error("Impossible d'accéder au microphone. Vérifiez les autorisations du navigateur.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const addMedication = () => {
    if (!currentMed.name || !currentMed.dosage || !currentMed.frequency) {
      toast.error("Veuillez remplir le nom, le dosage et la fréquence du médicament.");
      return;
    }
    setMedications([...medications, currentMed]);
    setCurrentMed({ name: "", dosage: "", frequency: "", instructions: "" });
  };

  const removeMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleLoadTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template || !Array.isArray(template.items)) return;
    setMedications((prev) => [
      ...prev,
      ...template.items.map((item: any) => ({
        name: item.drugName,
        dosage: item.dosage,
        frequency: item.frequency,
        instructions: item.instructions || "",
      })),
    ]);
    toast.success(`Modèle "${template.name}" chargé (${template.items.length} médicament(s) ajouté(s)).`);
    setSelectedTemplateId("");
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Veuillez nommer le modèle.");
      return;
    }
    if (medications.length === 0) {
      toast.error("Ajoutez au moins un médicament avant d'enregistrer un modèle.");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await createPrescriptionTemplate({
        name: templateName.trim(),
        pathology: templatePathology.trim() || undefined,
        isShared: templateShared,
        items: medications.map((m) => ({
          drugName: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          instructions: m.instructions || undefined,
        })),
      });
      if (res.success) {
        toast.success("Modèle d'ordonnance enregistré.");
        setTemplates((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
        setShowSaveTemplate(false);
        setTemplateName("");
        setTemplatePathology("");
        setTemplateShared(false);
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement du modèle.");
      }
    } finally {
      setSavingTemplate(false);
    }
  };

  const isCompleted = appointment?.status === 'COMPLETED';

  const handleSubmit = async () => {
    if (!symptoms || !diagnosis || !plan) {
      toast.error("Veuillez remplir tous les champs de notes cliniques.");
      setActiveTab("notes");
      return;
    }

    setLoading(true);
    try {
      const response = await completeConsultation({
        appointmentId: appointment?.id,
        patientId: patient.id,
        symptoms,
        diagnosis,
        plan,
        medications,
        diagnosisCode: diagnosisCode?.code,
        diagnosisLabel: diagnosisCode?.label,
      });

      if (response.success) {
        toast.success(
          response.pendingInvoiceCreated
            ? "Consultation clôturée. Une facture en attente a été créée pour la caisse."
            : "Consultation clôturée avec succès."
        );
        if (appointment?.id) {
          router.push("/dashboard/appointments");
        } else {
          router.push(`/dashboard/patients/${patient.id}`);
        }
      } else {
        toast.error(response.error || "Erreur lors de la clôture.");
      }
    } catch (error) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bandeau patient compact */}
      <Card className="rounded-2xl">
        <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold tracking-tight">{patient.user.lastName} {patient.user.firstName}</h2>
              <Badge variant={isCompleted ? "secondary" : "default"} className="text-[10px]">
                {isCompleted ? "Consultation terminée" : "Consultation en cours"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {calculateAge(patient.dateOfBirth)} ans • Né(e) le {new Date(patient.dateOfBirth).toLocaleDateString('fr-FR')}
            </p>
          </div>

          {patient.allergies?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <ShieldAlert className="h-3.5 w-3.5 text-red-500 shrink-0" />
              {patient.allergies.map((a: string, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px] border-red-500/30 text-red-600 bg-red-500/5">{a}</Badge>
              ))}
            </div>
          )}

          {patient.pathologies?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <HeartPulse className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              {patient.pathologies.map((p: string, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px]">{p}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Colonne principale : onglets */}
        <div className="md:col-span-8 lg:col-span-9">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="history" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Historique
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Consultation
              </TabsTrigger>
              <TabsTrigger value="prescriptions" className="flex items-center gap-2">
                <Pill className="h-4 w-4" />
                Prescriptions
              </TabsTrigger>
              <TabsTrigger value="lab" className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Laboratoire
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Dossiers médicaux précédents</CardTitle>
                  <CardDescription>
                    Historique des consultations et documents du patient.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {patient.medicalRecords?.length > 0 ? (
                    <div className="space-y-4">
                      {patient.medicalRecords.map((record: any) => (
                        <div key={record.id} className="border-b pb-4 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start mb-2 gap-3">
                            <h4 className="font-medium flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary shrink-0" />
                              {record.title}
                            </h4>
                            <div className="flex items-center gap-2 shrink-0">
                              {record.diagnosisCode && (
                                <Badge variant="outline" className="text-[10px] font-mono">{record.diagnosisCode}</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(record.createdAt).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{record.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Aucun historique médical trouvé pour ce patient.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4">
              {!isCompleted && (
                <Card className="border-violet-200/60 dark:border-violet-900/40 bg-violet-50/30 dark:bg-violet-950/10">
                  <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Mic className="h-4 w-4 text-violet-600" />
                        Dictée vocale IA
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Enregistrez la consultation à voix haute ; la transcription vient compléter les champs ci-dessous — relisez toujours avant de valider.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={isRecording ? "destructive" : "outline"}
                      className="gap-2 shrink-0"
                      disabled={transcribing}
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      {transcribing ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Transcription en cours...</>
                      ) : isRecording ? (
                        <><Square className="h-4 w-4" /> Arrêter & transcrire</>
                      ) : (
                        <><Mic className="h-4 w-4" /> Démarrer l&apos;enregistrement</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Évaluation Clinique</CardTitle>
                  <CardDescription>
                    Remplissez vos observations et votre diagnostic pour cette consultation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="symptoms" className="text-base font-semibold text-primary">1. Symptômes & Observations</Label>
                    <Textarea
                      id="symptoms"
                      placeholder="Décrivez les symptômes présentés par le patient..."
                      className="min-h-[120px] resize-y"
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                      disabled={isCompleted}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="diagnosis" className="text-base font-semibold text-primary">2. Diagnostic / Évaluation</Label>
                    <Textarea
                      id="diagnosis"
                      placeholder="Votre évaluation clinique et diagnostic..."
                      className="min-h-[120px] resize-y"
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      disabled={isCompleted}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="plan" className="text-base font-semibold text-primary">3. Plan de Traitement</Label>
                    <Textarea
                      id="plan"
                      placeholder="Recommandations, suivi prévu, soins à apporter..."
                      className="min-h-[120px] resize-y"
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      disabled={isCompleted}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="prescriptions" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Prescriptions & Médicaments</CardTitle>
                    <CardDescription>
                      Ajoutez les médicaments prescrits. Génération automatique de l'ordonnance médicale PDF.
                    </CardDescription>
                  </div>
                  {medications.length > 0 && (
                    <PDFDownloadButton
                      documentName={`Ordonnance_${patient.user.lastName}`}
                      type="prescription"
                      data={{
                        patient,
                        medications,
                        date: new Date(),
                        organizationName: patient.organization?.name || "MEDDOC - CENTRE MÉDICAL"
                      }}
                      buttonText="Télécharger Ordonnance (PDF)"
                      variant="outline"
                      className="rounded-xl border-blue-200 text-blue-700 dark:border-blue-900 dark:text-blue-300"
                    />
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {!isCompleted && (
                    <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-dashed bg-slate-50/50 dark:bg-slate-900/40">
                      <Label className="text-xs shrink-0">Modèle d&apos;ordonnance :</Label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => handleLoadTemplate(e.target.value)}
                        className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                      >
                        <option value="">-- Charger un modèle --</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}{t.pathology ? ` (${t.pathology})` : ""}</option>
                        ))}
                      </select>
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={() => setShowSaveTemplate((v) => !v)}>
                        {showSaveTemplate ? "Annuler" : "Enregistrer comme modèle"}
                      </Button>
                    </div>
                  )}

                  {showSaveTemplate && (
                    <div className="grid gap-3 sm:grid-cols-3 items-end p-3 rounded-xl border bg-white dark:bg-slate-950">
                      <div className="space-y-1.5 sm:col-span-1">
                        <Label className="text-xs">Nom du modèle</Label>
                        <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Ex: Grippe saisonnière" className="h-9" />
                      </div>
                      <div className="space-y-1.5 sm:col-span-1">
                        <Label className="text-xs">Pathologie (optionnel)</Label>
                        <Input value={templatePathology} onChange={(e) => setTemplatePathology(e.target.value)} placeholder="Ex: Grippe" className="h-9" />
                      </div>
                      <div className="flex items-center gap-3 sm:col-span-1">
                        <label className="flex items-center gap-1.5 text-xs">
                          <input type="checkbox" checked={templateShared} onChange={(e) => setTemplateShared(e.target.checked)} />
                          Partager avec la clinique
                        </label>
                        <Button type="button" size="sm" disabled={savingTemplate} onClick={handleSaveTemplate} className="ml-auto gap-1.5">
                          {savingTemplate && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Enregistrer
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                    <div className="space-y-2">
                      <Label>Médicament</Label>
                      <Input
                        placeholder="Ex: Paracétamol"
                        value={currentMed.name}
                        onChange={(e) => setCurrentMed({...currentMed, name: e.target.value})}
                        disabled={isCompleted}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dosage</Label>
                      <Input
                        placeholder="Ex: 1000mg"
                        value={currentMed.dosage}
                        onChange={(e) => setCurrentMed({...currentMed, dosage: e.target.value})}
                        disabled={isCompleted}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fréquence</Label>
                      <Input
                        placeholder="Ex: 1 matin et soir"
                        value={currentMed.frequency}
                        onChange={(e) => setCurrentMed({...currentMed, frequency: e.target.value})}
                        disabled={isCompleted}
                      />
                    </div>
                    <Button
                      onClick={addMedication}
                      disabled={isCompleted}
                      className="flex flex-row gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Instructions additionnelles (Optionnel)</Label>
                    <Input
                      placeholder="Ex: À prendre au cours du repas"
                      value={currentMed.instructions}
                      onChange={(e) => setCurrentMed({...currentMed, instructions: e.target.value})}
                      disabled={isCompleted}
                    />
                  </div>

                  {medications.length > 0 ? (
                    <div className="mt-8 space-y-3">
                      <h4 className="font-medium text-sm text-muted-foreground border-b pb-2">Liste des prescriptions à générer</h4>
                      {medications.map((med, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                          <div>
                            <p className="font-semibold text-primary">{med.name} <span className="text-muted-foreground font-normal">- {med.dosage}</span></p>
                            <p className="text-sm">{med.frequency}</p>
                            {med.instructions && <p className="text-xs text-muted-foreground mt-1 italic">Note: {med.instructions}</p>}
                          </div>
                          {!isCompleted && (
                            <Button variant="ghost" size="icon" onClick={() => removeMedication(index)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed">
                      <Pill className="h-8 w-8 text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">Aucun médicament prescrit pour le moment.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lab" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Analyses de laboratoire</CardTitle>
                    <CardDescription>
                      Demandes d&apos;analyses pour ce patient. Prélèvement, résultats et validation se gèrent depuis la fiche détaillée.
                    </CardDescription>
                  </div>
                  <NewLabOrderDialog
                    patients={[patient]}
                    defaultPatientId={patient.id}
                    onSuccess={(order) => setLabOrders((prev) => [{ ...order, orderedBy: null, results: [] }, ...prev])}
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  {labLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : labOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed">
                      <FlaskConical className="h-8 w-8 text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">Aucune demande d&apos;analyse pour ce patient.</p>
                    </div>
                  ) : (
                    labOrders.map((order) => {
                      const hasCritical = (order.results || []).some((r: any) => r.isAbnormal && !r.validatedAt);
                      return (
                        <Link key={order.id} href={`/dashboard/lab/${order.id}`}>
                          <div className={`border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors ${hasCritical ? "border-red-400/60 dark:border-red-900/50" : ""}`}>
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-1.5">
                                {order.tests.map((t: string) => (
                                  <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
                                ))}
                                {hasCritical && (
                                  <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20 gap-1 animate-pulse">
                                    <AlertTriangle className="h-3 w-3" /> Critique
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-1">Statut : {order.status}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </Link>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Panneau latéral : Diagnostic ICD-10 + clôture */}
        <div className="md:col-span-4 lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Diagnostic</CardTitle>
              <CardDescription className="text-xs">Recherchez un code CIM-10 (facultatif).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {diagnosisCode ? (
                <div className="flex items-start justify-between gap-2 p-3 rounded-lg border bg-primary/5">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-primary">{diagnosisCode.code}</p>
                    <p className="text-sm mt-0.5">{diagnosisCode.label}</p>
                  </div>
                  {!isCompleted && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setDiagnosisCode(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ) : (
                !isCompleted && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Ex: paludisme, J00, hypertension..."
                      className="pl-8 h-9 text-sm"
                      value={icdQuery}
                      onChange={(e) => { setIcdQuery(e.target.value); setIcdOpen(true); }}
                      onFocus={() => setIcdOpen(true)}
                      onBlur={() => setTimeout(() => setIcdOpen(false), 150)}
                    />
                    {icdOpen && icdResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-md">
                        {icdResults.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
                            onClick={() => { setDiagnosisCode(c); setIcdQuery(""); setIcdOpen(false); }}
                          >
                            <span className="font-mono font-bold text-primary mr-1.5">{c.code}</span>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={loading || isCompleted}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCompleted ? "Consultation Terminée" : "Clôturer la consultation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
