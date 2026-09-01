import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User as UserIcon, Calendar, Clock, AlertTriangle, FileText, Activity, ShieldAlert, BrainCircuit, HeartPulse, Stethoscope, FlaskConical, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddRecordDialog from "./add-record-dialog";
import AddIncidentDialog from "./add-incident-dialog";
import RunAiButton from "./run-ai-button";
import CreateCarePlanDialog from "./create-care-plan-dialog";
import CreateCareTaskDialog from "./create-care-task-dialog";
import TaskStatusToggle from "./task-status-toggle";
import ReassignPatientDialog from "../reassign-patient-dialog";
import { getClinics } from "@/actions/organizations";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";
import VitalSignsDialog from "./vital-signs-dialog";
import VitalSignsChart from "./vital-signs-chart";
import CloseCarePlanDialog from "./close-care-plan-dialog";
import ReopenCarePlanDialog from "./reopen-care-plan-dialog";
import { getPatientVitalSigns } from "@/actions/vitals";
import { listPrescriptions } from "@/actions/prescriptions";
import PrescriptionsPanel from "./prescriptions-panel";
import { Pill } from "lucide-react";
import { listLabOrders } from "@/actions/lab";
import NewLabOrderDialog from "@/app/dashboard/lab/new-lab-order-dialog";
import { listPregnancies } from "@/actions/maternity";
import MaternityPanel from "./maternity-panel";
import { Baby } from "lucide-react";
import CacheWriter from "@/components/cache-writer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PatientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const hasAccess = await verifyPatientAccess(id, currentUser);
  if (!hasAccess) {
    notFound(); // Using notFound to hide the existence of the patient
  }

  const isHoldingAdmin = currentUser.role === "ADMIN" && currentUser.organization?.type === "HOLDING";
  // ADMIN (holding) consulte en lecture seule ; PHARMACIST n'a qu'un accès identité limité (cf. plan RBAC).
  const canWrite = ["COORDINATOR", "MEDECIN", "CAREGIVER"].includes(currentUser.role);
  // Rédiger/renouveler/envoyer une ordonnance reste réservé à l'autorité clinique complète.
  const canPrescribe = ["COORDINATOR", "MEDECIN"].includes(currentUser.role);
  // Prescrire un examen labo (autorité diagnostique) — mêmes rôles que LAB_ORDER_ROLES côté serveur.
  const canOrderLab = ["COORDINATOR", "MEDECIN"].includes(currentUser.role);
  const isPharmacist = currentUser.role === "PHARMACIST";
  let clinics: { id: string; name: string }[] = [];
  if (isHoldingAdmin) {
    const clinicsRes = await getClinics();
    if (clinicsRes.clinics) {
      clinics = clinicsRes.clinics.map(c => ({ id: c.id, name: c.name }));
    }
  }

  // Utilisé par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ».
  const cachedAt = new Date().toISOString();

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      user: true,
      medicalRecords: {
        include: {
          appointment: { select: { id: true, title: true, scheduledAt: true } },
        },
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

  // Ces quatre lectures sont indépendantes les unes des autres — les lancer en parallèle
  // plutôt que séquentiellement évite de multiplier les allers-retours réseau vers la base
  // (chacune reste défensive : une erreur individuelle retombe sur un tableau vide, comme
  // avant).
  const [vitalSigns, prescriptions, labOrders, pregnancies] = await Promise.all([
    getPatientVitalSigns(id).then((r) => (r.success && r.data ? r.data : [])).catch(() => []),
    isPharmacist ? Promise.resolve([]) : listPrescriptions({ patientId: id }).then((r) => (r.success ? r.data || [] : [])).catch(() => []),
    isPharmacist ? Promise.resolve([]) : listLabOrders({ patientId: id }).then((r) => (r.success ? r.data || [] : [])).catch(() => []),
    isPharmacist ? Promise.resolve([]) : listPregnancies(id).then((r) => (r.success ? r.data || [] : [])).catch(() => []),
  ]);

  (patient as any).vitalSigns = vitalSigns;
  const showMaternityTab = patient.sex === "F" || pregnancies.length > 0;

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

  // Accès pharmacien : identité uniquement, aucun onglet clinique (dossier, consultations, IA...).
  if (isPharmacist) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/patients">
          <Button variant="ghost" className="gap-2 pl-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux patients
          </Button>
        </Link>
        <div className="rounded-2xl border bg-card text-card-foreground shadow-md overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
          <div className="p-6 md:p-8 flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <UserIcon className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {patient.user.lastName} {patient.user.firstName}
              </h1>
              <p className="text-muted-foreground mt-1">
                {calculateAge(patient.dateOfBirth)} ans • {patient.sex === "M" ? "Homme" : patient.sex === "F" ? "Femme" : patient.sex || "Sexe non renseigné"} • Né(e) le {formatDate(patient.dateOfBirth)}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          En tant que pharmacien(ne), vous n'avez pas accès au dossier médical de ce patient. Les informations
          nécessaires à la délivrance des traitements sont disponibles depuis le journal des ventes en Finance & Pharmacie.
        </div>
        <CacheWriter
          cacheKey={`patient-detail:${patient.id}:pharmacist`}
          updatedAt={cachedAt}
          routeFamily="patient-detail"
          contextHint={{ isPharmacist: true }}
          data={{
            firstName: patient.user.firstName,
            lastName: patient.user.lastName,
            dateOfBirth: patient.dateOfBirth.toISOString(),
          }}
        />
      </div>
    );
  }

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
        <div className="flex gap-2 flex-wrap">
          {canWrite && !isDischarged && <VitalSignsDialog patientId={patient.id} />}
          {canWrite && activeCarePlan && !isDischarged && (
            <CloseCarePlanDialog
              carePlanId={activeCarePlan.id}
              patientId={patient.id}
              patientName={patientFullName}
            />
          )}
          {canWrite && isDischarged && (
            <ReopenCarePlanDialog
              patientId={patient.id}
              patientName={patientFullName}
            />
          )}
          {canWrite && !isDischarged && (
            <Button asChild variant="outline" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
              <Link href={`/dashboard/patients/${patient.id}/consultation`}>
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
          {canWrite && !isDischarged && <AddIncidentDialog patientId={patient.id} reportedById={currentUser.id} />}
          {canWrite && !isDischarged && <AddRecordDialog patientId={patient.id} />}
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
          {canWrite && <ReopenCarePlanDialog patientId={patient.id} patientName={patientFullName} />}
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
                {calculateAge(patient.dateOfBirth)} ans • {patient.sex === "M" ? "Homme" : patient.sex === "F" ? "Femme" : patient.sex || "Sexe non renseigné"} • Né(e) le {formatDate(patient.dateOfBirth)}
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
        <TabsList className="bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl h-auto flex-wrap justify-start">
          <TabsTrigger
            value="vitals"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Évolution & Constantes ({(patient as any).vitalSigns?.length || 0})
          </TabsTrigger>
          <TabsTrigger
            value="records"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Dossier médical
          </TabsTrigger>
          <TabsTrigger
            value="prescriptions"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Ordonnances ({prescriptions.length})
          </TabsTrigger>
          <TabsTrigger
            value="lab"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Laboratoire ({labOrders.length})
          </TabsTrigger>
          {showMaternityTab && (
            <TabsTrigger
              value="maternity"
              className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
            >
              <Baby className="h-4 w-4 text-pink-500" />
              Maternité ({pregnancies.length})
            </TabsTrigger>
          )}
          <TabsTrigger
            value="careplans"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Plan de soins
          </TabsTrigger>
          <TabsTrigger
            value="appointments"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Rendez-vous
          </TabsTrigger>
          <TabsTrigger
            value="incidents"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Incidents ({patient.incidents.length})
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            <BrainCircuit className="h-4 w-4 text-indigo-500" />
            Analyse IA
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
                {canWrite && !isDischarged && <AddRecordDialog patientId={patient.id} />}
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
                            <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                              <span>Ajouté le {formatDateTime(record.createdAt)}</span>
                              {record.appointment && (
                                <Link href={`/dashboard/appointments/${record.appointment.id}/consultation`}>
                                  <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                                    <Stethoscope className="h-2.5 w-2.5" />
                                    {record.appointment.title}
                                  </Badge>
                                </Link>
                              )}
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

        {/* Tab Content: Ordonnances */}
        <TabsContent value="prescriptions" className="pt-6 space-y-4">
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Pill className="h-5 w-5 text-blue-500" />
            Historique des ordonnances
          </h3>
          <PrescriptionsPanel prescriptions={prescriptions} canPrescribe={canPrescribe} />
        </TabsContent>

        {/* Tab Content: Laboratoire */}
        <TabsContent value="lab" className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-blue-500" />
              Demandes d&apos;analyses
            </h3>
            {canOrderLab && !isDischarged && (
              <NewLabOrderDialog patients={[patient]} defaultPatientId={patient.id} />
            )}
          </div>

          {labOrders.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucune demande d&apos;analyse</h4>
              <p className="text-sm text-muted-foreground mt-1">Les demandes d&apos;analyses de laboratoire pour ce patient apparaîtront ici.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {labOrders.map((order: any) => {
                const hasCritical = (order.results || []).some((r: any) => r.isAbnormal && !r.validatedAt);
                return (
                  <Link key={order.id} href={`/dashboard/lab/${order.id}`}>
                    <div className={`border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors ${hasCritical ? "border-red-400/60 dark:border-red-900/50" : ""}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-1.5">
                          {order.tests.map((t: string) => (
                            <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
                          ))}
                          {order.paymentStatus === "PENDING" && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">En attente de paiement</Badge>
                          )}
                          {hasCritical && (
                            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20 gap-1 animate-pulse">
                              <AlertTriangle className="h-3 w-3" /> Critique
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Prescrit le {formatDateTime(order.createdAt)} • Statut : {order.status}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab Content: Maternité */}
        {showMaternityTab && (
          <TabsContent value="maternity" className="pt-6">
            <MaternityPanel patientId={patient.id} pregnancies={pregnancies} canWrite={canWrite} isDischarged={isDischarged} />
          </TabsContent>
        )}

        {/* Tab Content: Plan de Soins */}
        <TabsContent value="careplans" className="pt-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold tracking-tight">Plans de Soins & Interventions</h3>
            {canWrite && !isDischarged && <CreateCarePlanDialog patientId={patient.id} />}
          </div>

          {patient.carePlans.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <HeartPulse className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun plan de soins actif</h4>
              <p className="text-sm text-muted-foreground mt-1">Les plans de soins coordonnent les interventions et les traitements.</p>
              {canWrite && !isDischarged && (
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
                        {canWrite && !isDischarged && <CreateCareTaskDialog carePlanId={plan.id} patientId={patient.id} />}
                      </div>
                      {plan.tasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucune tâche planifiée dans ce plan.</p>
                      ) : (
                        <ul className="space-y-3">
                          {plan.tasks.map((task: any) => (
                            <li key={task.id} className="text-sm p-3 bg-muted/40 rounded-lg border border-border/50 flex items-start gap-3">
                              {canWrite && <TaskStatusToggle taskId={task.id} patientId={patient.id} initialStatus={task.status} />}
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
        <TabsContent value="appointments" className="pt-6">
          {patient.appointments.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun rendez-vous</h4>
              <p className="text-sm text-muted-foreground mt-1">Aucune intervention n'a été planifiée.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {patient.appointments.map((apt: any) => (
                <Link key={apt.id} href={`/dashboard/appointments/${apt.id}/consultation`}>
                  <Card className="hover:shadow-sm hover:border-primary/30 transition-all cursor-pointer h-full">
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
                      <p className="text-xs font-medium text-primary flex items-center gap-1 pt-1">
                        <Stethoscope className="h-3.5 w-3.5" />
                        {apt.status === "COMPLETED" ? "Voir la consultation" : "Ouvrir l'espace consultation"}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab Content: Incidents */}
        <TabsContent value="incidents" className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight">Historique des Incidents & Alertes</h3>
            {canWrite && <AddIncidentDialog patientId={patient.id} reportedById={currentUser.id} />}
          </div>

          {patient.incidents.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun incident signalé</h4>
              <p className="text-sm text-muted-foreground mt-1">Tous les indicateurs sont au vert pour ce patient.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {patient.incidents.map((incident: any) => (
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
                {canWrite && <RunAiButton patientId={patient.id} />}
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
                          {patient.aiAnalyses[0].riskFactors.map((factor: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="border-rose-500/20 text-rose-600 bg-rose-500/5">
                              {factor}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommandations de suivi :</h5>
                        <ul className="list-disc pl-4 space-y-1.5 text-sm text-foreground/90">
                          {patient.aiAnalyses[0].recommendations.map((rec: string, idx: number) => (
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

      <CacheWriter
        cacheKey={`patient-detail:${patient.id}:full`}
        updatedAt={cachedAt}
        routeFamily="patient-detail"
        contextHint={{ isPharmacist: false }}
        data={{
          firstName: patient.user.firstName,
          lastName: patient.user.lastName,
          sex: patient.sex,
          dateOfBirth: patient.dateOfBirth.toISOString(),
          status: (patient as any).status,
          dependencyLevel: patient.dependencyLevel,
          isDischarged,
          pathologiesCount: patient.pathologies.length,
          allergiesCount: patient.allergies.length,
          medicalRecordsCount: patient.medicalRecords.length,
          prescriptionsCount: prescriptions.length,
          labOrdersCount: labOrders.length,
          carePlansCount: patient.carePlans.length,
          incidentsCount: patient.incidents.length,
          activeCarePlanTitle: activeCarePlan?.title ?? null,
        }}
      />
    </div>
  );
}
