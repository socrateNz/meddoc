"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  User as UserIcon,
  CheckCircle2,
  XCircle,
  WifiOff,
  LayoutGrid,
  List,
  AlertTriangle,
  Download,
  Activity,
  HeartPulse,
  Droplet,
  Calendar,
  Stethoscope,
  ChevronRight,
  Users,
  ShieldAlert,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { useOfflinePatients } from "@/hooks/use-offline-patients";
import PatientBedDialog from "./patient-bed-dialog";

export interface PatientWithUser {
  id: string;
  status?: string;
  dependencyLevel: number;
  dateOfBirth: Date | string;
  pathologies: string[];
  allergies?: string[];
  bloodType?: string | null;
  sex?: string | null;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  };
  carePlans?: { id: string; status: string }[];
  bed?: { id: string; label: string; room: { name: string } } | null;
  vitalSigns?: {
    bloodPressure?: string | null;
    heartRate?: number | null;
    temperature?: number | null;
    oxygenSaturation?: number | null;
    bloodSugar?: number | null;
    createdAt?: Date | string;
  }[];
  appointments?: {
    id: string;
    scheduledAt: Date | string;
    title: string;
  }[];
}

interface PatientTableProps {
  // Une page de patients (20 au plus), déjà filtrée et triée par le serveur (cf. listPatientsPage).
  patients: PatientWithUser[];
  total: number;
  page: number;
  pageSize: number;
  // Compteurs sur tout le périmètre (et non sur la page affichée).
  counts: { active: number; discharged: number; allergies: number; highDependency: number };
  // Paramètres d'URL courants (recherche q, statut, gir, allergies, tri) : conservés lors d'un changement.
  query: Record<string, string | undefined>;
  pathname: string;
  clinicId?: string;
  organizationId?: string;
  // Affectation d'un lit depuis la liste : réservée au personnel clinique (cf. wards.ts ROOMS_OPERATE_ROLES).
  canAssignBed?: boolean;
}

