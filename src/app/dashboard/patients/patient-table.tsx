"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, User as UserIcon, CheckCircle2, XCircle, Filter, WifiOff } from "lucide-react";
import Link from "next/link";
import { useOfflinePatients } from "@/hooks/use-offline-patients";

interface PatientWithUser {
  id: string;
  status?: string;
  dependencyLevel: number;
  dateOfBirth: Date | string;
  pathologies: string[];
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface PatientTableProps {
  patients: PatientWithUser[];
  clinicId?: string;
  organizationId?: string;
}

export default function PatientTable({ patients, clinicId, organizationId }: PatientTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DISCHARGED">("ALL");

  // Repli hors-ligne : dès que le navigateur signale une coupure réseau, la liste bascule sur
  // le cache local chiffré (RxDB) au lieu de la liste rendue côté serveur au dernier chargement.
  // Limite connue de cette phase : le statut clôturé/actif offline ne s'appuie que sur
  // `Patient.status` (répliqué), pas sur les CarePlans (non répliqués) — cf. checkIsDischarged.
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
  const effectivePatients: PatientWithUser[] = isOffline ? offlineQuery.data ?? [] : patients;

  const formatDate = (dateInput: Date | string) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(dateInput));
  };

  const checkIsDischarged = (p: any) => {
    if (p.status === "DISCHARGED") return true;
    if (p.carePlans && p.carePlans.length > 0) {
      return !p.carePlans.some((cp: any) => cp.status === "ACTIVE");
    }
    return false;
  };

  const activeCount = effectivePatients.filter(p => !checkIsDischarged(p)).length;
  const dischargedCount = effectivePatients.filter(p => checkIsDischarged(p)).length;

  const filteredPatients = effectivePatients.filter((patient) => {
    const isDischarged = checkIsDischarged(patient);
    
    // Status filter logic
    if (statusFilter === "ACTIVE" && isDischarged) return false;
    if (statusFilter === "DISCHARGED" && !isDischarged) return false;

    // Search query logic
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    const fullName = `${patient.user.firstName} ${patient.user.lastName}`.toLowerCase();
    const email = patient.user.email.toLowerCase();

    return fullName.includes(query) || email.includes(query);
  });

  return (
    <div className="space-y-4">
      {isOffline && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            Mode hors-ligne — liste issue du cache local{offlineQuery.isLoading ? " (chargement...)" : ""}. Les créations/modifications de patients sont désactivées tant que la connexion n&apos;est pas rétablie.
          </span>
        </div>
      )}

      {/* Search & Filter bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 animate-fade-up" style={{ animationDelay: "75ms" } as React.CSSProperties}>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            type="search"
            placeholder="Rechercher par nom, prénom ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2.5 h-10 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md focus:bg-white dark:focus:bg-slate-900 transition-all duration-300 focus:shadow-md focus:shadow-blue-500/5 focus:border-blue-500/50"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              statusFilter === "ALL"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Tous ({effectivePatients.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVE")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              statusFilter === "ACTIVE"
                ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            Soins en cours ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DISCHARGED")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              statusFilter === "DISCHARGED"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-slate-400 inline-block" />
            Clôturés / Sortie ({dischargedCount})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs overflow-hidden animate-fade-up" style={{ animationDelay: "150ms" } as React.CSSProperties}>
        <Table>
          <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
            <TableRow className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Nom complet</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Statut</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Email</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Date de naissance</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Dépendance</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Pathologies</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 text-right py-3.5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPatients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500 dark:text-slate-400 font-medium">
                  {searchTerm || statusFilter !== "ALL"
                    ? "Aucun patient ne correspond à vos critères de recherche."
                    : "Aucun patient trouvé."}
                </TableCell>
              </TableRow>
            ) : (
              filteredPatients.map((patient) => {
                const isDischarged = checkIsDischarged(patient);
                const patientLink = clinicId
                  ? `/dashboard/clinics/${clinicId}/patients/${patient.id}`
                  : `/dashboard/patients/${patient.id}`;

                return (
                  <TableRow key={patient.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors duration-250">
                    <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold">
                          <UserIcon className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {patient.user.lastName} {patient.user.firstName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5">
                      {isDischarged ? (
                        <Badge 
                          variant="outline" 
                          className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 gap-1.5 font-medium px-2.5 py-0.5 rounded-full text-xs"
                        >
                          <XCircle className="h-3 w-3 text-slate-500" />
                          Clôturé / Sortie
                        </Badge>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 gap-1.5 font-medium px-2.5 py-0.5 rounded-full text-xs"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Soins en cours
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 font-medium py-3.5">{patient.user.email}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 font-medium py-3.5">
                      {formatDate(patient.dateOfBirth)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Badge 
                        variant="outline"
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          (patient.dependencyLevel as number) > 3 
                            ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" 
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/30"
                        }`}
                      >
                        GIR {patient.dependencyLevel}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {patient.pathologies.slice(0, 2).map((pathology: string) => (
                          <Badge key={pathology} variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50/50 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30 rounded-md">
                            {pathology}
                          </Badge>
                        ))}
                        {patient.pathologies.length > 2 && (
                          <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 rounded-md">
                            +{patient.pathologies.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-3.5">
                      <Link href={patientLink}>
                        <Button variant="ghost" size="sm" className="h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/5 rounded-lg transition-colors">
                          Voir profil
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
