import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Users, FileText, Settings, Bed, Clock, Phone, Wallet, AlertTriangle, Package, PackageCheck, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrCreateClinicWards } from "@/actions/wards";
import CacheWriter from "@/components/cache-writer";
import FinanceTrendChart, { type FinanceTrendPoint } from "@/components/dashboard/finance-trend-chart";
import RevenueBreakdownChart, { type RevenueSlice } from "@/components/dashboard/revenue-breakdown-chart";
import DonutChart from "@/components/dashboard/donut-chart";
import CountTrendChart from "@/components/dashboard/count-trend-chart";
import WardOccupancyChart from "@/components/dashboard/ward-occupancy-chart";
import { buildDayBuckets, buildWeekBuckets, computeStockStatus, countByBucket, startOfDay, sumByBucket } from "@/lib/dashboard-stats";

export const dynamic = "force-dynamic";

function formatFCFA(amount: number) {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

async function fetchWardsAndStaff(clinicId: string) {
  const [staffMembers, wardsResult] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: clinicId, role: { in: ["MEDECIN", "CAREGIVER", "COORDINATOR"] } },
      take: 3,
    }),
    getOrCreateClinicWards(clinicId),
  ]);
  const wards = wardsResult.success ? wardsResult.wards || [] : [];

  const wardsWithOccupancy = await Promise.all(
    wards.map(async (ward) => {
      const [capacity, patientCount] = await Promise.all([
        prisma.bed.count({ where: { wardId: ward.id } }),
        prisma.bed.count({ where: { wardId: ward.id, status: "OCCUPIED" } }),
      ]);
      const occupancyRate = capacity > 0 ? Math.min(100, Math.round((patientCount / capacity) * 100)) : 0;
      return { ...ward, patientCount, capacity, occupancyRate };
    })
  );

  return { staffMembers, wardsWithOccupancy };
}

async function fetchFinanceSummary(clinicId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [todayTransactions, pharmacyItems, openSessions] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: { organizationId: clinicId, type: "INCOME", createdAt: { gte: startOfToday } },
      select: { amount: true },
    }),
    prisma.pharmacyItem.findMany({
      where: { organizationId: clinicId },
      select: { stockQuantity: true, reorderLevel: true },
    }),
    prisma.cashSession.findMany({
      where: { organizationId: clinicId, status: "OPEN" },
      include: { transactions: { select: { type: true, amount: true } } },
    }),
  ]);

  const todayIncome = todayTransactions.reduce((sum, t) => sum + t.amount, 0);
  // Solde = somme, pour chaque session actuellement OUVERTE, de son propre fond de départ + ses
  // propres encaissements/dépenses (cf. finance.ts:getFinanceSummary pour l'explication complète
  // du pourquoi — sommer le fond des sessions ouvertes avec les transactions de TOUTES les
  // sessions, ouvertes et fermées, comptait deux fois l'argent d'une caisse recyclée d'un
  // caissier à l'autre sans passage au coffre entre les deux).
  const cashBalance = openSessions.reduce((sum, s) => {
    let sessionIncome = 0;
    let sessionExpenses = 0;
    for (const t of s.transactions) {
      if (t.type === "INCOME") sessionIncome += t.amount;
      else if (t.type === "EXPENSE") sessionExpenses += t.amount;
    }
    return sum + (s.openingFloat || 0) + sessionIncome - sessionExpenses;
  }, 0);
  const lowStockCount = pharmacyItems.filter((item) => item.stockQuantity <= item.reorderLevel).length;

  return { todayIncome, cashBalance, lowStockCount };
}

