import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User as UserIcon, Calendar, Clock, AlertTriangle, FileText, Activity, ShieldAlert, BrainCircuit, HeartPulse, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddRecordDialog from "@/app/dashboard/patients/[id]/add-record-dialog";
import AddIncidentDialog from "@/app/dashboard/patients/[id]/add-incident-dialog";
import CreateCarePlanDialog from "@/app/dashboard/patients/[id]/create-care-plan-dialog";
import CreateCareTaskDialog from "@/app/dashboard/patients/[id]/create-care-task-dialog";
import TaskStatusToggle from "@/app/dashboard/patients/[id]/task-status-toggle";
import ReassignPatientDialog from "@/app/dashboard/patients/reassign-patient-dialog";
import { getClinics } from "@/actions/organizations";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";
import VitalSignsDialog from "@/app/dashboard/patients/[id]/vital-signs-dialog";
import VitalSignsChart from "@/app/dashboard/patients/[id]/vital-signs-chart";
import CloseCarePlanDialog from "@/app/dashboard/patients/[id]/close-care-plan-dialog";
import ReopenCarePlanDialog from "@/app/dashboard/patients/[id]/reopen-care-plan-dialog";
import { getPatientVitalSigns } from "@/actions/vitals";

interface PageProps {
  params: Promise<{ id: string; patientId: string }>;
}

