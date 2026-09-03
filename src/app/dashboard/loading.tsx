"use client";

import { useEffect, useState } from "react";
import { Activity, Users, Calendar, AlertCircle, Bell, Building2, Wallet, AlertTriangle, Clock, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SuperAdminDashboardPreview {
  holdingsCount: number;
  clinicsCount: number;
  usersCount: number;
  patientsCount: number;
  totalRevenue: number;
  planBreakdown: { plan: string; count: number }[];
  holdingsToWatch: { id: string; name: string; licenseExpiresAt: string | null; subscriptionStatus: string; reasons: string[] }[];
  recentHoldings: { id: string; name: string; createdAt: string }[];
  recentContactMessages: { id: string; name: string; subject: string; status: string; createdAt: string }[];
}

interface DashboardPreview {
  patientsCount: number;
  appointmentsCount: number;
  openIncidentsCount: number;
  activePlansCount: number;
  notifications: { id: string; type: string; title: string; message: string; createdAt: string }[];
  aiAnalyses: { id: string; riskScore: number; summary: string; patient: { firstName: string; lastName: string } }[];
  clinicStats: { id: string; name: string; count: number }[];
}

type Preview =
  | { kind: "super-admin"; data: SuperAdminDashboardPreview }
  | { kind: "regular"; data: DashboardPreview };

const planLabels: Record<string, string> = { TRIAL: "Essai", BASIC: "Basique", PREMIUM: "Premium", ENTERPRISE: "Entreprise" };

function UpdatingBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      Mise à jour…
    </span>
  );
}

