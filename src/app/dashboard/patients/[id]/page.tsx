import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User as UserIcon, Calendar, Clock, AlertTriangle, FileText, Activity, ShieldAlert, BrainCircuit, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddRecordDialog from "./add-record-dialog";
import AddIncidentDialog from "./add-incident-dialog";
import RunAiButton from "./run-ai-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PatientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const patient = await prisma.patient.findUnique({
    where: { id },
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

  return (
    <div className="space-y-6">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/patients">
          <Button variant="ghost" className="gap-2 pl-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux patients
          </Button>
        </Link>
        <div className="flex gap-2">
          <AddIncidentDialog patientId={patient.id} reportedById={currentUser.id} />
          <AddRecordDialog patientId={patient.id} />
        </div>
      </div>

      {/* Patient Profile Card (Premium Layout) */}
      <div className="rounded-2xl border bg-card text-card-foreground shadow-md overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <UserIcon className="h-8 w-8 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  {patient.user.lastName} {patient.user.firstName}
                </h1>
                <Badge variant={patient.dependencyLevel > 3 ? "destructive" : "secondary"} className="h-5">
                  Niveau dépendance {patient.dependencyLevel}
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
          <TabsTrigger
            value="ai"
            className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none gap-1.5"
          >
            <BrainCircuit className="h-4 w-4 text-indigo-500" />
            Analyse IA
          </TabsTrigger>
        </TabsList>

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
                      {patient.pathologies.map((pathology) => (
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
                      {patient.allergies.map((allergy) => (
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
                <AddRecordDialog patientId={patient.id} />
              </div>

              {patient.medicalRecords.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center bg-card">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                  <h4 className="font-medium text-base">Aucun document</h4>
                  <p className="text-sm text-muted-foreground mt-1">Ajoutez un rapport ou une note de visite pour ce patient.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {patient.medicalRecords.map((record) => (
                    <Card key={record.id} className="hover:shadow-sm transition-shadow">
                      <CardHeader className="py-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <CardTitle className="text-base font-semibold">{record.title}</CardTitle>
                            <CardDescription className="mt-1">
                              Ajouté le {formatDateTime(record.createdAt)}
                            </CardDescription>
                          </div>
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
          {patient.carePlans.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <HeartPulse className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun plan de soins actif</h4>
              <p className="text-sm text-muted-foreground mt-1">Les plans de soins coordonnent les interventions et les traitements.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {patient.carePlans.map((plan) => (
                <Card key={plan.id}>
                  <CardHeader className="border-b bg-muted/20">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-xl font-bold">{plan.title}</CardTitle>
                        <CardDescription className="mt-1">
                          Période : {formatDate(plan.startDate)} {plan.endDate ? `au ${formatDate(plan.endDate)}` : "• En cours"}
                        </CardDescription>
                      </div>
                      <Badge className={plan.status === "ACTIVE" ? "bg-emerald-500" : "bg-zinc-500"}>
                        {plan.status === "ACTIVE" ? "Actif" : plan.status}
                      </Badge>
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
                          {plan.medications.map((med) => (
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
                      <h4 className="font-semibold text-base flex items-center gap-2 border-b pb-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Tâches et protocole de soins
                      </h4>
                      {plan.tasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucune tâche planifiée dans ce plan.</p>
                      ) : (
                        <ul className="space-y-3">
                          {plan.tasks.map((task) => (
                            <li key={task.id} className="text-sm p-3 bg-muted/40 rounded-lg border border-border/50 flex justify-between items-start gap-4">
                              <div>
                                <p className="font-medium text-foreground">{task.title}</p>
                                {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                                <p className="text-[11px] text-muted-foreground mt-1">Planifié pour le {formatDateTime(task.scheduledFor)}</p>
                              </div>
                              <Badge variant={task.status === "COMPLETED" ? "default" : "secondary"}>
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
        <TabsContent value="appointments" className="pt-6">
          {patient.appointments.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun rendez-vous</h4>
              <p className="text-sm text-muted-foreground mt-1">Aucune intervention n'a été planifiée.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {patient.appointments.map((apt) => (
                <Card key={apt.id} className="hover:shadow-sm transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                      <Badge variant={apt.status === "SCHEDULED" ? "default" : "secondary"}>
                        {apt.status === "SCHEDULED" ? "Planifié" : apt.status}
                      </Badge>
                      <Badge variant="outline">{apt.type}</Badge>
                    </div>
                    <CardTitle className="text-base font-semibold mt-3">{apt.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {formatDateTime(apt.scheduledAt)}
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      {apt.durationMinutes} minutes
                    </p>
                    {apt.caregiver && (
                      <div className="pt-3 border-t mt-3 flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                          {apt.caregiver.user.lastName[0]}{apt.caregiver.user.firstName[0]}
                        </div>
                        <span className="text-xs text-foreground font-medium">
                          Soignant : {apt.caregiver.user.lastName} {apt.caregiver.user.firstName}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab Content: Incidents */}
        <TabsContent value="incidents" className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight">Historique des Incidents & Alertes</h3>
            <AddIncidentDialog patientId={patient.id} reportedById={currentUser.id} />
          </div>

          {patient.incidents.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun incident signalé</h4>
              <p className="text-sm text-muted-foreground mt-1">Tous les indicateurs sont au vert pour ce patient.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {patient.incidents.map((incident) => (
                <Card key={incident.id} className="border-l-4 border-l-destructive">
                  <CardHeader className="py-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-bold text-destructive">{incident.title}</CardTitle>
                          <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                            {incident.priority}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                            {incident.status}
                          </Badge>
                        </div>
                        <CardDescription className="mt-1">
                          Signalé le {formatDateTime(incident.createdAt)}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                      {incident.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab Content: Analyse IA */}
        <TabsContent value="ai" className="pt-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 bg-gradient-to-br from-indigo-50/40 via-purple-50/20 to-transparent">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-2">
                  <BrainCircuit className="h-6 w-6 text-indigo-500" />
                </div>
                <CardTitle className="text-lg">Score de risque IA</CardTitle>
                <CardDescription>
                  Évaluation algorithmique du niveau de risque patient.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                {patient.aiAnalyses.length === 0 ? (
                  <div className="text-center space-y-2">
                    <span className="text-5xl font-extrabold text-zinc-300">--</span>
                    <p className="text-sm text-muted-foreground">Aucune analyse disponible.</p>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <span className={`text-6xl font-extrabold ${
                      patient.aiAnalyses[0].riskScore > 70 
                        ? "text-rose-500 animate-pulse" 
                        : patient.aiAnalyses[0].riskScore > 40 
                          ? "text-amber-500" 
                          : "text-emerald-500"
                    }`}>
                      {patient.aiAnalyses[0].riskScore}%
                    </span>
                    <p className="text-sm font-semibold mt-2">Niveau de vigilance recommandé</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">Recommandations Cliniques IA</h3>
                <RunAiButton patientId={patient.id} />
              </div>

              {patient.aiAnalyses.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center bg-card">
                  <BrainCircuit className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                  <h4 className="font-medium text-base">Aucun rapport d'analyse</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Générez instantanément des diagnostics de risque et des recommandations d'accompagnement basés sur le profil médical complet du patient.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-bold">Résumé clinique prédictif</CardTitle>
                      <CardDescription>Analyse générée le {formatDateTime(patient.aiAnalyses[0].createdAt)}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {patient.aiAnalyses[0].summary}
                      </p>
                      
                      <div className="space-y-2">
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Facteurs de risque identifiés :</h5>
                        <div className="flex flex-wrap gap-2">
                          {patient.aiAnalyses[0].riskFactors.map((factor, idx) => (
                            <Badge key={idx} variant="outline" className="border-rose-500/20 text-rose-600 bg-rose-500/5">
                              {factor}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommandations de suivi :</h5>
                        <ul className="list-disc pl-4 space-y-1.5 text-sm text-foreground/90">
                          {patient.aiAnalyses[0].recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
