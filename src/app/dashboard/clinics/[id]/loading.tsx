"use client";

import { useEffect, useState } from "react";
import { Building2, Users, FileText, Bed, Clock, Wallet, AlertTriangle, Package, Calendar } from "lucide-react";
import { PageLoading } from "@/components/ui/page-loading";

interface ClinicDashboardPreview {
  clinicName: string;
  usersCount: number;
  patientsCount: number;
  roleKey: "READ_ONLY" | "COORDINATOR" | "CAREGIVER" | "PHARMACIST" | "OTHER";
  todayIncome: number;
  cashBalance: number;
  lowStockCount: number;
  openIncidentsCount: number;
  myAppointmentsTodayCount: number;
  globalOccupancyRate: number;
  wards: { key: string; label: string; count: number; capacity: number; pct: number }[];
  staff: { id: string; firstName: string; lastName: string; role: string }[];
}

function formatFCFA(amount: number) {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

const WARD_BAR_COLOR: Record<string, string> = {
  emergency: "bg-red-500",
  icu: "bg-amber-500",
  surgery: "bg-blue-500",
};

export default function Loading() {
  // undefined = lecture du cache en cours, null = pas de cache disponible
  const [preview, setPreview] = useState<ClinicDashboardPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // clinicId vient TOUJOURS de l'URL réellement affichée, jamais d'un indice stocké — aucune
      // fuite inter-cliniques n'est structurellement possible, quel que soit l'état du hint.
      const match = window.location.pathname.match(/^\/dashboard\/clinics\/([^/]+)/);
      const clinicId = match?.[1];
      if (!clinicId) {
        if (!cancelled) setPreview(null);
        return;
      }

      const { getCachedView, getRouteHint } = await import("@/lib/view-cache");
      // Le hint de rôle ne sert qu'à choisir QUELLE FORME de prévisualisation afficher — jamais
      // quel locataire (cf. clinicId ci-dessus).
      const hint = await getRouteHint<{ role?: string }>("clinic-dashboard");
      if (!hint?.role) {
        if (!cancelled) setPreview(null);
        return;
      }

      const cached = await getCachedView<ClinicDashboardPreview>(`clinic-dashboard:${clinicId}:${hint.role}`);
      if (!cancelled) setPreview(cached?.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!preview) return <PageLoading />;

  const {
    clinicName, usersCount, patientsCount, roleKey, todayIncome, cashBalance, lowStockCount,
    openIncidentsCount, myAppointmentsTodayCount, globalOccupancyRate, wards, staff,
  } = preview;

  const showShortcuts = roleKey === "READ_ONLY" || roleKey === "COORDINATOR";
  const showWardsAndStaff = roleKey === "READ_ONLY" || roleKey === "COORDINATOR" || roleKey === "CAREGIVER";

  return (
    <div className="space-y-6 pointer-events-none select-none" aria-hidden="true" inert>
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-500" />
            {clinicName}
          </h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Mise à jour…
          </span>
        </div>
      </div>

      {showShortcuts && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold">Personnel médical</h3>
            <p className="text-3xl font-bold mt-2">{usersCount}</p>
            <p className="text-sm text-slate-500 mt-2">Membres rattachés</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">Patients</h3>
            <p className="text-3xl font-bold mt-2">{patientsCount}</p>
            <p className="text-sm text-slate-500 mt-2">Dossiers actifs</p>
          </div>
        </div>
      )}

      {roleKey === "COORDINATOR" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recettes du jour</p>
            <p className="text-2xl font-extrabold mt-1 text-slate-800 dark:text-slate-100">{formatFCFA(todayIncome)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Alertes stock</p>
            <p className="text-2xl font-extrabold mt-1 text-slate-800 dark:text-slate-100">{lowStockCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Incidents ouverts</p>
            <p className="text-2xl font-extrabold mt-1 text-slate-800 dark:text-slate-100">{openIncidentsCount}</p>
          </div>
        </div>
      )}

      {roleKey === "CAREGIVER" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <FileText className="h-6 w-6 text-emerald-500 mb-4" />
            <h3 className="text-lg font-semibold">Patients</h3>
            <p className="text-3xl font-bold mt-2">{patientsCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <Calendar className="h-6 w-6 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold">Mes rendez-vous du jour</h3>
            <p className="text-3xl font-bold mt-2">{myAppointmentsTodayCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold">Incidents ouverts</h3>
            <p className="text-3xl font-bold mt-2">{openIncidentsCount}</p>
          </div>
        </div>
      )}

      {roleKey === "PHARMACIST" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <Wallet className="h-6 w-6 text-emerald-500 mb-4" />
            <h3 className="text-lg font-semibold">Ventes du jour</h3>
            <p className="text-2xl font-bold mt-2">{formatFCFA(todayIncome)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <Wallet className="h-6 w-6 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold">Solde de caisse</h3>
            <p className="text-2xl font-bold mt-2">{formatFCFA(cashBalance)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <Package className="h-6 w-6 text-amber-500 mb-4" />
            <h3 className="text-lg font-semibold">Alertes stock</h3>
            <p className="text-3xl font-bold mt-2">{lowStockCount}</p>
          </div>
        </div>
      )}

      {showWardsAndStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Bed className="h-5 w-5 text-blue-500" />
                Occupation des Lits & Capacité
              </h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Global : {globalOccupancyRate}%
              </span>
            </div>
            <div className="space-y-4">
              {wards.map((w) => (
                <div key={w.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{w.label}</span>
                    <span className="text-slate-500">{w.count} / {w.capacity} lits ({w.pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${WARD_BAR_COLOR[w.key] || "bg-blue-500"}`} style={{ width: `${w.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Clock className="h-5 w-5 text-violet-500" />
                Garde & Astreintes du Jour
              </h3>
              <span className="text-xs text-slate-500">Équipe active</span>
            </div>
            <div className="space-y-4">
              {staff.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Aucun soignant configuré pour cette clinique.</p>
              ) : (
                staff.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {member.lastName[0]}{member.firstName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-850 dark:text-slate-200">{member.firstName} {member.lastName}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                          {member.role === "MEDECIN" ? "Médecin" : member.role === "CAREGIVER" ? "Infirmier(e)" : "Coordinateur Clinique"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