export default function DashboardLoading() {
  // undefined = lecture du cache en cours, null = pas de cache disponible
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getCachedView, getRouteHint } = await import("@/lib/view-cache");
      // /dashboard n'a aucun segment d'URL scopé (pas de [id]) — l'organizationId vient donc
      // entièrement du hint ici. C'est la seule route du dispositif où c'est autorisé (cf. plan) :
      // aucune fuite inter-organisations n'est possible ailleurs, l'id venant toujours de l'URL.
      const hint = await getRouteHint<{ organizationId?: string; isSuperAdmin?: boolean; isHoldingAdmin?: boolean; role?: string }>("dashboard");
      if (!hint?.organizationId) {
        if (!cancelled) setPreview(null);
        return;
      }

      if (hint.isSuperAdmin) {
        const cached = await getCachedView<SuperAdminDashboardPreview>(`dashboard:${hint.organizationId}:SUPER_ADMIN`);
        if (!cancelled) setPreview(cached ? { kind: "super-admin", data: cached.data } : null);
      } else if (hint.role) {
        const cached = await getCachedView<DashboardPreview>(`dashboard:${hint.organizationId}:${hint.role}`);
        if (!cancelled) setPreview(cached ? { kind: "regular", data: cached.data } : null);
      } else if (!cancelled) {
        setPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pas encore de cache pour ce compte (première visite sur cet appareil) — on ne sait pas
  // encore si la vraie page sera la vue Super Admin ou la vue holding/clinique classique (le
  // hint qui permettrait de trancher n'existe pas non plus tant que rien n'est en cache), donc
  // un squelette générique plausible pour les deux formes est affiché en attendant.
  if (!preview) {
    return (
      <div className="space-y-6" aria-hidden="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-64" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-9 rounded-xl" />
              </CardHeader>
              <CardContent className="pt-0">
                <Skeleton className="h-8 w-16 mt-1" />
                <Skeleton className="h-3 w-32 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return preview.kind === "super-admin" ? (
    <SuperAdminPreview data={preview.data} />
  ) : (
    <RegularPreview data={preview.data} />
  );
}

function SuperAdminPreview({ data }: { data: SuperAdminDashboardPreview }) {
  const maxPlanCount = Math.max(1, ...data.planBreakdown.map((p) => p.count));

  return (
    <div className="space-y-6 pointer-events-none select-none" aria-hidden="true" inert>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Tableau de bord Système
        </h1>
        <UpdatingBadge />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Total Holdings</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{data.holdingsCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Total Cliniques</CardTitle>
            <Building2 className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{data.clinicsCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Utilisateurs</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{data.usersCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Patients Globaux</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{data.patientsCount}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-emerald-200/50 dark:border-emerald-900/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200">Revenu</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {new Intl.NumberFormat("fr-FR").format(Math.round(data.totalRevenue))} FCFA
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Répartition par forfait</CardTitle>
            <CardDescription className="text-xs">Nombre de holdings par forfait souscrit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {data.planBreakdown.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Aucune holding pour le moment.</p>
            ) : (
              data.planBreakdown.map((p) => (
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

        <Card className="rounded-2xl border border-amber-200/50 dark:border-amber-900/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Holdings à surveiller</CardTitle>
              <CardDescription className="text-xs">Licence bientôt expirée ou abonnement inactif.</CardDescription>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="pt-2">
            {data.holdingsToWatch.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Rien à signaler.</p>
            ) : (
              <div className="space-y-3">
                {data.holdingsToWatch.slice(0, 6).map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 text-sm rounded-lg p-1.5 -m-1.5">
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Dernières holdings créées</CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent className="pt-2">
            {data.recentHoldings.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Aucune holding pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {data.recentHoldings.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{h.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">{new Date(h.createdAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200">Derniers messages de contact</CardTitle>
            <Mail className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent className="pt-2">
            {data.recentContactMessages.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Aucun message reçu.</p>
            ) : (
              <div className="space-y-3">
                {data.recentContactMessages.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-sm rounded-lg p-1.5 -m-1.5">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">{m.subject}</span>
                      <span className="text-[10px] text-slate-400">{m.name}</span>
                    </span>
                    {m.status === "NEW" && <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 shrink-0" variant="outline">Nouveau</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RegularPreview({ data }: { data: DashboardPreview }) {
  return (
    <div className="space-y-6 pointer-events-none select-none" aria-hidden="true" inert>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Vue d&apos;ensemble</h1>
        <UpdatingBadge />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Patients actifs</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-1">{data.patientsCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Enregistrés dans le système</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Rendez-vous planifiés</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-1">{data.appointmentsCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Rendez-vous à venir</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-red-200/40 dark:border-red-950/40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-red-500/80 dark:text-red-400/80">Incidents à traiter</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 animate-pulse">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 tracking-tight mt-1">{data.openIncidentsCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Nécessitent une action urgente</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Plans de soins actifs</CardTitle>
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight mt-1">{data.activePlansCount}</div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Protocoles cliniques en cours</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
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
            {data.notifications.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                Aucune notification récente. Les alertes d&apos;incidents s&apos;afficheront ici.
              </div>
            ) : (
              <div className="space-y-4">
                {data.notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-4 border-b border-slate-100 dark:border-slate-800/40 pb-4 last:border-0 last:pb-0 rounded-lg p-1.5 -m-1.5">
                    <div className={`p-2 rounded-xl shrink-0 ${n.type === "INCIDENT" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}>
                      {n.type === "INCIDENT" ? <AlertCircle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
                        {new Date(n.createdAt).toLocaleDateString("fr-FR")} à {new Date(n.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3 rounded-2xl border border-violet-200/50 dark:border-violet-850/50 bg-gradient-to-b from-white/70 to-violet-50/10 dark:from-slate-900/70 dark:to-violet-950/5 backdrop-blur-md shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-violet-100/60 dark:border-violet-900/30 pb-4">
            <div>
              <CardTitle className="text-lg font-bold bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">Vigilance IA Clinique</CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">Derniers rapports préventifs Gemini.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {data.aiAnalyses.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                Aucune analyse IA générée. Lancez une analyse depuis le profil d&apos;un patient.
              </div>
            ) : (
              data.aiAnalyses.map((a) => (
                <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-violet-100/40 dark:border-violet-950 bg-gradient-to-r from-violet-500/5 to-indigo-500/5 dark:from-violet-950/10 dark:to-indigo-950/10 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-violet-850 dark:text-violet-300">
                      {a.patient.lastName} {a.patient.firstName}
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

      {data.clinicStats.length > 0 && (
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-4 mt-2">Répartition des patients par établissement</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {data.clinicStats.map((stat) => (
              <Card key={stat.id} className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
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
