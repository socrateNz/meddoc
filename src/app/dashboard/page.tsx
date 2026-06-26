import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Users, Calendar, AlertCircle, Sparkles, Bell, Building2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const orgFilter: any = {};
  const isHoldingAdmin = currentUser.organization?.type === "HOLDING";
  const isSuperAdmin = currentUser.role === "SUPER_ADMIN";

  if (isSuperAdmin) {
    // For Super Admin, we just show a totally different layout early return
    const holdingsCount = await prisma.organization.count({ where: { type: "HOLDING" } });
    const clinicsCount = await prisma.organization.count({ where: { type: "CLINIC" } });
    const usersCount = await prisma.user.count({ where: { role: { not: "SUPER_ADMIN" } } });
    const patientsCount = await prisma.patient.count();

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

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-fade-up" style={{ animationDelay: "150ms" } as React.CSSProperties}>
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
        </div>
      </div>
    );
  }

  if (isHoldingAdmin) {
    orgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } }
    ];
  } else if (currentUser.organization?.type === "CLINIC") {
    orgFilter.organizationId = currentUser.organizationId;
  } else {
    orgFilter.organizationId = "NO_ACCESS";
  }

  // Query database for actual stats
  const patientsCount = await prisma.patient.count({
    where: orgFilter,
  });
  
  const appointmentsCount = await prisma.appointment.count({
    where: { 
      status: "SCHEDULED",
      patient: orgFilter
    },
  });
  
  const openIncidentsCount = await prisma.incident.count({
    where: { 
      status: "OPEN",
      patient: orgFilter
    },
  });
  
  const activePlansCount = await prisma.carePlan.count({
    where: { 
      status: "ACTIVE",
      patient: orgFilter
    },
  });

  // Query recent notifications for current user
  const notifications = await prisma.notification.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Query recent AI analyses
  const aiAnalyses = await prisma.aIAnalysis.findMany({
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
  });

  let clinicStats: any[] = [];
  if (isHoldingAdmin) {
    const clinics = await prisma.organization.findMany({
      where: { parentId: currentUser.organizationId, type: "CLINIC" },
      select: { id: true, name: true }
    });

    // Group patients by organization
    const patientsGroupByOrg = await prisma.patient.groupBy({
      by: ['organizationId'],
      _count: true,
      where: orgFilter
    });

    const holdingPatientsCount = patientsGroupByOrg.find(g => g.organizationId === currentUser.organizationId)?._count || 0;
    
    clinicStats = [
      { id: currentUser.organizationId, name: "Siège (Holding)", count: holdingPatientsCount },
      ...clinics.map(clinic => {
        const count = patientsGroupByOrg.find(g => g.organizationId === clinic.id)?._count || 0;
        return { id: clinic.id, name: clinic.name, count };
      })
    ].sort((a, b) => b.count - a.count);
  }

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
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Interventions à venir</p>
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
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center animate-pulse">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
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
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                      a.riskScore > 70 
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
    </div>
  );
}
