"use client";

// Corps complet du dossier patient — PARTAGÉ par les deux pages qui l'affichent
// (/dashboard/patients/[id] et /dashboard/clinics/[id]/patients/[patientId], cf.
// patient-detail-data.ts pour la même logique côté lectures). Avant ce fichier, les deux pages
// portaient chacune leur propre copie de ~800 lignes de JSX, qui avaient fini par diverger sans
// que personne ne le décide (ex: la page clinique n'avait ni l'onglet Analyse IA, ni le badge
// groupe sanguin/lit, ni le lien « voir la consultation » sur une demande de labo) — une page
// racontait un dossier patient plus pauvre que l'autre pour le même patient. Un seul composant
// maintenant ; les deux pages ne diffèrent plus que par leurs liens (basePath) et comment elles
// résolvent l'organisation courante.
//
// Onglet « Aperçu » (nouveau, actif par défaut) : résume en un coup d'œil ce qui, avant, n'était
// visible qu'en ouvrant un par un chaque onglet — plan de soins actif, prochain rendez-vous,
// dernières constantes, incidents ouverts — et un fil d'activité qui fusionne dossier médical,
// ordonnances, labo, rendez-vous et incidents, chaque ligne pointant vers sa consultation ou sa
// page réelle quand elle existe (cf. buildPatientActivityTimeline). C'est la réponse directe au
// retour « je ne vois pas beaucoup de liaisons » : avant, un dossier médical ou une ordonnance liés
// à un rendez-vous ne le montraient que dans leur propre onglet, jamais nulle part ailleurs.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User as UserIcon,
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  Activity,
  ShieldAlert,
  BrainCircuit,
  HeartPulse,
  Stethoscope,
  FlaskConical,
  ChevronRight,
  Droplet,
  Bed as BedIcon,
  Pill,
  Baby,
  Thermometer,
  LayoutGrid,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddRecordDialog from "./add-record-dialog";
import AddIncidentDialog from "./add-incident-dialog";
import RunAiButton from "./run-ai-button";
import CreateCarePlanDialog from "./create-care-plan-dialog";
import CreateCareTaskDialog from "./create-care-task-dialog";
import TaskStatusToggle from "./task-status-toggle";
import ReassignPatientDialog from "../reassign-patient-dialog";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";
import VitalSignsDialog from "./vital-signs-dialog";
import VitalSignsChart from "./vital-signs-chart";
import VitalSignsTable from "./vital-signs-table";
import CloseCarePlanDialog from "./close-care-plan-dialog";
import ReopenCarePlanDialog from "./reopen-care-plan-dialog";
import PrescriptionsPanel from "./prescriptions-panel";
import NewLabOrderDialog from "@/app/dashboard/lab/new-lab-order-dialog";
import MaternityPanel from "./maternity-panel";
import ScheduleAppointmentDialog from "./schedule-appointment-dialog";
import CacheWriter from "@/components/cache-writer";
import PaymentStatusBadge from "@/components/payment-status-badge";
import {
  buildPatientActivityTimeline,
  calculatePatientAge,
  findNextAppointment,
  formatPatientDate,
  formatPatientDateTime,
  type ActivityEntry,
} from "./patient-detail-data";

const ACTIVITY_META: Record<ActivityEntry["category"], { icon: typeof FileText; label: string; className: string }> = {
  record: { icon: FileText, label: "Dossier", className: "text-slate-500 bg-slate-500/10" },
  prescription: { icon: Pill, label: "Ordonnance", className: "text-blue-500 bg-blue-500/10" },
  lab: { icon: FlaskConical, label: "Laboratoire", className: "text-violet-500 bg-violet-500/10" },
  appointment: { icon: Calendar, label: "Rendez-vous", className: "text-emerald-500 bg-emerald-500/10" },
  incident: { icon: AlertTriangle, label: "Incident", className: "text-rose-500 bg-rose-500/10" },
};

