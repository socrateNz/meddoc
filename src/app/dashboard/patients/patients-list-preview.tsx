// Prévisualisation non interactive de la liste des patients, réutilisée par les deux
// loading.tsx jumeaux (global + clinique) — même convention que PatientTable, qui est déjà
// importé par chemin absolu depuis src/app/dashboard/clinics/[id]/patients/page.tsx.
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, User as UserIcon, XCircle } from "lucide-react";

export interface PatientListPreviewItem {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  dependencyLevel: number;
}

export interface PatientsListPreviewData {
  totalCount: number;
  patients: PatientListPreviewItem[];
}

export default function PatientsListPreview({ data }: { data: PatientsListPreviewData }) {
  const { totalCount, patients } = data;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
            <TableRow className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Nom complet</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Statut</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Dépendance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => {
              const isDischarged = patient.status === "DISCHARGED";
              return (
                <TableRow key={patient.id} className="border-b border-slate-100 dark:border-slate-800/40">
                  <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-bold">
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {patient.lastName} {patient.firstName}
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
                  <TableCell className="py-3.5">
                    <Badge
                      variant="outline"
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                        patient.dependencyLevel > 3
                          ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/30"
                      }`}
                    >
                      GIR {patient.dependencyLevel}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {totalCount > patients.length && (
        <p className="text-xs text-center text-slate-500 dark:text-slate-400">+{totalCount - patients.length} autres</p>
      )}
    </div>
  );
}
