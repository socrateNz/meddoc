import { prisma } from "@/lib/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, User as UserIcon } from "lucide-react";
import NewPatientDialog from "./new-patient-dialog";
import Link from "next/link";
import { Patient, User } from "@prisma/client";

export default async function PatientsPage() {
  const patients = await prisma.patient.findMany({
    include: {
      user: true,
    },
    orderBy: {
      user: {
        lastName: "asc"
      }
    }
  });

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-up">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Patients</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerez la liste de vos patients et leurs informations médicales.
          </p>
        </div>
        <NewPatientDialog />
      </div>

      <div className="flex items-center gap-2 animate-fade-up" style={{ animationDelay: "75ms" } as React.CSSProperties}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            type="search"
            placeholder="Rechercher un patient..."
            className="pl-9 pr-4 py-2.5 h-10 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md focus:bg-white dark:focus:bg-slate-900 transition-all duration-300 focus:shadow-md focus:shadow-blue-500/5 focus:border-blue-500/50"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs overflow-hidden animate-fade-up" style={{ animationDelay: "150ms" } as React.CSSProperties}>
        <Table>
          <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
            <TableRow className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Nom complet</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Email</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Date de naissance</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Niveau de dépendance</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 py-3.5">Pathologies</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 text-right py-3.5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500 dark:text-slate-400 font-medium">
                  Aucun patient trouvé. Cliquez sur "Nouveau patient" pour commencer.
                </TableCell>
              </TableRow>
            ) : (
              patients.map((patient: Patient & { user: User }) => (
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
                      Niveau {patient.dependencyLevel}
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
                    <Link href={`/dashboard/patients/${patient.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/5 rounded-lg transition-colors">Voir profil</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
