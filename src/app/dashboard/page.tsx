import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Users,
  Calendar,
  AlertCircle,
  Bell,
  Building2,
  Wallet,
  AlertTriangle,
  Clock,
  Mail,
  FlaskConical,
  Stethoscope,
  ChevronRight,
  Zap,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  UserPlus,
  MessageSquare,
  Package,
  TrendingUp,
  HeartPulse,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSuperAdminOverview } from "@/actions/super-admin";
import CacheWriter from "@/components/cache-writer";
import SimpleBarChart from "@/components/dashboard/simple-bar-chart";
import CountTrendChart from "@/components/dashboard/count-trend-chart";
import { buildDayBuckets, buildWeekBuckets, countByBucket } from "@/lib/dashboard-stats";

function formatTime(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.organization?.type === "CLINIC") {
    redirect(`/dashboard/clinics/${currentUser.organizationId}`);
  }

  const orgFilter: any = {};
  const isHoldingAdmin = currentUser.organization?.type === "HOLDING";
  const isSuperAdmin = currentUser.role === "SUPER_ADMIN";

  // Utilisés par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ». Cette route n'a aucun id dans son
  // URL : organizationId vient donc entièrement du hint côté loading.tsx (seul cas autorisé).
  const cachedAt = new Date().toISOString();
  const orgIdForCache = currentUser.organizationId ?? "none";

  if (isSuperAdmin) {
    // For Super Admin, we just show a totally different layout early return
    // — les 5 requêtes ci-dessous sont indépendantes, on les lance en parallèle.
    const [holdingsCount, clinicsCount, usersCount, patientsCount, overviewRes] = await Promise.all([
      prisma.organization.count({ where: { type: "HOLDING" } }),
      prisma.organization.count({ where: { type: "CLINIC" } }),
      prisma.user.count({ where: { role: { not: "SUPER_ADMIN" } } }),
      prisma.patient.count(),
      getSuperAdminOverview(),
    ]);
    const overview = overviewRes.success ? overviewRes.data! : {
      totalRevenue: 0,
      planBreakdown: [] as { plan: string; count: number }[],
      holdingsToWatch: [] as { id: string; name: string; licenseExpiresAt: Date | null; subscriptionStatus: string; reasons: string[] }[],
      recentHoldings: [] as { id: string; name: string; plan: string; createdAt: Date }[],
      recentContactMessages: [] as { id: string; name: string; subject: string; status: string; createdAt: Date }[],
    };

    const planLabels: Record<string, string> = { TRIAL: "Essai", BASIC: "Basique", PREMIUM: "Premium", ENTERPRISE: "Entreprise" };

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2 animate-fade-up">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Tableau de bord Système
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
            Vue globale de l'infrastructure SaaS MedDoc.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5 animate-fade-up" style={{ animationDelay: "150ms" } as React.CSSProperties}>
          <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Total Holdings</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{holdingsCount}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Total Cliniques</CardTitle>
              <Building2 className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{clinicsCount}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Utilisateurs</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{usersCount}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Patients Globaux</CardTitle>
              <Activity className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{patientsCount}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-emerald-200/50 dark:border-emerald-900/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Revenu</CardTitle>
              <Wallet className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {new Intl.NumberFormat("fr-FR").format(Math.round(overview.totalRevenue))} FCFA
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 animate-fade-up" style={{ animationDelay: "225ms" } as React.CSSProperties}>
          {/* Plan breakdown */}
          <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Répartition par forfait</CardTitle>
              <CardDescription className="text-xs">Nombre de holdings par forfait souscrit.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {overview.planBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Aucune holding pour le moment.</p>
              ) : (
                <SimpleBarChart
                  data={overview.planBreakdown.map((p) => ({ label: planLabels[p.plan] || p.plan, value: p.count }))}
                  valueLabel="Holdings"
                  color="var(--chart-5)"
                />
              )}
            </CardContent>
          </Card>

          {/* Holdings to watch */}
          <Card className="rounded-2xl border border-amber-200/50 dark:border-amber-900/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Holdings à surveiller</CardTitle>
                <CardDescription className="text-xs">Licence bientôt expirée ou abonnement inactif.</CardDescription>
              </div>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="pt-2">
              {overview.holdingsToWatch.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Rien à signaler.</p>
              ) : (
                <div className="space-y-3">
                  {overview.holdingsToWatch.slice(0, 6).map((h) => (
                    <Link key={h.id} href="/dashboard/holdings" className="flex items-center justify-between gap-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg p-1.5 -m-1.5 transition-colors">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{h.name}</span>
                      <div className="flex gap-1.5 shrink-0">
                        {h.reasons.includes("EXPIRING") && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                            {h.licenseExpiresAt && new Date(h.licenseExpiresAt) < new Date() ? "Expirée" : "Expire bientôt"}
                          </Badge>
                        )}
                        {h.reasons.includes("INACTIVE") && (
                          <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">
                            {h.subscriptionStatus === "CANCELLED" ? "Annulé" : "Inactif"}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 animate-fade-up" style={{ animationDelay: "300ms" } as React.CSSProperties}>
          {/* Recent holdings */}
          <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Dernières holdings créées</CardTitle>
              <Clock className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="pt-2">
              {overview.recentHoldings.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Aucune holding pour le moment.</p>
              ) : (
                <div className="space-y-3">
                  {overview.recentHoldings.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{h.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">{new Date(h.createdAt).toLocaleDateString("fr-FR")}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent contact messages */}
          <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Derniers messages de contact</CardTitle>
              <Mail className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="pt-2">
              {overview.recentContactMessages.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Aucun message reçu.</p>
              ) : (
                <div className="space-y-3">
                  {overview.recentContactMessages.map((m) => (
                    <Link key={m.id} href="/dashboard/contact-messages" className="flex items-center justify-between gap-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg p-1.5 -m-1.5 transition-colors">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">{m.subject}</span>
                        <span className="text-[10px] text-slate-400">{m.name}</span>
                      </span>
                      {m.status === "NEW" && <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 shrink-0" variant="outline">Nouveau</Badge>}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <CacheWriter
          cacheKey={`dashboard:${orgIdForCache}:SUPER_ADMIN`}
          updatedAt={cachedAt}
          routeFamily="dashboard"
          contextHint={{ organizationId: orgIdForCache, isSuperAdmin: true, isHoldingAdmin: false, role: currentUser.role }}
          data={{
            holdingsCount,
            clinicsCount,
            usersCount,
            patientsCount,
            totalRevenue: overview.totalRevenue,
            planBreakdown: overview.planBreakdown,
            holdingsToWatch: overview.holdingsToWatch.slice(0, 6).map((h) => ({
              id: h.id,
              name: h.name,
              licenseExpiresAt: h.licenseExpiresAt ? new Date(h.licenseExpiresAt).toISOString() : null,
              subscriptionStatus: h.subscriptionStatus,
              reasons: h.reasons,
            })),
            recentHoldings: overview.recentHoldings.slice(0, 5).map((h) => ({
              id: h.id,
              name: h.name,
              createdAt: new Date(h.createdAt).toISOString(),
            })),
            recentContactMessages: overview.recentContactMessages.slice(0, 5).map((m) => ({
              id: m.id,
              name: m.name,
              subject: m.subject,
              status: m.status,
              createdAt: new Date(m.createdAt).toISOString(),
            })),
          }}
        />
      </div>
    );
  }

  if (isHoldingAdmin) {
    orgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } }
    ];
  } else if ((currentUser.organization?.type as string) === "CLINIC") {
    orgFilter.organizationId = currentUser.organizationId;
  } else {
    // Sentinel garanti de ne renvoyer aucun résultat : contrairement à une chaîne
    // arbitraire, un tableau `in` vide ne nécessite aucun cast en ObjectId côté
    // Mongo et ne fait donc pas planter Prisma (P2023) pour un utilisateur sans organisation.
    orgFilter.organizationId = { in: [] };
  }

  // Query recent notifications for current user
  const mutedNotificationTypes = currentUser.mutedNotificationTypes ?? [];

  // Regroupe les stats sous forme d'un helper pour pouvoir la lancer en parallèle
  // avec les autres requêtes indépendantes ci-dessous, tout en gardant sa propre
  // dépendance interne (clinics + patientsGroupByOrg ne dépendent que de orgFilter).
  async function fetchClinicStats(): Promise<any[]> {
    if (!isHoldingAdmin) return [];

    const [clinics, patientsGroupByOrg] = await Promise.all([
      prisma.organization.findMany({
        where: { parentId: currentUser!.organizationId, type: "CLINIC" },
        select: { id: true, name: true }
      }),
      prisma.patient.groupBy({
        by: ['organizationId'],
        _count: true,
        where: orgFilter
      }),
    ]);

    const holdingPatientsCount = patientsGroupByOrg.find(g => g.organizationId === currentUser!.organizationId)?._count || 0;

    return [
      { id: currentUser!.organizationId, name: "Siège (Holding)", count: holdingPatientsCount },
      ...clinics.map(clinic => {
        const count = patientsGroupByOrg.find(g => g.organizationId === clinic.id)?._count || 0;
        return { id: clinic.id, name: clinic.name, count };
      })
    ].sort((a, b) => b.count - a.count);
  }

  // Tendances de la holding (toutes cliniques rattachées) : rendez-vous des 7 prochains jours et
  // nouveaux patients des 8 dernières semaines. Mêmes règles de périmètre que les compteurs
  // au-dessus (orgFilter) ; réservé à la holding, les autres profils n'ont pas cette vue.
  async function fetchHoldingCharts() {
    if (!isHoldingAdmin) return null;

    const now = new Date();
    const dayBuckets = buildDayBuckets(now, 7);
    const weekBuckets = buildWeekBuckets(now, 8);

    const [appointments, newPatients] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          status: { not: "CANCELLED" },
          scheduledAt: { gte: dayBuckets[0].start, lt: dayBuckets[dayBuckets.length - 1].end },
          patient: orgFilter,
        },
        select: { scheduledAt: true },
      }),
      prisma.patient.findMany({
        where: { ...orgFilter, createdAt: { gte: weekBuckets[0].start } },
        select: { createdAt: true },
      }),
    ]);

    const appointmentsByDay = countByBucket(appointments.map((a) => a.scheduledAt), dayBuckets);
    const patientsByWeek = countByBucket(newPatients.map((p) => p.createdAt), weekBuckets);
    return {
      appointments: dayBuckets.map((b, i) => ({ label: b.label, value: appointmentsByDay[i] })),
      newPatients: weekBuckets.map((b, i) => ({ label: b.label, value: patientsByWeek[i] })),
    };
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Query database for actual stats — toutes ces requêtes sont indépendantes.
  const [
    patientsCount,
    appointmentsCount,
    openIncidentsCount,
    activePlansCount,
    notifications,
    aiAnalyses,
    clinicStats,
    holdingCharts,
    todaysAppointments,
    criticalLabOrders,
  ] = await Promise.all([
    prisma.patient.count({
      where: orgFilter,
    }),
    prisma.appointment.count({
      where: {
        status: "SCHEDULED",
        patient: orgFilter
      },
    }),
    prisma.incident.count({
      where: {
        status: "OPEN",
        patient: orgFilter
      },
    }),
    prisma.carePlan.count({
      where: {
        status: "ACTIVE",
        patient: orgFilter
      },
    }),
    prisma.notification.findMany({
      where: {
        userId: currentUser.id,
        ...(mutedNotificationTypes.length > 0 ? { type: { notIn: mutedNotificationTypes } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.aIAnalysis.findMany({
      where: {
        patient: orgFilter
      },
      include: {
        patient: {
          include: { user: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    fetchClinicStats(),
    fetchHoldingCharts(),
    prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: startOfToday, lte: endOfToday },
        status: { not: "CANCELLED" },
        patient: orgFilter,
      },
      include: {
        patient: { include: { user: true } },
        caregiver: { include: { user: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 6,
    }),
    prisma.labOrder.findMany({
      where: {
        priority: "URGENT",
        status: { notIn: ["DELIVERED", "CANCELLED"] },
        patient: orgFilter,
      },
      include: {
        patient: { include: { user: true } },
      },
      take: 3,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const now = new Date();
  const greeting = getGreeting(now);
  const todayLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Upcoming appointments (next ones from today)
  const upcomingToday = todaysAppointments.filter((a) => new Date(a.scheduledAt) >= now);
  const pastToday = todaysAppointments.filter((a) => new Date(a.scheduledAt) < now);

  return (
    <div className="space-y-6">
      {/* Hero Greeting */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 dark:border-primary/10 p-6 animate-fade-up">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-primary/70 uppercase tracking-widest mb-1">{todayLabel}</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {greeting}, <span className="text-primary">{currentUser.firstName}</span> 👋
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {todaysAppointments.length === 0
                ? "Aucun rendez-vous prévu aujourd'hui — profil dégagé."
                : `${todaysAppointments.length} rendez-vous aujourd'hui${upcomingToday.length > 0 ? `, prochain à ${formatTime(upcomingToday[0].scheduledAt)}` : " — tous terminés"}.`}
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button asChild size="sm" className="gap-1.5 rounded-xl shadow-xs">
              <Link href="/dashboard/appointments">
                <Calendar className="h-3.5 w-3.5" />
                Calendrier
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-xl">
              <Link href="/dashboard/patients">
                <Users className="h-3.5 w-3.5" />
                Patients
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

        {/* Patients actifs */}
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-slate-300/50 dark:hover:border-slate-700/50 hover:bg-white dark:hover:bg-slate-900 animate-fade-up" style={{ animationDelay: "0ms" } as React.CSSProperties}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Patients actifs</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-1">{patientsCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Enregistrés dans le système</p>
          </CardContent>
        </Card>

        {/* Rendez-vous planifiés */}
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-slate-300/50 dark:hover:border-slate-700/50 hover:bg-white dark:hover:bg-slate-900 animate-fade-up" style={{ animationDelay: "75ms" } as React.CSSProperties}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Rendez-vous planifiés</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-1">{appointmentsCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Rendez-vous à venir</p>
          </CardContent>
        </Card>

        {/* Incidents à traiter */}
        <Card className="rounded-2xl border border-red-200/40 dark:border-red-950/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-red-300/50 dark:hover:border-red-900/50 hover:bg-white dark:hover:bg-slate-900 animate-fade-up" style={{ animationDelay: "150ms" } as React.CSSProperties}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-red-500/80 dark:text-red-400/80">Incidents à traiter</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 animate-pulse">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 tracking-tight mt-1">{openIncidentsCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Nécessitent une action urgente</p>
          </CardContent>
        </Card>

        {/* Plans de soins actifs */}
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-slate-300/50 dark:hover:border-slate-700/50 hover:bg-white dark:hover:bg-slate-900 animate-fade-up" style={{ animationDelay: "225ms" } as React.CSSProperties}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Plans de soins actifs</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-1">{activePlansCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Protocoles cliniques en cours</p>
          </CardContent>
        </Card>

      </div>

      {isHoldingAdmin && holdingCharts && (
        <div className="grid gap-4 lg:grid-cols-2 animate-fade-up" style={{ animationDelay: "300ms" } as React.CSSProperties}>
          <CountTrendChart
            title="Rendez-vous à venir"
            description="7 prochains jours, toutes cliniques, annulés exclus."
            icon={<Calendar className="h-4 w-4 text-blue-500" />}
            data={holdingCharts.appointments}
            valueLabel="Rendez-vous"
            color="var(--chart-1)"
            emptyText="Aucun rendez-vous prévu cette semaine."
          />
          <CountTrendChart
            title="Nouveaux patients"
            description="8 dernières semaines, toutes cliniques."
            icon={<Users className="h-4 w-4 text-emerald-500" />}
            data={holdingCharts.newPatients}
            valueLabel="Patients"
            color="var(--chart-2)"
            variant="area"
            emptyText="Aucun nouveau patient sur la période."
          />
        </div>
      )}

      {/* Today's Agenda + Critical Lab alerts */}
      <div className="grid gap-6 lg:grid-cols-5 animate-fade-up" style={{ animationDelay: "300ms" } as React.CSSProperties}>

        {/* Agenda du jour */}
        <Card className="lg:col-span-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-200">Agenda du jour</CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {todaysAppointments.length === 0 ? "Aucun rendez-vous aujourd'hui" : `${todaysAppointments.length} rendez-vous • ${upcomingToday.length} à venir`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {upcomingToday.length > 0 && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/25 text-[10px] font-bold gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {upcomingToday.length} à venir
                </Badge>
              )}
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
                <Link href="/dashboard/appointments">Calendrier <ChevronRight className="h-3 w-3" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {todaysAppointments.length === 0 ? (
              <div className="py-10 text-center">
                <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Journée libre — aucun rendez-vous prévu.</p>
                <Button asChild variant="outline" size="sm" className="mt-3 text-xs rounded-xl gap-1.5">
                  <Link href="/dashboard/appointments"><Calendar className="h-3.5 w-3.5" /> Planifier un RDV</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {todaysAppointments.map((apt) => {
                  const aptTime = new Date(apt.scheduledAt);
                  const isPast = aptTime < now;
                  const isNow = !isPast && (aptTime.getTime() - now.getTime()) < 30 * 60 * 1000;
                  return (
                    <Link
                      key={apt.id}
                      href="/dashboard/appointments"
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-xs group ${
                        isPast
                          ? "border-border/40 bg-muted/20 opacity-60"
                          : isNow
                          ? "border-primary/30 bg-primary/5 shadow-xs"
                          : "border-border/60 bg-card hover:border-primary/30 hover:bg-primary/5"
                      }`}
                    >
                      {/* Time indicator */}
                      <div className="shrink-0 w-12 text-center">
                        <p className={`text-sm font-bold tabular-nums ${ isPast ? "text-muted-foreground" : isNow ? "text-primary" : "text-foreground" }`}>
                          {formatTime(apt.scheduledAt)}
                        </p>
                        {isNow && <span className="text-[9px] font-bold text-primary uppercase tracking-wider">En cours</span>}
                        {isPast && <span className="text-[9px] text-muted-foreground uppercase">Passé</span>}
                      </div>

                      {/* Colored dot */}
                      <div className={`h-2 w-2 rounded-full shrink-0 ${ isPast ? "bg-slate-300 dark:bg-slate-600" : isNow ? "bg-primary animate-pulse" : "bg-emerald-500" }`} />

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{apt.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground truncate">
                            {apt.patient.user.lastName} {apt.patient.user.firstName}
                            {apt.caregiver && ` • Dr. ${apt.caregiver.user.lastName}`}
                          </p>
                        </div>
                      </div>

                      {/* Duration */}
                      <div className="shrink-0 text-right">
                        <span className="text-[10px] text-muted-foreground font-medium">{apt.durationMinutes} min</span>
                        {apt.status === "COMPLETED" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto mt-0.5" />}
                        {apt.status === "CANCELLED" && <AlertCircle className="h-3.5 w-3.5 text-red-400 ml-auto mt-0.5" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column: Critical Lab + AI Vigilance */}
        <div className="lg:col-span-2 space-y-4">

          {/* Critical & Urgent Lab orders */}
          <Card className={`rounded-2xl shadow-xs ${
            criticalLabOrders.length > 0
              ? "border-red-300/60 dark:border-red-900/50 bg-gradient-to-b from-red-500/5 to-transparent"
              : "border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md"
          }`}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-red-100/60 dark:border-red-900/30 pb-3">
              <div>
                <CardTitle className={`text-sm font-bold flex items-center gap-2 ${ criticalLabOrders.length > 0 ? "text-red-700 dark:text-red-300" : "text-slate-700 dark:text-slate-300" }`}>
                  <FlaskConical className="h-4 w-4" />
                  Examens Urgents
                  {criticalLabOrders.length > 0 && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {criticalLabOrders.length === 0 ? "Aucun examen urgent en attente" : `${criticalLabOrders.length} analyse(s) urgentes non traitées`}
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] text-primary gap-0.5 shrink-0">
                <Link href="/dashboard/lab">Voir <ChevronRight className="h-3 w-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-3">
              {criticalLabOrders.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400/60 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground font-medium">Tout est traité.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {criticalLabOrders.map((order) => (
                    <Link key={order.id} href={`/dashboard/lab/${order.id}`} className="flex items-center gap-3 p-2.5 rounded-xl border border-red-300/50 dark:border-red-900/40 bg-red-500/5 hover:bg-red-500/10 transition-colors">
                      <div className="h-8 w-8 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 font-bold text-xs">
                        {order.patient.user.lastName[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground truncate">{order.patient.user.lastName} {order.patient.user.firstName}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Zap className="h-3 w-3 text-amber-500" />
                          <p className="text-[10px] text-muted-foreground">URGENT</p>
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Vigilance compact */}
          <Card className="rounded-2xl border border-violet-200/50 dark:border-violet-900/40 bg-gradient-to-b from-violet-500/5 to-transparent shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between border-b border-violet-100/40 dark:border-violet-900/30 pb-3">
              <CardTitle className="text-sm font-bold bg-gradient-to-r from-violet-600 to-indigo-500 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
                Vigilance IA
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] text-violet-600 dark:text-violet-400 gap-0.5 shrink-0">
                <Link href="/dashboard/ai-assistant">Voir <ChevronRight className="h-3 w-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-3 space-y-2">
              {aiAnalyses.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground font-medium">Aucune analyse IA générée.</p>
              ) : (
                aiAnalyses.map((a) => (
                  <div key={a.id} className="p-2.5 rounded-xl border border-violet-100/40 dark:border-violet-950 bg-violet-500/5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-violet-700 dark:text-violet-300 truncate">{a.patient.user.lastName} {a.patient.user.firstName}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                        a.riskScore > 70 ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      }`}>{a.riskScore}%</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">{a.summary}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notifications + full-width section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 animate-fade-up" style={{ animationDelay: "375ms" } as React.CSSProperties}>

        {/* Notifications list */}
        <Card className="col-span-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Notifications Récentes</CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">Alertes système et planification de soins.</CardDescription>
            </div>
            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                Aucune notification récente. Les alertes d'incidents s'afficheront ici.
              </div>
            ) : (
              <div className="space-y-4">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-4 border-b border-slate-100 dark:border-slate-800/40 pb-4 last:border-0 last:pb-0 transition-all duration-300 hover:bg-slate-50/20 dark:hover:bg-slate-800/10 rounded-lg p-1.5 -m-1.5">
                    <div className={`p-2 rounded-xl shrink-0 ${n.type === "INCIDENT" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}>
                      {n.type === "INCIDENT" ? <AlertCircle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
                        {n.createdAt.toLocaleDateString("fr-FR")} à {n.createdAt.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions panel */}
        <Card className="col-span-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/60 pb-4">
            <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-200">Accès Rapide</CardTitle>
            <CardDescription className="text-xs mt-0.5">Raccourcis vers les fonctionnalités clés</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { href: "/dashboard/appointments", icon: Calendar, label: "Nouveau RDV", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
                { href: "/dashboard/patients", icon: UserPlus, label: "Nouveau Patient", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
                { href: "/dashboard/lab", icon: FlaskConical, label: "Analyses Lab", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
                { href: "/dashboard/incidents", icon: AlertTriangle, label: "Incidents", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
                { href: "/dashboard/messages", icon: MessageSquare, label: "Messagerie", color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
                { href: "/dashboard/ai-assistant", icon: Stethoscope, label: "Assistant IA", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
              ].map(({ href, icon: Icon, label, color, bg }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border border-border/60 bg-card hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 group"
                >
                  <div className={`h-9 w-9 rounded-xl ${bg} ${color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground text-center leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {isHoldingAdmin && clinicStats.length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: "450ms" } as React.CSSProperties}>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-4 mt-2">Répartition des patients par établissement</h2>
          <Card className="mb-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Patients suivis</CardTitle>
              <CardDescription className="text-xs">Nombre de dossiers patients par établissement.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <SimpleBarChart
                data={clinicStats.map((stat) => ({ label: stat.name, value: stat.count }))}
                valueLabel="Patients"
                color="var(--chart-1)"
              />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {clinicStats.map(stat => (
              <Card key={stat.id} className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-1" title={stat.name}>{stat.name}</CardTitle>
                  <Building2 className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{stat.count}</div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">Patients suivis</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <CacheWriter
        cacheKey={`dashboard:${orgIdForCache}:${currentUser.role}`}
        updatedAt={cachedAt}
        routeFamily="dashboard"
        contextHint={{ organizationId: orgIdForCache, isSuperAdmin: false, isHoldingAdmin, role: currentUser.role }}
        data={{
          patientsCount,
          appointmentsCount,
          openIncidentsCount,
          activePlansCount,
          notifications: notifications.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            createdAt: new Date(n.createdAt).toISOString(),
          })),
          aiAnalyses: aiAnalyses.map((a) => ({
            id: a.id,
            riskScore: a.riskScore,
            summary: a.summary,
            patient: { firstName: a.patient.user.firstName, lastName: a.patient.user.lastName },
          })),
          clinicStats: clinicStats.map((s: any) => ({ id: s.id, name: s.name, count: s.count })),
        }}
      />
    </div>
  );
}