export default async function PatientDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;
  const patientId = resolvedParams.patientId;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const hasAccess = await verifyPatientAccess(patientId, currentUser);
  if (!hasAccess) {
    notFound(); // Using notFound to hide the existence of the patient
  }

  const isHoldingAdmin = currentUser.role === "ADMIN" && currentUser.organization?.type === "HOLDING";
  let clinics: { id: string; name: string }[] = [];
  if (isHoldingAdmin) {
    const clinicsRes = await getClinics();
    if (clinicsRes.clinics) {
      clinics = clinicsRes.clinics.map(c => ({ id: c.id, name: c.name }));
    }
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: true,
      medicalRecords: {
        orderBy: { createdAt: "desc" }
      },
      carePlans: {
        include: {
          medications: true,
          tasks: {
            orderBy: { scheduledFor: "asc" }
          }
        },
        orderBy: { startDate: "desc" }
      },
      appointments: {
        include: {
          caregiver: {
            include: { user: true }
          }
        },
        orderBy: { scheduledAt: "desc" }
      },
      incidents: {
        orderBy: { createdAt: "desc" }
      },
      aiAnalyses: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!patient) {
    notFound();
  }

  let vitalSigns: any[] = [];
  try {
    const vitalsRes = await getPatientVitalSigns(patientId);
    if (vitalsRes.success && vitalsRes.data) {
      vitalSigns = vitalsRes.data;
    }
  } catch (e) {
    vitalSigns = [];
  }

  (patient as any).vitalSigns = vitalSigns;

  const calculateAge = (birthDate: Date) => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(new Date(date));
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  const activeCarePlan = patient.carePlans.find((cp: any) => cp.status === "ACTIVE");
  const isDischarged = (patient as any).status === "DISCHARGED" || (patient.carePlans.length > 0 && !activeCarePlan);
  const patientFullName = `${patient.user.firstName} ${patient.user.lastName}`;

  return (
    <div className="space-y-6">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/clinics/${clinicId}/patients`}>
          <Button variant="ghost" className="gap-2 pl-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux patients
          </Button>
        </Link>
        <div className="flex gap-2 flex-wrap">
          {!isDischarged && <VitalSignsDialog patientId={patient.id} />}
          {activeCarePlan && !isDischarged && (
            <CloseCarePlanDialog
              carePlanId={activeCarePlan.id}
              patientId={patient.id}
              patientName={patientFullName}
            />
          )}
          {isDischarged && (
            <ReopenCarePlanDialog
              patientId={patient.id}
              patientName={patientFullName}
            />
          )}
          {!isDischarged && (
            <Button asChild variant="outline" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
              <Link href={`/dashboard/clinics/${clinicId}/patients/${patient.id}/consultation`}>
                <Stethoscope className="h-4 w-4" />
                Nouvelle consultation
              </Link>
            </Button>
          )}
          <PDFDownloadButton
            documentName={`Dossier_Medical_${patient.user.lastName}_${patient.user.firstName}`}
            buttonText="Exporter le Dossier (PDF)"
            type="patient"
            data={patient}
            variant="outline"
          />
          {isHoldingAdmin && !isDischarged && (
            <ReassignPatientDialog
              patientId={patient.id}
              patientName={patientFullName}
              currentOrganizationId={patient.organizationId || ""}
              holdingId={currentUser.organizationId || ""}
              clinics={clinics}
            />
          )}
          {!isDischarged && <AddIncidentDialog patientId={patient.id} reportedById={currentUser.id} />}
          {!isDischarged && <AddRecordDialog patientId={patient.id} />}
        </div>
      </div>

      {/* Discharged / Read-only Banner */}
      {isDischarged && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-base">Dossier clôturé (Patient sorti)</h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Ce dossier est actuellement verrouillé en lecture seule. Pour réaliser de nouvelles consultations, enregistrer des constantes ou ajouter des actes, vous devez d'abord réouvrir le dossier.
              </p>
            </div>
          </div>
          <ReopenCarePlanDialog patientId={patient.id} patientName={patientFullName} />
        </div>
      )}

      {/* Patient Profile Card (Premium Layout) */}
      <div className="rounded-2xl border bg-card text-card-foreground shadow-md overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <UserIcon className="h-8 w-8 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  {patient.user.lastName} {patient.user.firstName}
                </h1>
                {isDischarged ? (
                  <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-300 dark:text-slate-400 dark:border-slate-700">
                    Soins terminés / Sortie
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                    Soins en cours
                  </Badge>
                )}
                <Badge variant={patient.dependencyLevel > 3 ? "destructive" : "secondary"} className="h-5">
                  GIR {patient.dependencyLevel}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {calculateAge(patient.dateOfBirth)} ans • Né(e) le {formatDate(patient.dateOfBirth)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:flex gap-6 md:gap-12">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Adresse</span>
              <span className="text-sm font-medium mt-1 block max-w-[200px] md:max-w-xs truncate" title={patient.address}>
                {patient.address}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Contact d'urgence</span>
              <span className="text-sm font-medium mt-1 block">
                {patient.emergencyContact || "Aucun contact défini"}
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Coordonnées</span>
              <span className="text-sm font-medium mt-1 block">
                {patient.user.phone || "Non spécifié"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <Tabs defaultValue="records" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0 gap-6">
          <TabsTrigger
            value="vitals"
            className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Évolution & Constantes ({(patient as any).vitalSigns?.length || 0})
          </TabsTrigger>
          <TabsTrigger
            value="records"
            className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Dossier médical
          </TabsTrigger>
          <TabsTrigger
            value="careplans"
            className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Plan de soins
          </TabsTrigger>
          <TabsTrigger
            value="appointments"
            className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Rendez-vous
          </TabsTrigger>
          <TabsTrigger
            value="incidents"
            className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Incidents ({patient.incidents.length})
          </TabsTrigger>
        </TabsList>

        {/* Onglet Évolution & Constantes */}
        <TabsContent value="vitals" className="pt-6">
          <VitalSignsChart vitalSigns={(patient as any).vitalSigns || []} />
        </TabsContent>

        {/* Tab Content: Dossier médical */}
        <TabsContent value="records" className="pt-6 space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Left sidebar: Pathologies & Allergies */}
            <div className="md:col-span-1 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HeartPulse className="h-5 w-5 text-rose-500" />
                    Pathologies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {patient.pathologies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune pathologie déclarée.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {patient.pathologies.map((pathology: string) => (
                        <Badge key={pathology} variant="secondary" className="px-2.5 py-1">
                          {pathology}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-amber-500" />
                    Allergies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {patient.allergies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune allergie déclarée.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {patient.allergies.map((allergy: string) => (
                        <Badge key={allergy} variant="outline" className="px-2.5 py-1 border-amber-500/30 text-amber-600 bg-amber-500/5">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right main area: Medical Records history */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">Historique des documents & comptes-rendus</h3>
                {!isDischarged && <AddRecordDialog patientId={patient.id} />}
              </div>

              {patient.medicalRecords.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center bg-card">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                  <h4 className="font-medium text-base">Aucun document</h4>
                  <p className="text-sm text-muted-foreground mt-1">Ajoutez un rapport ou une note de visite pour ce patient.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {patient.medicalRecords.map((record: any) => (
                    <Card key={record.id} className="hover:shadow-sm transition-shadow">
                      <CardHeader className="py-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <CardTitle className="text-base font-semibold">{record.title}</CardTitle>
                            <CardDescription className="mt-1">
                              Ajouté le {formatDateTime(record.createdAt)}
                            </CardDescription>
                          </div>
                          <PDFDownloadButton
                            documentName={`Consultation_${patient.user.lastName}_${new Date(record.createdAt).toLocaleDateString("fr-FR").replace(/\//g, "-")}`}
                            buttonText="Télécharger"
                            type="consultation"
                            data={{ patient, record }}
                            variant="ghost"
                            size="sm"
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <p className="text-sm text-foreground/95 whitespace-pre-line leading-relaxed">
                          {record.description}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab Content: Plan de Soins */}
        <TabsContent value="careplans" className="pt-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold tracking-tight">Plans de Soins & Interventions</h3>
            {!isDischarged && <CreateCarePlanDialog patientId={patient.id} />}
          </div>

          {patient.carePlans.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <HeartPulse className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun plan de soins actif</h4>
              <p className="text-sm text-muted-foreground mt-1">Les plans de soins coordonnent les interventions et les traitements.</p>
              {!isDischarged && (
                <div className="mt-4">
                  <CreateCarePlanDialog patientId={patient.id} />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {patient.carePlans.map((plan: any) => (
                <Card key={plan.id}>
                  <CardHeader className="border-b bg-muted/20">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-xl font-bold">{plan.title}</CardTitle>
                        <CardDescription className="mt-1">
                          Période : {formatDate(plan.startDate)} {plan.endDate ? `au ${formatDate(plan.endDate)}` : "• En cours"}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={plan.status === "ACTIVE" ? "bg-emerald-500" : "bg-zinc-500"}>
                          {plan.status === "ACTIVE" ? "Actif" : plan.status}
                        </Badge>
                        <PDFDownloadButton
                          documentName={`Plan_Soins_${patient.user.lastName}_${plan.title}`}
                          buttonText="Télécharger"
                          type="careplan"
                          data={{ patient, plan }}
                          variant="outline"
                          size="sm"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6 grid md:grid-cols-2 gap-6">
                    {/* Medications */}
                    <div className="space-y-4">
                      <h4 className="font-semibold text-base flex items-center gap-2 border-b pb-2">
                        <Activity className="h-5 w-5 text-primary" />
                        Traitements et Médicaments
                      </h4>
                      {plan.medications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun traitement associé.</p>
                      ) : (
                        <ul className="space-y-3">
                          {plan.medications.map((med: any) => (
                            <li key={med.id} className="text-sm p-3 bg-muted/40 rounded-lg border border-border/50">
                              <p className="font-semibold text-foreground">{med.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">Dosage : {med.dosage} • Fréquence : {med.frequency}</p>
                              {med.instructions && <p className="text-xs italic text-muted-foreground mt-1.5">{med.instructions}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Tasks */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="font-semibold text-base flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          Tâches et protocole de soins
                        </h4>
                        {!isDischarged && <CreateCareTaskDialog carePlanId={plan.id} patientId={patient.id} />}
                      </div>
                      {plan.tasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucune tâche planifiée dans ce plan.</p>
                      ) : (
                        <ul className="space-y-3">
                          {plan.tasks.map((task: any) => (
                            <li key={task.id} className="text-sm p-3 bg-muted/40 rounded-lg border border-border/50 flex items-start gap-3">
                              <TaskStatusToggle taskId={task.id} patientId={patient.id} initialStatus={task.status} />
                              <div className="flex-1">
                                <p className={`font-medium ${task.status === "COMPLETED" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                  {task.title}
                                </p>
                                {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                                <p className="text-[11px] text-muted-foreground mt-1">Planifié pour le {formatDateTime(task.scheduledFor)}</p>
                              </div>
                              <Badge variant={task.status === "COMPLETED" ? "default" : "secondary"} className="shrink-0">
                                {task.status === "COMPLETED" ? "Terminée" : "En attente"}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

          {/* Tab Content: Rendez-vous */}
          <TabsContent value="appointments" className="pt-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold tracking-tight">Historique des visites</h3>
            </div>
            {patient.appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucun rendez-vous planifié.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {patient.appointments.map((apt: any) => (
                  <Card key={apt.id}>
                    <CardHeader className="py-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base font-bold">{apt.title}</CardTitle>
                          <CardDescription className="mt-1 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(apt.scheduledAt)}
                          </CardDescription>
                        </div>
                        <Badge variant={apt.status === "SCHEDULED" ? "default" : "secondary"}>
                          {apt.status === "SCHEDULED" ? "Planifié" : apt.status === "COMPLETED" ? "Terminé" : apt.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4 text-sm space-y-2">
                      <p className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(apt.scheduledAt)} ({apt.durationMinutes} min)
                      </p>
                      <p className="text-xs text-muted-foreground">Type : {apt.type}</p>
                      {apt.caregiver && (
                        <p className="text-xs font-medium">Soignant : {apt.caregiver.user.firstName} {apt.caregiver.user.lastName}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab Content: Incidents */}
          <TabsContent value="incidents" className="pt-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold tracking-tight">Alertes & Incidents signalés</h3>
            </div>
            {patient.incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucun incident à signaler.</p>
            ) : (
              <div className="space-y-4">
                {patient.incidents.map((incident: any) => (
                  <Card key={incident.id} className={incident.status === "OPEN" ? "border-red-200 bg-red-50/5" : ""}>
                    <CardHeader className="py-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base font-bold flex items-center gap-2">
                            {incident.status === "OPEN" && <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />}
                            {incident.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Signalé le {formatDateTime(incident.createdAt)}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className={incident.priority === "CRITICAL" || incident.priority === "HIGH" ? "bg-red-500/10 text-red-600 border-red-500/20" : ""}>
                            {incident.priority}
                          </Badge>
                          <Badge variant={incident.status === "RESOLVED" ? "default" : "secondary"}>
                            {incident.status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <p className="text-sm text-foreground/90 leading-relaxed">{incident.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
    </div>
  );
}