export default function PatientTable({ patients, total, page, pageSize, counts, query, pathname, clinicId, organizationId, canAssignBed = false }: PatientTableProps) {
  const router = useRouter();
  // Recherche : valeur locale pour une frappe fluide, requête serveur après une courte pause.
  const [searchTerm, setSearchDraft] = useState(query.q ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusFilter = (query.status ?? "ALL") as "ALL" | "ACTIVE" | "DISCHARGED";
  const dependencyFilter = (query.gir ?? "ALL") as "ALL" | "HEAVY" | "MODERATE" | "AUTONOMOUS";
  const allergiesOnly = query.allergies === "1";
  const sortBy = (query.sort ?? "name-asc") as "name-asc" | "name-desc" | "age-asc" | "age-desc" | "gir-asc" | "gir-desc";

  // Tout changement de filtre revient à la première page.
  const navigate = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes, page: undefined })) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setSearchTerm = (value: string) => {
    setSearchDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ q: value.trim() || undefined }), 300);
  };
  const setStatusFilter = (value: string) => navigate({ status: value === "ALL" ? undefined : value });
  const setDependencyFilter = (value: string) => navigate({ gir: value === "ALL" ? undefined : value });
  const setAllergiesOnly = (value: boolean) => navigate({ allergies: value ? "1" : undefined });
  const setSortBy = (value: string) => navigate({ sort: value === "name-asc" ? undefined : value });
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Offline fallback (RxDB)
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const offlineQuery = useOfflinePatients(organizationId, isOffline);
  const effectivePatients: PatientWithUser[] = isOffline ? (offlineQuery.data as any) ?? [] : patients;

  const calculateAge = (dateInput: Date | string) => {
    const birthDate = new Date(dateInput);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateInput: Date | string) => {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateInput));
  };

  const checkIsDischarged = (p: any) => {
    if (p.status === "DISCHARGED") return true;
    if (p.carePlans && p.carePlans.length > 0) {
      return !p.carePlans.some((cp: any) => cp.status === "ACTIVE");
    }
    return false;
  };

  // KPIs
  const totalCount = isOffline ? effectivePatients.length : total;
  const activeCount = isOffline ? effectivePatients.filter((p) => !checkIsDischarged(p)).length : counts.active;
  const dischargedCount = isOffline ? effectivePatients.filter((p) => checkIsDischarged(p)).length : counts.discharged;
  const allergiesCount = isOffline ? effectivePatients.filter((p) => p.allergies && p.allergies.length > 0).length : counts.allergies;
  const highDependencyCount = isOffline ? effectivePatients.filter((p) => p.dependencyLevel <= 3).length : counts.highDependency;

  // Filtering & Sorting
  const filteredPatients = useMemo(() => {
    // En ligne, le serveur a déjà filtré et trié la page : rien à refiltrer ici.
    if (!isOffline) return patients;
    const list = effectivePatients.filter((patient) => {
      const isDischarged = checkIsDischarged(patient);

      // Status filter
      if (statusFilter === "ACTIVE" && isDischarged) return false;
      if (statusFilter === "DISCHARGED" && !isDischarged) return false;

      // Dependency filter (GIR 1-2 heavy, 3-4 moderate, 5-6 autonomous)
      if (dependencyFilter === "HEAVY" && patient.dependencyLevel > 2) return false;
      if (dependencyFilter === "MODERATE" && (patient.dependencyLevel < 3 || patient.dependencyLevel > 4)) return false;
      if (dependencyFilter === "AUTONOMOUS" && patient.dependencyLevel < 5) return false;

      // Allergies filter
      if (allergiesOnly && (!patient.allergies || patient.allergies.length === 0)) return false;

      // Search query logic
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const fullName = `${patient.user.lastName} ${patient.user.firstName}`.toLowerCase();
      const email = (patient.user.email || "").toLowerCase();
      const phone = (patient.user.phone || "").toLowerCase();
      const blood = (patient.bloodType || "").toLowerCase();
      const pathologies = (patient.pathologies || []).join(" ").toLowerCase();
      const allergies = (patient.allergies || []).join(" ").toLowerCase();

      return (
        fullName.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        blood.includes(q) ||
        pathologies.includes(q) ||
        allergies.includes(q)
      );
    });

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "name-asc") {
        return a.user.lastName.localeCompare(b.user.lastName);
      }
      if (sortBy === "name-desc") {
        return b.user.lastName.localeCompare(a.user.lastName);
      }
      if (sortBy === "age-asc") {
        return new Date(b.dateOfBirth).getTime() - new Date(a.dateOfBirth).getTime();
      }
      if (sortBy === "age-desc") {
        return new Date(a.dateOfBirth).getTime() - new Date(b.dateOfBirth).getTime();
      }
      if (sortBy === "gir-asc") {
        return a.dependencyLevel - b.dependencyLevel;
      }
      if (sortBy === "gir-desc") {
        return b.dependencyLevel - a.dependencyLevel;
      }
      return 0;
    });

    return list;
  }, [isOffline, patients, effectivePatients, statusFilter, dependencyFilter, allergiesOnly, searchTerm, sortBy]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "Nom",
      "Prénom",
      "Sexe",
      "Âge",
      "Date de naissance",
      "Groupe sanguin",
      "Statut soins",
      "Niveau GIR",
      "Pathologies",
      "Allergies",
      "Email",
      "Téléphone",
    ];

    const rows = filteredPatients.map((p) => {
      const isDischarged = checkIsDischarged(p);
      return [
        `"${p.user.lastName.replace(/"/g, '""')}"`,
        `"${p.user.firstName.replace(/"/g, '""')}"`,
        `"${p.sex || ""}"`,
        calculateAge(p.dateOfBirth),
        `"${formatDate(p.dateOfBirth)}"`,
        `"${p.bloodType || ""}"`,
        `"${isDischarged ? "Clôturé" : "Actif"}"`,
        `"GIR ${p.dependencyLevel}"`,
        `"${(p.pathologies || []).join(", ").replace(/"/g, '""')}"`,
        `"${(p.allergies || []).join(", ").replace(/"/g, '""')}"`,
        `"${p.user.email || ""}"`,
        `"${p.user.phone || ""}"`,
      ].join(";");
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `patients-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getGirBadge = (level: number) => {
    if (level <= 2) {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25 font-semibold text-xs">
          GIR {level} (Perte d'autonomie)
        </Badge>
      );
    }
    if (level <= 4) {
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25 font-semibold text-xs">
          GIR {level} (Aide modérée)
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 font-medium text-xs">
        GIR {level} (Autonome)
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Offline notification banner */}
      {isOffline && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 text-sm text-amber-800 dark:text-amber-300 shadow-xs">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            Mode hors-ligne actif — Consultation via le cache local chiffré{offlineQuery.isLoading ? " (chargement...)" : ""}.
          </span>
        </div>
      )}

      {/* 1. Medical KPIs Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Patients</span>
            <div className="text-2xl font-bold text-foreground">{totalCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Users className="h-5 w-5" />
          </div>
        </div>

        {/* Soins actifs */}
        <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Soins en cours</span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Alertes & Allergies */}
        <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Allergies signalées</span>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{allergiesCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>

        {/* Dépendance GIR 1-3 */}
        <div className="p-4 rounded-2xl bg-card border border-border/70 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Forte dépendance</span>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{highDependencyCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Activity className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* 2. Search, Filters & View Switcher Bar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card border border-border/70 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher nom, pathologie, allergie, groupe sanguin..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 h-10 text-xs bg-muted/20 border-border/70 focus-visible:bg-background"
          />
        </div>

        {/* Middle Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status buttons */}
          <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                statusFilter === "ALL"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tous ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === "ACTIVE"
                  ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Soins en cours ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("DISCHARGED")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                statusFilter === "DISCHARGED"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sortis ({dischargedCount})
            </button>
          </div>

          {/* Allergies Toggle */}
          <button
            type="button"
            onClick={() => setAllergiesOnly(!allergiesOnly)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 ${
              allergiesOnly
                ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300 font-semibold"
                : "border-border/70 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            Allergies
          </button>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 px-3 rounded-xl border border-border/70 bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="name-asc">Nom (A-Z)</option>
            <option value="name-desc">Nom (Z-A)</option>
            <option value="age-desc">Plus âgés d'abord</option>
            <option value="age-asc">Plus jeunes d'abord</option>
            <option value="gir-asc">Dépendance lourde (GIR 1 ➔ 6)</option>
            <option value="gir-desc">Autonomie (GIR 6 ➔ 1)</option>
          </select>
        </div>

        {/* View Mode & Export */}
        <div className="flex items-center gap-2 self-end xl:self-center">
          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-9 gap-1.5 text-xs border-border/70 hover:bg-muted/40"
            title="Exporter la liste en CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>

          {/* Switch View Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "cards"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Vue Fiches de soins (Cartes)"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "table"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Vue Tableau (Liste dense)"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Empty State */}
      {filteredPatients.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-border/70 rounded-2xl bg-card">
          <UserIcon className="h-12 w-12 text-muted-foreground/60 mb-3" />
          <h3 className="text-lg font-bold text-foreground">Aucun patient correspondant</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Aucun dossier patient ne correspond à vos filtres actuels. Modifiez votre recherche ou réinitialisez les critères.
          </p>
          {(searchTerm || statusFilter !== "ALL" || allergiesOnly || dependencyFilter !== "ALL") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("ALL");
                setAllergiesOnly(false);
                setDependencyFilter("ALL");
              }}
              className="mt-4 text-xs"
            >
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      )}

      {/* 4. Cards View (Fiches Cliniques) */}
      {viewMode === "cards" && filteredPatients.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPatients.map((patient) => {
            const isDischarged = checkIsDischarged(patient);
            const patientLink = clinicId
              ? `/dashboard/clinics/${clinicId}/patients/${patient.id}`
              : `/dashboard/patients/${patient.id}`;
            const age = calculateAge(patient.dateOfBirth);
            const latestVitals = patient.vitalSigns?.[0];
            const hasAllergies = patient.allergies && patient.allergies.length > 0;

            return (
              <div
                key={patient.id}
                className="group rounded-2xl border border-border/70 bg-card p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 hover:border-primary/40 relative overflow-hidden"
              >
                {/* Top accent strip based on status & risk */}
                <div
                  className={`absolute top-0 inset-x-0 h-1 ${
                    hasAllergies
                      ? "bg-rose-500"
                      : isDischarged
                      ? "bg-slate-400"
                      : "bg-emerald-500"
                  }`}
                />

                <div className="space-y-3.5">
                  {/* Header: Identity, Avatar & Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 border border-primary/20 text-sm">
                        {patient.user.lastName?.[0]}
                        {patient.user.firstName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={patientLink}
                          className="font-bold text-base text-foreground hover:text-primary transition-colors block truncate"
                        >
                          {patient.user.lastName} {patient.user.firstName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {age} ans • {patient.sex === "M" ? "Homme" : patient.sex === "F" ? "Femme" : patient.sex || "Sexe N/R"}
                        </p>
                      </div>
                    </div>

                    {/* Status & Blood badges */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {isDischarged ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] py-0 px-2">
                          Clôturé
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] py-0 px-2 font-medium">
                          Actif
                        </Badge>
                      )}

                      {patient.bloodType && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-[11px] font-bold">
                          <Droplet className="h-2.5 w-2.5 fill-rose-500 text-rose-500" />
                          {patient.bloodType}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Medical Alerts / Allergies Banner */}
                  {hasAllergies && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="font-bold block text-[11px] uppercase tracking-wide">Allergies connues :</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {patient.allergies!.map((all, i) => (
                            <span key={i} className="px-1.5 py-0.2 rounded bg-rose-500/20 font-semibold text-[10px]">
                              {all}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dependency & Pathologies */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium text-[11px]">Dépendance :</span>
                      {getGirBadge(patient.dependencyLevel)}
                    </div>

                    {patient.pathologies && patient.pathologies.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-muted-foreground font-medium text-[11px] block">Pathologies :</span>
                        <div className="flex flex-wrap gap-1">
                          {patient.pathologies.slice(0, 3).map((patho, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-[10px] font-medium bg-blue-500/5 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/40"
                            >
                              {patho}
                            </Badge>
                          ))}
                          {patient.pathologies.length > 3 && (
                            <span className="text-[10px] text-muted-foreground self-center">
                              +{patient.pathologies.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Latest Vitals Snapshot (if available) */}
                  {latestVitals && (
                    <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50 text-xs space-y-1">
                      <div className="flex items-center justify-between text-muted-foreground text-[10px]">
                        <span className="flex items-center gap-1 font-medium">
                          <HeartPulse className="h-3 w-3 text-primary" /> Dernières constantes
                        </span>
                        <span>{formatDate(latestVitals.createdAt || new Date())}</span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px] font-semibold text-foreground pt-0.5">
                        {latestVitals.bloodPressure && <span>TA: {latestVitals.bloodPressure}</span>}
                        {latestVitals.heartRate && <span>Pouls: {latestVitals.heartRate} bpm</span>}
                        {latestVitals.temperature && <span>T°: {latestVitals.temperature}°C</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer action buttons */}
                <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Link href={`/dashboard/appointments`}>
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      RDV
                    </Link>
                  </Button>
                  {canAssignBed && clinicId && (
                    <PatientBedDialog
                      clinicId={clinicId}
                      patientId={patient.id}
                      patientName={`${patient.user.lastName} ${patient.user.firstName}`}
                      currentBed={patient.bed ? { label: patient.bed.label, roomName: patient.bed.room.name } : null}
                    />
                  )}

                  <Button asChild size="sm" className="h-8 text-xs gap-1.5 flex-1 shadow-xs">
                    <Link href={patientLink}>
                      Dossier patient
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. High Density Table View */}
      {viewMode === "table" && filteredPatients.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-b border-border/70 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider font-bold py-3.5">Patient</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold py-3.5">Statut</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold py-3.5">Groupe & Allergies</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold py-3.5">Dépendance</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold py-3.5">Pathologies</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold py-3.5">Contact</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold text-right py-3.5">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPatients.map((patient) => {
                const isDischarged = checkIsDischarged(patient);
                const patientLink = clinicId
                  ? `/dashboard/clinics/${clinicId}/patients/${patient.id}`
                  : `/dashboard/patients/${patient.id}`;
                const age = calculateAge(patient.dateOfBirth);
                const hasAllergies = patient.allergies && patient.allergies.length > 0;

                return (
                  <TableRow key={patient.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <TableCell className="py-3 font-semibold text-foreground">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-xs">
                          {patient.user.lastName?.[0]}
                          {patient.user.firstName?.[0]}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-foreground">
                            {patient.user.lastName} {patient.user.firstName}
                          </p>
                          <p className="text-xs text-muted-foreground font-normal">
                            {age} ans • {patient.sex === "M" ? "Homme" : patient.sex === "F" ? "Femme" : patient.sex || "N/R"}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      {isDischarged ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground text-xs gap-1">
                          <XCircle className="h-3 w-3 text-muted-foreground" />
                          Clôturé
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs gap-1 font-medium">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Soins actifs
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {patient.bloodType && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-xs font-bold">
                            <Droplet className="h-2.5 w-2.5 fill-rose-500 text-rose-500" />
                            {patient.bloodType}
                          </span>
                        )}

                        {hasAllergies ? (
                          <Badge variant="outline" className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 text-xs gap-1">
                            <ShieldAlert className="h-3 w-3 text-rose-500" />
                            {patient.allergies!.length} allergie(s)
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Aucune allergie</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      {getGirBadge(patient.dependencyLevel)}
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(patient.pathologies || []).slice(0, 2).map((patho, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px] font-medium bg-blue-500/5 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/40">
                            {patho}
                          </Badge>
                        ))}
                        {(patient.pathologies || []).length > 2 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{patient.pathologies.length - 2}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-3 text-xs text-muted-foreground">
                      <p>{patient.user.email}</p>
                      {patient.user.phone && <p className="font-mono text-[11px]">{patient.user.phone}</p>}
                    </TableCell>

                    <TableCell className="py-3 text-right">
                      {canAssignBed && clinicId && (
                        <PatientBedDialog
                          clinicId={clinicId}
                          patientId={patient.id}
                          patientName={`${patient.user.lastName} ${patient.user.firstName}`}
                          currentBed={patient.bed ? { label: patient.bed.label, roomName: patient.bed.room.name } : null}
                        />
                      )}
                      <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-primary font-semibold">
                        <Link href={patientLink}>
                          Dossier <ChevronRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {!isOffline && (
        <PaginationNav
          page={page}
          pageSize={pageSize}
          total={total}
          pathname={pathname}
          query={query}
          itemLabel="patient"
        />
      )}
    </div>
  );
}