// Données des deux graphiques du coordinateur : recettes/dépenses jour par jour sur 7 jours, et
// origine des recettes sur 30 jours. Même périmètre et mêmes règles que getFinanceSummary : une
// dépense déjà absorbée par un achat (cf. absorbedByPurchaseId) n'est pas recomptée, sinon le
// même argent apparaîtrait deux fois. Découpage par jour dans le fuseau du serveur, comme
// "Recettes du jour" juste au-dessus (startOfToday).
async function fetchFinanceCharts(clinicId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekStart = new Date(startOfToday);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(startOfToday);
  monthStart.setDate(monthStart.getDate() - 29);

  const [weekTransactions, revenueByCategory] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: { organizationId: clinicId, createdAt: { gte: weekStart } },
      select: { type: true, amount: true, createdAt: true, absorbedByPurchaseId: true },
    }),
    prisma.financialTransaction.groupBy({
      by: ["category"],
      where: { organizationId: clinicId, type: "INCOME", createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ]);

  const buckets = buildDayBuckets(weekStart, 7);
  const incomeByDay = sumByBucket(
    weekTransactions.filter((t) => t.type === "INCOME").map((t) => ({ date: t.createdAt, value: t.amount })),
    buckets
  );
  const expenseByDay = sumByBucket(
    weekTransactions.filter((t) => t.type === "EXPENSE" && !t.absorbedByPurchaseId).map((t) => ({ date: t.createdAt, value: t.amount })),
    buckets
  );

  const trend: FinanceTrendPoint[] = buckets.map((b, i) => ({ label: b.label, income: incomeByDay[i], expense: expenseByDay[i] }));
  const breakdown: RevenueSlice[] = revenueByCategory.map((g) => ({ category: g.category, value: g._sum.amount ?? 0 }));

  return { trend, breakdown };
}

// Répartition du catalogue par état de stock (et alertes de péremption) — donnée opérationnelle,
// donc aussi disponible au pharmacien. Calcul dans computeStockStatus (testé).
async function fetchStockStatus(clinicId: string) {
  const items = await prisma.pharmacyItem.findMany({
    where: { organizationId: clinicId },
    select: { stockQuantity: true, reorderLevel: true, expiryDate: true },
  });
  return computeStockStatus(items);
}

// Activité de la clinique : rendez-vous des 7 prochains jours, nouveaux patients des 8 dernières
// semaines, incidents non résolus par priorité. Rendez-vous et incidents n'ont pas d'organisation
// propre : ils se rattachent à la clinique par leur patient, comme partout ailleurs dans l'app.
async function fetchOperationsCharts(clinicId: string) {
  const now = new Date();
  const dayBuckets = buildDayBuckets(now, 7);
  const weekBuckets = buildWeekBuckets(now, 8);

  const [appointments, newPatients, incidentsByPriority] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: { not: "CANCELLED" },
        scheduledAt: { gte: dayBuckets[0].start, lt: dayBuckets[dayBuckets.length - 1].end },
        patient: { organizationId: clinicId },
      },
      select: { scheduledAt: true },
    }),
    prisma.patient.findMany({
      where: { organizationId: clinicId, createdAt: { gte: weekBuckets[0].start } },
      select: { createdAt: true },
    }),
    prisma.incident.groupBy({
      by: ["priority"],
      where: { status: { not: "RESOLVED" }, patient: { organizationId: clinicId } },
      _count: true,
    }),
  ]);

  const appointmentsByDay = countByBucket(appointments.map((a) => a.scheduledAt), dayBuckets);
  const patientsByWeek = countByBucket(newPatients.map((p) => p.createdAt), weekBuckets);

  return {
    appointments: dayBuckets.map((b, i) => ({ label: b.label, value: appointmentsByDay[i] })),
    newPatients: weekBuckets.map((b, i) => ({ label: b.label, value: patientsByWeek[i] })),
    incidents: incidentsByPriority.map((g) => ({ priority: g.priority as string, count: g._count })),
  };
}

// Tickets remis par jour sur les 7 derniers jours (tendance du comptoir pharmacie).
async function fetchDispensingTrend(clinicId: string) {
  const firstDay = startOfDay(new Date());
  firstDay.setDate(firstDay.getDate() - 6);
  const buckets = buildDayBuckets(firstDay, 7);
  const invoices = await prisma.pendingInvoice.findMany({
    where: { organizationId: clinicId, dispensedAt: { gte: buckets[0].start } },
    select: { dispensedAt: true },
  });
  const counts = countByBucket(invoices.map((inv) => inv.dispensedAt), buckets);
  return buckets.map((b, i) => ({ label: b.label, value: counts[i] }));
}

