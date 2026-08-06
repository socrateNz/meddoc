import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, User as UserIcon } from "lucide-react";
import NewPatientDialog from "./new-patient-dialog";
import Link from "next/link";
import { Patient, User } from "@prisma/client";
import { getClinics } from "@/actions/organizations";

import PatientTable from "./patient-table";

export default async function PatientsPage() {
  const activeUser = await getCurrentUser();
  if (!activeUser) return null;

  const isHoldingAdmin = activeUser.role === "ADMIN" && activeUser.organization?.type === "HOLDING";
  let clinics: { id: string; name: string }[] = [];
  if (isHoldingAdmin) {
    const clinicsRes = await getClinics();
    if (clinicsRes.clinics) {
      clinics = clinicsRes.clinics.map(c => ({ id: c.id, name: c.name }));
    }
  }

  const whereClause: any = {};
  if (activeUser.organization?.type === "HOLDING") {
    whereClause.OR = [
      { organizationId: activeUser.organizationId },
      { organization: { parentId: activeUser.organizationId } }
    ];
  } else if (activeUser.organization?.type === "CLINIC") {
    whereClause.organizationId = activeUser.organizationId;
  } else {
    // Tableau `in` vide : ne matche jamais, sans faire planter Prisma sur un ObjectId invalide.
    whereClause.organizationId = { in: [] };
  }

  const patients = await prisma.patient.findMany({
    where: whereClause,
    include: {
      user: true,
      carePlans: {
        select: {
          id: true,
          status: true,
        }
      }
    },
    orderBy: {
      user: {
        lastName: "asc"
      }
    },
    // Garde-fou : la recherche/filtrage de PatientTable est client-side sur cette liste,
    // donc pas de vraie pagination ici — juste une limite haute pour éviter de ramener une
    // collection entière si l'organisation grossit fortement.
    take: 500,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-up">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Patients</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez la liste de vos patients, filtrez par statut de soins et consultez leurs dossiers.
          </p>
        </div>
        {["COORDINATOR", "MEDECIN", "CAREGIVER"].includes(activeUser.role) && (
          <NewPatientDialog
            isHoldingAdmin={isHoldingAdmin}
            holdingId={activeUser.organizationId || ""}
            clinics={clinics}
          />
        )}
      </div>

      <PatientTable patients={patients} />
    </div>
  );
}
