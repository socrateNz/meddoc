import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Calendar, AlertCircle, Bell, Building2, Wallet, AlertTriangle, Clock, Mail } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSuperAdminOverview } from "@/actions/super-admin";
import CacheWriter from "@/components/cache-writer";

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
    const maxPlanCount = Math.max(1, ...overview.planBreakdown.map((p) => p.count));

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
            <CardContent className="space-y-3 pt-2">
              {overview.planBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Aucune holding pour le moment.</p>
              ) : (
                overview.planBreakdown.map((p) => (
                  <div key={p.plan} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                      <span>{planLabels[p.plan] || p.plan}</span>
                      <span>{p.count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(p.count / maxPlanCount) * 100}%` }} />
                    </div>
                  </div>
                ))
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

  // Query database for actual stats — toutes ces requêtes sont indépendantes.
  const [patientsCount, appointmentsCount, openIncidentsCount, activePlansCount, notifications, aiAnalyses, clinicStats] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Vue d'ensemble</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bonjour <span className="font-semibold text-slate-800 dark:text-slate-200">{currentUser.firstName} {currentUser.lastName}</span>, ravi de vous revoir sur MedDoc.
        </p>
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">

        {/* Notifications list */}
        <Card className="col-span-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs animate-fade-up" style={{ animationDelay: "300ms" } as React.CSSProperties}>
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

        {/* AI Analyses summaries */}
        <Card className="col-span-3 rounded-2xl border border-violet-200/50 dark:border-violet-850/50 bg-gradient-to-b from-white/70 to-violet-50/10 dark:from-slate-900/70 dark:to-violet-950/5 backdrop-blur-md shadow-xs animate-fade-up" style={{ animationDelay: "375ms" } as React.CSSProperties}>
          <CardHeader className="flex flex-row items-center justify-between border-b border-violet-100/60 dark:border-violet-900/30 pb-4">
            <div>
              <CardTitle className="text-lg font-bold bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">Vigilance IA Clinique</CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">Derniers rapports préventifs Gemini.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {aiAnalyses.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                Aucune analyse IA générée. Lancez une analyse depuis le profil d'un patient.
              </div>
            ) : (
              aiAnalyses.map((a) => (
                <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-violet-100/40 dark:border-violet-950 bg-gradient-to-r from-violet-500/5 to-indigo-500/5 dark:from-violet-950/10 dark:to-indigo-950/10 p-4 transition-all duration-300 hover:border-violet-200/80 dark:hover:border-violet-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-violet-850 dark:text-violet-300">
                      {a.patient.user.lastName} {a.patient.user.firstName}
                    </span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${a.riskScore > 70
                        ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      }`}>
                      Risque {a.riskScore}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                    {a.summary}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

      </div>

      {isHoldingAdmin && clinicStats.length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: "450ms" } as React.CSSProperties}>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-4 mt-2">Répartition des patients par établissement</h2>
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