// Le tableau de bord du pharmacien ne doit afficher aucune donnée financière (recettes, solde
// de caisse) — uniquement des indicateurs opérationnels de son propre comptoir.
async function fetchPharmacyOverview(clinicId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [pendingInvoices, dispensedTodayCount, pharmacyItems] = await Promise.all([
    // Pas encore remises, quel que soit l'état de règlement (PENDING/PARTIAL/PAID) — un patient
    // peut désormais repartir avec ses médicaments avant d'avoir tout payé. isSet: false requis
    // en plus de null : un champ jamais écrit à la création reste absent du document Mongo (pas
    // littéralement null), et { dispensedAt: null } seul ne matche pas les documents absents.
    prisma.pendingInvoice.findMany({
      where: {
        organizationId: clinicId,
        status: { not: "CANCELLED" },
        OR: [{ dispensedAt: null }, { dispensedAt: { isSet: false } as any }],
      },
      select: { items: true },
    }),
    prisma.pendingInvoice.count({
      where: { organizationId: clinicId, dispensedAt: { gte: startOfToday } },
    }),
    prisma.pharmacyItem.findMany({
      where: { organizationId: clinicId },
      select: { stockQuantity: true, reorderLevel: true },
    }),
  ]);

  const queueCount = pendingInvoices.filter(
    (inv) => Array.isArray(inv.items) && (inv.items as any[]).some((i: any) => i.type === "PHARMACY")
  ).length;
  const lowStockCount = pharmacyItems.filter((item) => item.stockQuantity <= item.reorderLevel).length;

  return { queueCount, dispensedTodayCount, lowStockCount };
}

async function fetchMyAppointmentsToday(userId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const caregiverProfile = await prisma.caregiver.findUnique({ where: { userId } });
  if (!caregiverProfile) return 0;

  return prisma.appointment.count({
    where: { caregiverId: caregiverProfile.id, scheduledAt: { gte: startOfToday, lt: endOfToday } },
  });
}