const INCIDENT_PRIORITY_LABEL: Record<string, { label: string; className: string }> = {
  LOW: { label: "Faible", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  MEDIUM: { label: "Modérée", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  HIGH: { label: "Élevée", className: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  CRITICAL: { label: "Critique", className: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
};

const INCIDENT_STATUS_LABEL: Record<string, string> = {
  OPEN: "Ouvert",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
};

// Lien texte discret "voir plus" réutilisé par chaque carte de l'onglet Aperçu — même style que
// les boutons "Voir tout" de la page Finance (cf. finance-view.tsx), pour rester cohérent avec le
// reste de l'application plutôt que d'inventer un nouveau style de lien ici.
function JumpToTabLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0"
    >
      {label} <ChevronRight className="h-3 w-3" />
    </button>
  );
}

interface PatientDetailViewProps {
  patient: any;
  currentUser: { id: string; role: string; organizationId?: string | null };
  isHoldingAdmin: boolean;
  canWrite: boolean;
  canPrescribe: boolean;
  canOrderLab: boolean;
  clinics: { id: string; name: string }[];
  vitalSigns: any[];
  // Pagination des constantes et des grossesses : la page courante est dans `vitalSigns` / `pregnancies`.
  vitalSignsPage: { page: number; pageSize: number; total: number; query: Record<string, string | undefined> };
  pregnanciesPage: { page: number; pageSize: number; total: number; query: Record<string, string | undefined> };
  prescriptions: any[];
  labOrders: any[];
  // Totaux serveur : les listes ci-dessus ne contiennent qu'une page (20 au plus).
  prescriptionsPage: { page: number; pageSize: number; total: number; query: Record<string, string | undefined> };
  labOrdersPage: { page: number; pageSize: number; total: number; query: Record<string, string | undefined> };
  pregnancies: any[];
  caregivers: any[];
  // "/dashboard/patients" ou `/dashboard/clinics/${clinicId}/patients` — seule différence réelle
  // entre les deux pages appelantes (retour liste, lien "nouvelle consultation").
  basePath: string;
  cachedAt: string;
}

export default function PatientDetailView({
  patient,
  currentUser,
  isHoldingAdmin,
  canWrite,
  canPrescribe,
  canOrderLab,
  clinics,
  vitalSigns,
  vitalSignsPage,
  pregnanciesPage,
  prescriptions,
  labOrders,
  prescriptionsPage,
  labOrdersPage,
  pregnancies,
  caregivers,
  basePath,
  cachedAt,
}: PatientDetailViewProps) {
  const [activeTab, setActiveTab] = useState("apercu");

  const activeCarePlan = patient.carePlans.find((cp: any) => cp.status === "ACTIVE");
  const isDischarged = patient.status === "DISCHARGED" || (patient.carePlans.length > 0 && !activeCarePlan);
  const patientFullName = `${patient.user.firstName} ${patient.user.lastName}`;
  const showMaternityTab = patient.sex === "F" || pregnanciesPage.total > 0;

  // `patient` reste typé `any` (comme le reste de ce composant, cf. patient.carePlans.map((cp: any)
  // => ...) plus bas) : le cast explicite évite que l'inférence générique de findNextAppointment
  // retombe sur son seul type de contrainte ({status, scheduledAt}) faute de mieux.
  const nextAppointment = useMemo(() => findNextAppointment(patient.appointments), [patient.appointments]) as any;
  const openIncidents = useMemo(() => patient.incidents.filter((i: any) => i.status !== "RESOLVED"), [patient.incidents]);
  const latestVitals = vitalSigns[0] ?? null;
  const timeline = useMemo(
    () =>
      buildPatientActivityTimeline({
        medicalRecords: patient.medicalRecords,
        prescriptions,
        labOrders,
        appointments: patient.appointments,
        incidents: patient.incidents,
      }),
    [patient.medicalRecords, prescriptions, labOrders, patient.appointments, patient.incidents]
  );

  return (
    <div className="space-y-6">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link href={basePath}>
          <Button variant="ghost" className="gap-2 pl-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux patients
          </Button>
        </Link>
        <div className="flex gap-2 flex-wrap">
          {canWrite && !isDischarged && <VitalSignsDialog patientId={patient.id} patientName={patientFullName} />}
          {canWrite && activeCarePlan && !isDischarged && (
            <CloseCarePlanDialog carePlanId={activeCarePlan.id} patientId={patient.id} patientName={patientFullName} />
          )}
          {canWrite && isDischarged && <ReopenCarePlanDialog patientId={patient.id} patientName={patientFullName} />}
          {canWrite && !isDischarged && (
            <Button asChild variant="outline" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
              <Link href={`${basePath}/${patient.id}/consultation`}>
                <Stethoscope className="h-4 w-4" />
                Nouvelle consultation
              </Link>
            </Button>
          )}
          <PDFDownloadButton
            documentName={`Dossier_Medical_${patient.user.lastName}_${patient.user.firstName}`}
            buttonText="Exporter le Dossier (PDF)"
            type="patient"
            data={{ ...patient, organizationName: patient.organization?.name, organizationLogoUrl: patient.organization?.logoUrl }}
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
                Ce dossier est actuellement verrouillé en lecture seule. Pour réaliser de nouvelles consultations, enregistrer des constantes ou ajouter des actes, vous devez d&apos;abord réouvrir le dossier.
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
                {patient.bloodType && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/25 text-xs font-bold">
                    <Droplet className="h-3 w-3 fill-rose-500 text-rose-500" />
                    {patient.bloodType}
                  </span>
                )}
                {patient.bed && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/40 text-xs font-medium gap-1">
                    <BedIcon className="h-3 w-3 text-blue-500" />
                    {patient.bed.room?.name || "Chambre"} • Lit {patient.bed.label} ({patient.bed.room?.ward?.name || ""})
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                {calculatePatientAge(patient.dateOfBirth)} ans • {patient.sex === "M" ? "Homme" : patient.sex === "F" ? "Femme" : patient.sex || "Sexe non renseigné"} • Né(e) le {formatPatientDate(patient.dateOfBirth)}
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
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Contact d&apos;urgence</span>
              <span className="text-sm font-medium mt-1 block">{patient.emergencyContact || "Aucun contact défini"}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Coordonnées</span>
              <span className="text-sm font-medium mt-1 block">{patient.user.phone || "Non spécifié"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Allergies & Medical Alert Banner — critique, reste visible quel que soit l'onglet actif */}
      {patient.allergies && patient.allergies.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-900 dark:text-rose-200 flex items-start gap-3.5 animate-fade-up">
          <div className="h-10 w-10 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h4 className="font-bold text-sm tracking-tight text-rose-800 dark:text-rose-300 uppercase">
              Alerte Médicale — Allergies signalées ({patient.allergies.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {patient.allergies.map((allergy: string, i: number) => (
                <Badge key={i} variant="outline" className="bg-rose-500/20 text-rose-900 dark:text-rose-200 border-rose-500/40 text-xs font-bold">
                  {allergy}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl h-auto flex-wrap justify-start">
          <TabsTrigger
            value="apercu"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            <LayoutGrid className="h-4 w-4 text-indigo-500" />
            Aperçu
          </TabsTrigger>
          <TabsTrigger
            value="vitals"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Évolution & Constantes ({vitalSignsPage.total})
          </TabsTrigger>
          <TabsTrigger
            value="records"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Dossier médical ({patient.medicalRecords.length})
          </TabsTrigger>
          <TabsTrigger
            value="prescriptions"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Ordonnances ({prescriptionsPage.total})
          </TabsTrigger>
          <TabsTrigger
            value="lab"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Laboratoire ({labOrdersPage.total})
          </TabsTrigger>
          {showMaternityTab && (
            <TabsTrigger
              value="maternity"
              className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
            >
              <Baby className="h-4 w-4 text-pink-500" />
              Maternité ({pregnanciesPage.total})
            </TabsTrigger>
          )}
          <TabsTrigger
            value="careplans"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Plan de soins ({patient.carePlans.length})
          </TabsTrigger>
          <TabsTrigger
            value="appointments"
            className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white"
          >
            Rendez-vous ({patient.appointments.length})
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

        {/* Onglet Aperçu — résumé + fil d'activité croisant tous les autres onglets */}
        <TabsContent value="apercu" className="pt-6 space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Profil clinique : pathologies + allergies, retirées de "Dossier médical" (ce ne sont
                pas des documents) pour n'avoir qu'un seul endroit où les chercher. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-rose-500" />
                  Profil clinique
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Pathologies</p>
                  {patient.pathologies.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune pathologie déclarée.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {patient.pathologies.map((pathology: string) => (
                        <Badge key={pathology} variant="secondary" className="text-[11px] px-2 py-0.5">
                          {pathology}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t border-border/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Allergies</p>
                  {patient.allergies.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune allergie déclarée.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {patient.allergies.map((allergy: string) => (
                        <Badge key={allergy} variant="outline" className="text-[11px] px-2 py-0.5 border-amber-500/30 text-amber-600 bg-amber-500/5">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Plan de soins actif */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Plan de soins
                </CardTitle>
                <JumpToTabLink label="Voir tout" onClick={() => setActiveTab("careplans")} />
              </CardHeader>
              <CardContent>
                {!activeCarePlan ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Aucun plan de soins actif pour ce patient.</p>
                    {canWrite && !isDischarged && <CreateCarePlanDialog patientId={patient.id} />}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">{activeCarePlan.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Depuis le {formatPatientDate(activeCarePlan.startDate)}
                    </p>
                    <div className="flex items-center gap-3 text-xs pt-1">
                      <span className="font-medium">{activeCarePlan.medications.length} traitement(s)</span>
                      <span className="font-medium">
                        {activeCarePlan.tasks.filter((t: any) => t.status !== "COMPLETED").length} / {activeCarePlan.tasks.length} tâche(s) en attente
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Prochain rendez-vous */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-500" />
                  Prochain rendez-vous
                </CardTitle>
                <JumpToTabLink label="Voir tout" onClick={() => setActiveTab("appointments")} />
              </CardHeader>
              <CardContent>
                {!nextAppointment ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Aucun rendez-vous planifié.</p>
                    {canWrite && !isDischarged && <ScheduleAppointmentDialog patientId={patient.id} caregivers={caregivers as any} />}
                  </div>
                ) : (
                  <Link href={`/dashboard/appointments/${nextAppointment.id}/consultation`} className="block space-y-1 group">
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">{nextAppointment.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {formatPatientDateTime(nextAppointment.scheduledAt)}
                    </p>
                    {nextAppointment.caregiver && (
                      <p className="text-xs text-muted-foreground">
                        Avec {nextAppointment.caregiver.user.firstName} {nextAppointment.caregiver.user.lastName}
                      </p>
                    )}
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Dernières constantes */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-blue-500" />
                  Dernières constantes
                </CardTitle>
                <JumpToTabLink label="Voir l'évolution" onClick={() => setActiveTab("vitals")} />
              </CardHeader>
              <CardContent>
                {!latestVitals ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Aucune constante enregistrée.</p>
                    {canWrite && !isDischarged && <VitalSignsDialog patientId={patient.id} patientName={patientFullName} />}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Température</p>
                        <p className="font-semibold">{latestVitals.temperature ? `${latestVitals.temperature} °C` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tension</p>
                        <p className="font-semibold">{latestVitals.bloodPressure || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Pouls</p>
                        <p className="font-semibold">{latestVitals.heartRate ? `${latestVitals.heartRate} BPM` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">SpO2</p>
                        <p className="font-semibold">{latestVitals.oxygenSaturation ? `${latestVitals.oxygenSaturation} %` : "—"}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                      Relevé le {formatPatientDateTime(latestVitals.createdAt)}
                      {latestVitals.recordedBy && ` par ${latestVitals.recordedBy.firstName} ${latestVitals.recordedBy.lastName}`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Incidents & alertes */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${openIncidents.length > 0 ? "text-rose-500" : "text-slate-400"}`} />
                  Incidents & alertes
                </CardTitle>
                <JumpToTabLink label="Voir tout" onClick={() => setActiveTab("incidents")} />
              </CardHeader>
              <CardContent>
                {patient.incidents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun incident signalé pour ce patient.</p>
                ) : openIncidents.length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Tous les incidents signalés sont résolus ({patient.incidents.length} au total).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {openIncidents.slice(0, 3).map((incident: any) => {
                      const priority = INCIDENT_PRIORITY_LABEL[incident.priority] || INCIDENT_PRIORITY_LABEL.MEDIUM;
                      return (
                        <div key={incident.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium truncate">{incident.title}</span>
                          <Badge variant="outline" className={`shrink-0 text-[10px] ${priority.className}`}>
                            {priority.label}
                          </Badge>
                        </div>
                      );
                    })}
                    {openIncidents.length > 3 && (
                      <p className="text-[11px] text-muted-foreground">+ {openIncidents.length - 3} autre(s)</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Fil d'activité — fusionne dossier médical, ordonnances, labo, rendez-vous et incidents */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-500" />
                Activité récente
              </CardTitle>
              <CardDescription>Les derniers événements de ce dossier, tous modules confondus.</CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucune activité enregistrée pour le moment.</p>
              ) : (
                <div className="space-y-1">
                  {timeline.map((entry) => {
                    const meta = ACTIVITY_META[entry.category];
                    const Icon = meta.icon;
                    const content = (
                      <>
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta.className}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{entry.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {meta.label} • {formatPatientDateTime(entry.date)}
                            {entry.meta ? ` • ${entry.meta}` : ""}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </>
                    );
                    const rowClass = "flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors";
                    return entry.href ? (
                      <Link key={entry.key} href={entry.href} className={rowClass}>
                        {content}
                      </Link>
                    ) : (
                      <button key={entry.key} type="button" onClick={() => entry.tab && setActiveTab(entry.tab)} className={`${rowClass} w-full text-left`}>
                        {content}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Évolution & Constantes */}
        <TabsContent value="vitals" className="pt-6">
          <VitalSignsChart vitalSigns={vitalSigns} />
          <VitalSignsTable vitalSigns={vitalSigns} />
          <PaginationNav
            page={vitalSignsPage.page}
            pageSize={vitalSignsPage.pageSize}
            total={vitalSignsPage.total}
            pathname={`${basePath}/${patient.id}`}
            query={vitalSignsPage.query}
            pageParam="vitalPage"
            itemLabel="relevé"
          />
        </TabsContent>

        {/* Tab Content: Dossier médical — uniquement les documents/comptes-rendus (pathologies et
            allergies sont désormais dans l'onglet Aperçu, ce ne sont pas des documents). */}
        <TabsContent value="records" className="pt-6 space-y-4">
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
                          <span>Ajouté le {formatPatientDateTime(record.createdAt)}</span>
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
                        data={{ patient, record, organizationName: patient.organization?.name, organizationLogoUrl: patient.organization?.logoUrl }}
                        variant="ghost"
                        size="sm"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <p className="text-sm text-foreground/95 whitespace-pre-line leading-relaxed">{record.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab Content: Ordonnances */}
        <TabsContent value="prescriptions" className="pt-6 space-y-4">
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Pill className="h-5 w-5 text-blue-500" />
            Historique des ordonnances
          </h3>
          <PrescriptionsPanel prescriptions={prescriptions} canPrescribe={canPrescribe} />
          <PaginationNav
            page={prescriptionsPage.page}
            pageSize={prescriptionsPage.pageSize}
            total={prescriptionsPage.total}
            pathname={`${basePath}/${patient.id}`}
            query={prescriptionsPage.query}
            pageParam="rxPage"
            itemLabel="ordonnance"
          />
        </TabsContent>

        {/* Tab Content: Laboratoire */}
        <TabsContent value="lab" className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-blue-500" />
              Demandes d&apos;analyses
            </h3>
            {canOrderLab && !isDischarged && <NewLabOrderDialog patients={[patient]} defaultPatientId={patient.id} organizationId={patient.organizationId ?? undefined} />}
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
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {order.tests.map((t: string) => (
                            <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
                          ))}
                          {order.appointment && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-500/20 bg-blue-500/5">
                              <Stethoscope className="h-2.5 w-2.5" />
                              {order.appointment.title}
                            </Badge>
                          )}
                          {order.pendingInvoice && <PaymentStatusBadge status={order.pendingInvoice.status} />}
                          {hasCritical && (
                            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20 gap-1 animate-pulse">
                              <AlertTriangle className="h-3 w-3" /> Critique
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Prescrit le {formatPatientDateTime(order.createdAt)} • Statut : {order.status}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <PaginationNav
            page={labOrdersPage.page}
            pageSize={labOrdersPage.pageSize}
            total={labOrdersPage.total}
            pathname={`${basePath}/${patient.id}`}
            query={labOrdersPage.query}
            pageParam="labPage"
            itemLabel="demande"
          />
        </TabsContent>

        {/* Tab Content: Maternité */}
        {showMaternityTab && (
          <TabsContent value="maternity" className="pt-6">
            <MaternityPanel patientId={patient.id} pregnancies={pregnancies} canWrite={canWrite} isDischarged={isDischarged} />
            <PaginationNav
              page={pregnanciesPage.page}
              pageSize={pregnanciesPage.pageSize}
              total={pregnanciesPage.total}
              pathname={`${basePath}/${patient.id}`}
              query={pregnanciesPage.query}
              pageParam="pregnancyPage"
              itemLabel="grossesse"
            />
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
                          Période : {formatPatientDate(plan.startDate)} {plan.endDate ? `au ${formatPatientDate(plan.endDate)}` : "• En cours"}
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
                          data={{ patient, plan, organizationName: patient.organization?.name, organizationLogoUrl: patient.organization?.logoUrl }}
                          variant="outline"
                          size="sm"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6 grid md:grid-cols-2 gap-6">
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
                              {canWrite && <TaskStatusToggle taskId={task.id} patientId={patient.id} initialStatus={task.status} taskTitle={task.title} />}
                              <div className="flex-1">
                                <p className={`font-medium ${task.status === "COMPLETED" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                  {task.title}
                                </p>
                                {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                                <p className="text-[11px] text-muted-foreground mt-1">Planifié pour le {formatPatientDateTime(task.scheduledFor)}</p>
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
            {canWrite && !isDischarged && <ScheduleAppointmentDialog patientId={patient.id} caregivers={caregivers as any} />}
          </div>
          {patient.appointments.length === 0 ? (
            <div className="border border-dashed rounded-xl p-12 text-center bg-card">
              <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium text-base">Aucun rendez-vous</h4>
              <p className="text-sm text-muted-foreground mt-1">Aucune intervention n&apos;a été planifiée.</p>
              {canWrite && !isDischarged && (
                <div className="mt-4 flex justify-center">
                  <ScheduleAppointmentDialog patientId={patient.id} caregivers={caregivers as any} />
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {patient.appointments.map((apt: any) => (
                <Link key={apt.id} href={`/dashboard/appointments/${apt.id}/consultation`}>
                  <Card className="hover:shadow-sm hover:border-primary/30 transition-all cursor-pointer h-full">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <Badge variant={apt.status === "SCHEDULED" ? "default" : "secondary"}>
                          {apt.status === "SCHEDULED" ? "Planifié" : apt.status === "COMPLETED" ? "Terminé" : apt.status === "CANCELLED" ? "Annulé" : apt.status}
                        </Badge>
                        <Badge variant="outline">{apt.type}</Badge>
                      </div>
                      <CardTitle className="text-base font-semibold mt-3">{apt.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2">
                      <p className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        {formatPatientDateTime(apt.scheduledAt)}
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
              {patient.incidents.map((incident: any) => {
                const priority = INCIDENT_PRIORITY_LABEL[incident.priority] || INCIDENT_PRIORITY_LABEL.MEDIUM;
                return (
                  <Card key={incident.id} className={incident.status === "OPEN" ? "border-l-4 border-l-destructive" : ""}>
                    <CardHeader className="py-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base font-bold text-destructive">{incident.title}</CardTitle>
                            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${priority.className}`}>
                              {priority.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                              {INCIDENT_STATUS_LABEL[incident.status] || incident.status}
                            </Badge>
                          </div>
                          <CardDescription className="mt-1">Signalé le {formatPatientDateTime(incident.createdAt)}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{incident.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
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
                <CardDescription>Évaluation algorithmique du niveau de risque patient.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                {patient.aiAnalyses.length === 0 ? (
                  <div className="text-center space-y-2">
                    <span className="text-5xl font-extrabold text-zinc-300">--</span>
                    <p className="text-sm text-muted-foreground">Aucune analyse disponible.</p>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <span
                      className={`text-6xl font-extrabold ${
                        patient.aiAnalyses[0].riskScore > 70
                          ? "text-rose-500 animate-pulse"
                          : patient.aiAnalyses[0].riskScore > 40
                            ? "text-amber-500"
                            : "text-emerald-500"
                      }`}
                    >
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
                  <h4 className="font-medium text-base">Aucun rapport d&apos;analyse</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Générez instantanément des diagnostics de risque et des recommandations d&apos;accompagnement basés sur le profil médical complet du patient.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-bold">Résumé clinique prédictif</CardTitle>
                      <CardDescription>Analyse générée le {formatPatientDateTime(patient.aiAnalyses[0].createdAt)}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-foreground/90 leading-relaxed">{patient.aiAnalyses[0].summary}</p>

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
          status: patient.status,
          dependencyLevel: patient.dependencyLevel,
          isDischarged,
          pathologiesCount: patient.pathologies.length,
          allergiesCount: patient.allergies.length,
          medicalRecordsCount: patient.medicalRecords.length,
          prescriptionsCount: prescriptionsPage.total,
          labOrdersCount: labOrdersPage.total,
          carePlansCount: patient.carePlans.length,
          incidentsCount: patient.incidents.length,
          activeCarePlanTitle: activeCarePlan?.title ?? null,
        }}
      />
    </div>
  );
}
