import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Users, FileText, Settings, Bed, Clock, Phone, Wallet, AlertTriangle, Package, PackageCheck, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrCreateClinicWards } from "@/actions/wards";
import CacheWriter from "@/components/cache-writer";

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
      where: { organizationId: clinicId, OR: [{ dispensedAt: null }, { dispensedAt: { isSet: false } as any }] },
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
  ] = await Promise.all([
    showWardsAndStaff ? fetchWardsAndStaff(clinic.id) : Promise.resolve({ staffMembers: [] as any[], wardsWithOccupancy: [] as any[] }),
    isCoordinator || isCashier ? fetchFinanceSummary(clinic.id) : Promise.resolve({ todayIncome: 0, cashBalance: 0, lowStockCount: 0 }),
    isPharmacist ? fetchPharmacyOverview(clinic.id) : Promise.resolve({ queueCount: 0, dispensedTodayCount: 0, lowStockCount: 0 }),
    isCoordinator || isCaregiver ? prisma.incident.count({ where: { status: "OPEN", patient: { organizationId: clinic.id } } }) : Promise.resolve(0),
    isCaregiver ? fetchMyAppointmentsToday(user.id) : Promise.resolve(0),
  ]);

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
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Urgences</span>
                  <span className="text-slate-500">{emergencyPatientsCount} / {emergencyCapacity} lits ({emergencyPercentage}%)</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${emergencyPercentage}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Soins Intensifs (Réanimation)</span>
                  <span className="text-slate-500">{icuPatientsCount} / {icuCapacity} lits ({icuPercentage}%)</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${icuPercentage}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Chirurgie & Ambulatoire</span>
                  <span className="text-slate-500">{surgeryPatientsCount} / {surgeryCapacity} lits ({surgeryPercentage}%)</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${surgeryPercentage}%` }} />
                </div>
              </div>
            </div>
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