export default async function ClinicDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const isHoldingAdmin = user.role === "ADMIN" && user.organization?.type === "HOLDING";
  const isClinicUser = user.organizationId === params.id;
  const isSuperAdmin = user.role === "SUPER_ADMIN";

  if (!isHoldingAdmin && !isClinicUser && !isSuperAdmin) {
    redirect("/dashboard");
  }

  // MEDECIN a son propre tableau de bord dédié (consultations du jour, labo, prescriptions,
  // notes) — le "Tableau de bord" générique de la clinique reste conçu pour les autres rôles.
  if (user.role === "MEDECIN") {
    redirect(`/dashboard/clinics/${params.id}/medecin`);
  }

  // ADMIN (holding)/SUPER_ADMIN : consultation en lecture seule. COORDINATOR : administre
  // totalement sa clinique. CAREGIVER/PHARMACIST : vue adaptée à leurs responsabilités propres.
  const isReadOnlyOverview = isHoldingAdmin || isSuperAdmin;
  const isCoordinator = user.role === "COORDINATOR";
  const isCaregiver = user.role === "CAREGIVER";
  const isPharmacist = user.role === "PHARMACIST";
  const isCashier = user.role === "CASHIER";
  const showWardsAndStaff = isReadOnlyOverview || isCoordinator || isCaregiver;

  // Utilisés par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ».
  const cachedAt = new Date().toISOString();
  const roleKey = isReadOnlyOverview ? "READ_ONLY" : isCoordinator ? "COORDINATOR" : isCaregiver ? "CAREGIVER" : isPharmacist ? "PHARMACIST" : isCashier ? "CASHIER" : "OTHER";

  const queryFilter: any = {
    id: params.id,
    type: "CLINIC"
  };

  if (isHoldingAdmin) {
    queryFilter.parentId = user.organizationId;
  }

  const clinic = await prisma.organization.findFirst({
    where: queryFilter,
    include: {
      _count: {
        select: { users: true, patients: true }
      }
    }
  });

  if (!clinic) {
    redirect("/dashboard");
  }

  // Ces quatre blocs sont indépendants les uns des autres (chacun alimente une section
  // d'écran différente, gatée par rôle) — les lancer en parallèle plutôt que
  // séquentiellement évite de multiplier les allers-retours réseau vers la base.
  const [
    { staffMembers, wardsWithOccupancy },
    { todayIncome, cashBalance, lowStockCount: financeLowStockCount },
    { queueCount, dispensedTodayCount, lowStockCount: pharmacyLowStockCount },
    openIncidentsCount,
    myAppointmentsTodayCount,
    financeCharts,
    stockStatus,
    operationsCharts,
    dispensingTrend,
  ] = await Promise.all([
    showWardsAndStaff ? fetchWardsAndStaff(clinic.id) : Promise.resolve({ staffMembers: [] as any[], wardsWithOccupancy: [] as any[] }),
    isCoordinator || isCashier ? fetchFinanceSummary(clinic.id) : Promise.resolve({ todayIncome: 0, cashBalance: 0, lowStockCount: 0 }),
    isPharmacist ? fetchPharmacyOverview(clinic.id) : Promise.resolve({ queueCount: 0, dispensedTodayCount: 0, lowStockCount: 0 }),
    isCoordinator || isCaregiver ? prisma.incident.count({ where: { status: "OPEN", patient: { organizationId: clinic.id } } }) : Promise.resolve(0),
    isCaregiver ? fetchMyAppointmentsToday(user.id) : Promise.resolve(0),
    isCoordinator ? fetchFinanceCharts(clinic.id) : Promise.resolve({ trend: [] as FinanceTrendPoint[], breakdown: [] as RevenueSlice[] }),
    isCoordinator || isPharmacist ? fetchStockStatus(clinic.id) : Promise.resolve(null),
    isCoordinator || isReadOnlyOverview ? fetchOperationsCharts(clinic.id) : Promise.resolve(null),
    isPharmacist ? fetchDispensingTrend(clinic.id) : Promise.resolve(null),
  ]);

  // Anneau "état du stock" partagé par le coordinateur et le pharmacien (même donnée, même rendu).
  const stockDonut = stockStatus ? (
    <DonutChart
      title="État du stock"
      description="Produits du catalogue par niveau de stock."
      icon={<Package className="h-4 w-4 text-indigo-500" />}
      slices={[
        { key: "ok", label: "Suffisant", value: stockStatus.ok, color: "var(--chart-2)" },
        { key: "low", label: "Stock faible", value: stockStatus.low, color: "var(--chart-4)" },
        { key: "out", label: "Rupture", value: stockStatus.out, color: "var(--chart-3)" },
      ]}
      centerLabel="produits"
      emptyText="Aucun produit au catalogue."
      footer={
        <>
          <span className={stockStatus.expiringSoon > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
            {stockStatus.expiringSoon} péremption(s) sous 30 jours
          </span>
          {" · "}
          <span className={stockStatus.expired > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : ""}>
            {stockStatus.expired} périmé(s) en stock
          </span>
        </>
      }
    />
  ) : null;

  const incidentPriorityLabels: Record<string, { label: string; color: string }> = {
    CRITICAL: { label: "Critique", color: "var(--chart-3)" },
    HIGH: { label: "Haute", color: "var(--chart-4)" },
    MEDIUM: { label: "Moyenne", color: "var(--chart-1)" },
    LOW: { label: "Basse", color: "var(--chart-2)" },
  };

  const lowStockCount = isPharmacist ? pharmacyLowStockCount : financeLowStockCount;

  const occupiedBeds = wardsWithOccupancy.reduce((acc, curr) => acc + curr.patientCount, 0);
  const totalCapacity = wardsWithOccupancy.reduce((acc, curr) => acc + curr.capacity, 0);
  const globalOccupancyRate = totalCapacity > 0 ? Math.min(100, Math.round((occupiedBeds / totalCapacity) * 100)) : 0;

  const emergencyWard = wardsWithOccupancy.find(w => w.code === "EMERGENCY");
  const icuWard = wardsWithOccupancy.find(w => w.code === "ICU");
  const surgeryWard = wardsWithOccupancy.find(w => w.code === "SURGERY");

  const emergencyPatientsCount = emergencyWard?.patientCount || 0;
  const emergencyCapacity = emergencyWard?.capacity || 20;
  const emergencyPercentage = emergencyWard?.occupancyRate || 0;

  const icuPatientsCount = icuWard?.patientCount || 0;
  const icuCapacity = icuWard?.capacity || 10;
  const icuPercentage = icuWard?.occupancyRate || 0;

  const surgeryPatientsCount = surgeryWard?.patientCount || 0;
  const surgeryCapacity = surgeryWard?.capacity || 30;
  const surgeryPercentage = surgeryWard?.occupancyRate || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {isReadOnlyOverview && (
          <Link href="/dashboard/clinics">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-500" />
            {clinic.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            Tableau de bord spécifique à cette clinique.
          </p>
        </div>
      </div>

      {/* Cartes de raccourci : SUPER_ADMIN / ADMIN (lecture seule) / COORDINATOR (gestion complète) */}
      {(isReadOnlyOverview || isCoordinator) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold">Personnel médical</h3>
            <p className="text-3xl font-bold mt-2">{clinic._count.users}</p>
            <p className="text-sm text-slate-500 mt-2">Membres rattachés</p>
            <Link href={`/dashboard/clinics/${clinic.id}/team`} className="w-full mt-6">
              <Button className="w-full" variant="outline">{isCoordinator ? "Gérer le personnel" : "Consulter l'équipe"}</Button>
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">Patients</h3>
            <p className="text-3xl font-bold mt-2">{clinic._count.patients}</p>
            <p className="text-sm text-slate-500 mt-2">Dossiers actifs</p>
            <Link href={`/dashboard/clinics/${clinic.id}/patients`} className="w-full mt-6">
              <Button className="w-full" variant="outline">{isCoordinator ? "Voir les patients" : "Consulter les patients"}</Button>
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-violet-50 dark:bg-violet-900/20 rounded-full flex items-center justify-center mb-4">
              <Settings className="h-6 w-6 text-violet-500" />
            </div>
            <h3 className="text-lg font-semibold">Configuration</h3>
            <p className="text-sm text-slate-500 mt-4 flex-1">Paramètres généraux, adresse et facturation.</p>
            <Link href={`/dashboard/clinics/${clinic.id}/settings`} className="w-full mt-6">
              <Button className="w-full" variant="outline">{isCoordinator ? "Modifier" : "Consulter les paramètres"}</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Aperçu Finance & Pharmacie + Incidents : COORDINATOR uniquement */}
      {isCoordinator && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 animate-fade-up">
          <Link href={`/dashboard/clinics/${clinic.id}/finance`} className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recettes du jour</p>
            <p className="text-2xl font-extrabold mt-1 text-slate-800 dark:text-slate-100">{formatFCFA(todayIncome)}</p>
          </Link>
          <Link href={`/dashboard/clinics/${clinic.id}/finance`} className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow ${lowStockCount > 0 ? "border-amber-300/60 dark:border-amber-900/40" : "border-slate-200 dark:border-slate-800"}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Alertes stock</p>
            <p className={`text-2xl font-extrabold mt-1 ${lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-100"}`}>{lowStockCount}</p>
          </Link>
          <Link href={`/dashboard/clinics/${clinic.id}/incidents`} className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow ${openIncidentsCount > 0 ? "border-red-300/60 dark:border-red-950/40" : "border-slate-200 dark:border-slate-800"}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Incidents ouverts</p>
            <p className={`text-2xl font-extrabold mt-1 ${openIncidentsCount > 0 ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100"}`}>{openIncidentsCount}</p>
          </Link>
        </div>
      )}

      {/* Graphiques finance : COORDINATOR uniquement, comme les indicateurs ci-dessus */}
      {isCoordinator && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 animate-fade-up">
          <div className="lg:col-span-2">
            <FinanceTrendChart data={financeCharts.trend} />
          </div>
          <RevenueBreakdownChart data={financeCharts.breakdown} />
        </div>
      )}

      {/* Graphiques d'activité : COORDINATOR et vue lecture seule (holding/super admin). L'état du
          stock reste réservé au coordinateur, comme les alertes stock au-dessus. */}
      {(isCoordinator || isReadOnlyOverview) && operationsCharts && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-6 animate-fade-up">
          {isCoordinator && stockDonut}
          <DonutChart
            title="Incidents non résolus"
            description="Par niveau de priorité."
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            slices={operationsCharts.incidents.map((g) => ({
              key: g.priority,
              label: incidentPriorityLabels[g.priority]?.label ?? g.priority,
              value: g.count,
              color: incidentPriorityLabels[g.priority]?.color ?? "var(--chart-1)",
            }))}
            centerLabel="ouverts"
            emptyText="Aucun incident en cours."
          />
          <CountTrendChart
            title="Rendez-vous à venir"
            description="7 prochains jours, annulés exclus."
            icon={<Calendar className="h-4 w-4 text-blue-500" />}
            data={operationsCharts.appointments}
            valueLabel="Rendez-vous"
            color="var(--chart-1)"
            emptyText="Aucun rendez-vous prévu cette semaine."
          />
          <CountTrendChart
            title="Nouveaux patients"
            description="8 dernières semaines."
            icon={<Users className="h-4 w-4 text-emerald-500" />}
            data={operationsCharts.newPatients}
            valueLabel="Patients"
            color="var(--chart-2)"
            variant="area"
            emptyText="Aucun nouveau patient sur la période."
          />
        </div>
      )}

      {/* Cartes CAREGIVER */}
      {isCaregiver && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">Patients</h3>
            <p className="text-3xl font-bold mt-2">{clinic._count.patients}</p>
            <p className="text-sm text-slate-500 mt-2">Dossiers de la clinique</p>
            <Link href={`/dashboard/clinics/${clinic.id}/patients`} className="w-full mt-6">
              <Button className="w-full" variant="outline">Voir mes patients</Button>
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <Calendar className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold">Mes rendez-vous du jour</h3>
            <p className="text-3xl font-bold mt-2">{myAppointmentsTodayCount}</p>
            <p className="text-sm text-slate-500 mt-2">Planifiés aujourd&apos;hui</p>
            <Link href={`/dashboard/clinics/${clinic.id}/appointments`} className="w-full mt-6">
              <Button className="w-full" variant="outline">Voir l&apos;agenda</Button>
            </Link>
          </div>

          <div className={`bg-white dark:bg-slate-900 rounded-2xl p-6 border shadow-sm flex flex-col items-center text-center ${openIncidentsCount > 0 ? "border-red-300/60 dark:border-red-950/40" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="h-12 w-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold">Incidents ouverts</h3>
            <p className={`text-3xl font-bold mt-2 ${openIncidentsCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{openIncidentsCount}</p>
            <p className="text-sm text-slate-500 mt-2">Nécessitent une action</p>
            <Link href={`/dashboard/clinics/${clinic.id}/incidents`} className="w-full mt-6">
              <Button className="w-full" variant="outline">Voir les incidents</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Cartes PHARMACIST — aucune donnée financière, uniquement des indicateurs opérationnels
          du comptoir pharmacie (la caisse/finance restent hors du périmètre de ce rôle). */}
      {isPharmacist && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
              <PackageCheck className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">File d&apos;attente</h3>
            <p className="text-2xl font-bold mt-2">{queueCount}</p>
            <p className="text-sm text-slate-500 mt-2">Tickets en attente de remise</p>
            <Link href={`/dashboard/clinics/${clinic.id}/pharmacie`} className="w-full mt-6">
              <Button className="w-full" variant="outline">File de remise</Button>
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold">Remis aujourd&apos;hui</h3>
            <p className="text-2xl font-bold mt-2">{dispensedTodayCount}</p>
            <p className="text-sm text-slate-500 mt-2">Tickets finalisés aujourd&apos;hui</p>
            <Link href={`/dashboard/clinics/${clinic.id}/pharmacie`} className="w-full mt-6">
              <Button className="w-full" variant="outline">Voir l&apos;historique</Button>
            </Link>
          </div>

          <div className={`bg-white dark:bg-slate-900 rounded-2xl p-6 border shadow-sm flex flex-col items-center text-center ${lowStockCount > 0 ? "border-amber-300/60 dark:border-amber-900/40" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="h-12 w-12 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mb-4">
              <Package className="h-6 w-6 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold">Alertes stock</h3>
            <p className={`text-3xl font-bold mt-2 ${lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{lowStockCount}</p>
            <p className="text-sm text-slate-500 mt-2">{lowStockCount > 0 ? "Produits en rupture ou stock faible" : "Tous les stocks sont suffisants"}</p>
            <Link href={`/dashboard/clinics/${clinic.id}/pharmacie`} className="w-full mt-6">
              <Button className="w-full" variant="outline">Gérer le stock</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Graphiques PHARMACIST — activité du comptoir uniquement, jamais de données financières */}
      {isPharmacist && dispensingTrend && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 animate-fade-up">
          <div className="lg:col-span-2">
            <CountTrendChart
              title="Tickets remis"
              description="7 derniers jours."
              icon={<PackageCheck className="h-4 w-4 text-emerald-500" />}
              data={dispensingTrend}
              valueLabel="Tickets remis"
              color="var(--chart-2)"
              emptyText="Aucune remise sur les 7 derniers jours."
            />
          </div>
          {stockDonut}
        </div>
      )}

      {/* Cartes CASHIER */}
      {isCashier && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
              <Wallet className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">Recettes du jour</h3>
            <p className="text-2xl font-bold mt-2">{formatFCFA(todayIncome)}</p>
            <p className="text-sm text-slate-500 mt-2">Encaissements enregistrés aujourd&apos;hui</p>
            <Link href={`/dashboard/clinics/${clinic.id}/caisse`} className="w-full mt-6">
              <Button className="w-full" variant="outline">Ouvrir la caisse</Button>
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <Wallet className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold">Solde de caisse</h3>
            <p className="text-2xl font-bold mt-2">{formatFCFA(cashBalance)}</p>
            <p className="text-sm text-slate-500 mt-2">Recettes − dépenses totales</p>
            <Link href={`/dashboard/clinics/${clinic.id}/caisse`} className="w-full mt-6">
              <Button className="w-full" variant="outline">Voir la caisse</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Supervision Section : occupation des lits + garde du jour */}
      {showWardsAndStaff && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8 animate-fade-up" style={{ animationDelay: "200ms" } as React.CSSProperties}>
          {/* Bed Occupancy Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Bed className="h-5 w-5 text-blue-500" />
                Occupation des Lits & Capacité
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Global : {globalOccupancyRate}%
                </span>
                <Link href={`/dashboard/clinics/${clinic.id}/rooms`} className="text-xs font-semibold text-primary hover:underline">
                  Gérer les chambres
                </Link>
              </div>
            </div>
            <WardOccupancyChart
              wards={[
                { name: "Urgences", occupied: emergencyPatientsCount, capacity: emergencyCapacity },
                { name: "Soins Intensifs", occupied: icuPatientsCount, capacity: icuCapacity },
                { name: "Chirurgie & Ambulatoire", occupied: surgeryPatientsCount, capacity: surgeryCapacity },
              ]}
            />
          </div>

          {/* On-Duty Staff Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Clock className="h-5 w-5 text-violet-500" />
                Garde & Astreintes du Jour
              </h3>
              <span className="text-xs text-slate-500">Équipe active</span>
            </div>
            <div className="space-y-4">
              {staffMembers.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Aucun soignant configuré pour cette clinique.</p>
              ) : (
                staffMembers.map((member) => (
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
                    {member.phone && (
                      <a href={`tel:${member.phone}`} className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                        <Phone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <CacheWriter
        cacheKey={`clinic-dashboard:${clinic.id}:${roleKey}`}
        updatedAt={cachedAt}
        routeFamily="clinic-dashboard"
        contextHint={{ role: roleKey }}
        data={{
          clinicName: clinic.name,
          usersCount: clinic._count.users,
          patientsCount: clinic._count.patients,
          roleKey,
          todayIncome,
          cashBalance,
          lowStockCount,
          queueCount,
          dispensedTodayCount,
          openIncidentsCount,
          myAppointmentsTodayCount,
          globalOccupancyRate,
          wards: [
            { key: "emergency", label: "Urgences", count: emergencyPatientsCount, capacity: emergencyCapacity, pct: emergencyPercentage },
            { key: "icu", label: "Soins Intensifs (Réanimation)", count: icuPatientsCount, capacity: icuCapacity, pct: icuPercentage },
            { key: "surgery", label: "Chirurgie & Ambulatoire", count: surgeryPatientsCount, capacity: surgeryCapacity, pct: surgeryPercentage },
          ],
          staff: staffMembers.slice(0, 3).map((m: any) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role })),
        }}
      />
    </div>
  );
}
