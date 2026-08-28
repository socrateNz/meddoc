import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar, Clock, Users, FlaskConical, FileText, Sparkles, MessageSquare,
  Pill, ArrowRight, User as UserIcon, HeartPulse,
} from "lucide-react";
import { listLabOrders } from "@/actions/lab";
import { listMedicalRecords } from "@/actions/patients";
import PatientTable from "@/app/dashboard/patients/patient-table";

interface PageProps {
  params: Promise<{ id: string }>;
}

const LAB_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PRESCRIBED: { label: "Prescrit", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  SAMPLE_COLLECTED: { label: "Échantillon prélevé", className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
  RECEIVED_AT_LAB: { label: "Reçu au laboratoire", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  IN_ANALYSIS: { label: "En analyse", className: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  TO_VALIDATE: { label: "À valider", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  VALIDATED: { label: "Validé", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  DELIVERED: { label: "Livré", className: "bg-teal-500/10 text-teal-600 border-teal-500/20" },
  CANCELLED: { label: "Annulé", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function formatDateShort(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(date));
}

export default async function MedecinDashboardPage({ params }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  // Défense en profondeur : le middleware (restrictedSections.medecin) gate déjà cette route,
  // ce contrôle évite juste qu'un autre rôle clinique atterrisse ici via un lien direct.
  if (currentUser.role !== "MEDECIN") {
    redirect(`/dashboard/clinics/${clinicId}`);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const in14Days = new Date(startOfToday);
  in14Days.setDate(in14Days.getDate() + 14);

  // Le profil soignant doit être résolu avant de pouvoir filtrer les RDV par caregiverId,
  // mais cette chaîne interne n'a pas besoin de bloquer les requêtes patients/labo/notes
  // ci-dessous — elles sont indépendantes et tournent en parallèle via le Promise.all global.
  async function fetchAppointments() {
    const caregiverProfile = await prisma.caregiver.findUnique({ where: { userId: currentUser!.id } });
    if (!caregiverProfile) return { todayAppointments: [] as any[], upcomingAppointments: [] as any[] };
    const [todayAppointments, upcomingAppointments] = await Promise.all([
      prisma.appointment.findMany({
        where: { caregiverId: caregiverProfile.id, scheduledAt: { gte: startOfToday, lt: endOfToday } },
        include: { patient: { include: { user: true } } },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: {
          caregiverId: caregiverProfile.id,
          scheduledAt: { gte: endOfToday, lt: in14Days },
          status: "SCHEDULED",
        },
        include: { patient: { include: { user: true } } },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
    ]);
    return { todayAppointments, upcomingAppointments };
  }

  const [{ todayAppointments, upcomingAppointments }, patients, labOrdersRes, medicalRecordsRes] = await Promise.all([
    fetchAppointments(),
    prisma.patient.findMany({
      where: { organizationId: clinicId },
      include: { user: true, carePlans: { select: { id: true, status: true } } },
      orderBy: { user: { lastName: "asc" } },
    }),
    listLabOrders({ organizationId: clinicId, orderedById: currentUser.id }),
    listMedicalRecords({ createdById: currentUser.id, organizationId: clinicId }),
  ]);

  const labOrders = labOrdersRes.success ? labOrdersRes.data || [] : [];
  const medicalRecords = medicalRecordsRes.success ? medicalRecordsRes.data || [] : [];
  const pendingLabOrders = labOrders.filter((o: any) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const recentMedicalRecords = medicalRecords.slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <HeartPulse className="h-8 w-8 text-blue-500" />
          Bonjour, Dr {currentUser.lastName}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Voici votre activité clinique du jour.
        </p>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400">Consultations aujourd&apos;hui</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold">{todayAppointments.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400">Patients de la clinique</CardTitle>
            <Users className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold">{patients.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400">Résultats labo en attente</CardTitle>
            <FlaskConical className={`h-4 w-4 ${pendingLabOrders.length > 0 ? "text-amber-500" : "text-slate-400"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-extrabold ${pendingLabOrders.length > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{pendingLabOrders.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400">Notes cliniques rédigées</CardTitle>
            <FileText className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold">{medicalRecords.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Consultations du jour */}
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-500" /> Consultations du jour</CardTitle>
              <CardDescription>Accès rapide au dossier patient.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayAppointments.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Aucune consultation planifiée aujourd&apos;hui.</p>
            ) : (
              todayAppointments.map((apt: any) => (
                <Link
                  key={apt.id}
                  href={apt.status !== "COMPLETED" ? `/dashboard/appointments/${apt.id}/consultation` : `/dashboard/clinics/${clinicId}/patients/${apt.patientId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-xs font-bold">
                      {formatTime(apt.scheduledAt)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{apt.patient?.user?.lastName} {apt.patient?.user?.firstName}</p>
                      <p className="text-xs text-slate-500 truncate">{apt.title}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{apt.status === "COMPLETED" ? "Terminée" : "À faire"}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Prochains rendez-vous */}
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-4 w-4 text-indigo-500" /> Prochains rendez-vous</CardTitle>
              <CardDescription>14 prochains jours.</CardDescription>
            </div>
            <Link href={`/dashboard/clinics/${clinicId}/appointments`}>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">Agenda complet <ArrowRight className="h-3.5 w-3.5" /></Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Aucun rendez-vous à venir sur cette période.</p>
            ) : (
              upcomingAppointments.map((apt: any) => (
                <div key={apt.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{apt.patient?.user?.lastName} {apt.patient?.user?.firstName}</p>
                      <p className="text-xs text-slate-500 truncate">{formatDateShort(apt.scheduledAt)} • {formatTime(apt.scheduledAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Résultats labo récents/en attente */}
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><FlaskConical className="h-4 w-4 text-amber-500" /> Résultats de laboratoire</CardTitle>
              <CardDescription>Demandes prescrites récemment ou en attente.</CardDescription>
            </div>
            <Link href={`/dashboard/clinics/${clinicId}/lab`}>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">Tout voir <ArrowRight className="h-3.5 w-3.5" /></Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {labOrders.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Aucune demande d&apos;analyse récente.</p>
            ) : (
              labOrders.slice(0, 6).map((order: any) => {
                const statusInfo = LAB_STATUS_LABELS[order.status] || LAB_STATUS_LABELS.PRESCRIBED;
                return (
                  <Link key={order.id} href={`/dashboard/lab/${order.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{order.patient?.user?.lastName} {order.patient?.user?.firstName}</p>
                      <p className="text-xs text-slate-500 truncate">{(order.tests || []).slice(0, 2).join(", ")}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${statusInfo.className}`}>{statusInfo.label}</Badge>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Notes cliniques / historique de consultations */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><FileText className="h-4 w-4 text-violet-500" /> Mes notes cliniques</CardTitle>
            <CardDescription>Historique de vos consultations passées.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMedicalRecords.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Aucune note clinique rédigée pour le moment.</p>
            ) : (
              recentMedicalRecords.map((record: any) => (
                <Link key={record.id} href={`/dashboard/clinics/${clinicId}/patients/${record.patientId}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{record.patient?.user?.lastName} {record.patient?.user?.firstName}</p>
                    <p className="text-xs text-slate-500 truncate">{record.title}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(record.createdAt))}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Prescriptions récentes — module dédié à venir (Phase 3) */}
      <Card className="rounded-2xl border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-500"><Pill className="h-4 w-4" /> Prescriptions récentes</CardTitle>
          <CardDescription>Le module Prescriptions électroniques (ordonnances structurées, renouvellement, vérification des interactions) arrive prochainement.</CardDescription>
        </CardHeader>
      </Card>

      {/* Accès rapide */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/dashboard/clinics/${clinicId}/ai-assistant`}>
          <Card className="rounded-2xl border-violet-200 dark:border-violet-900/40 hover:shadow-md transition-shadow h-full">
            <CardContent className="py-5 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Assistant Clinique IA</p>
                <p className="text-xs text-slate-500">Support à la décision, résumés patient</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/dashboard/clinics/${clinicId}/messages`}>
          <Card className="rounded-2xl border-emerald-200 dark:border-emerald-900/40 hover:shadow-md transition-shadow h-full">
            <CardContent className="py-5 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Messagerie</p>
                <p className="text-xs text-slate-500">Communiquer avec l&apos;équipe de la clinique</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Mes patients */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">Patients de la clinique</h2>
        <PatientTable patients={patients as any} clinicId={clinicId} />
      </div>
    </div>
  );
}
