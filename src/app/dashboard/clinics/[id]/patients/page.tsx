import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, User as UserIcon } from "lucide-react";
import NewPatientDialog from "@/app/dashboard/patients/new-patient-dialog";
import Link from "next/link";
import { Patient, User } from "@prisma/client";
import { getClinics } from "@/actions/organizations";

import PatientTable from "@/app/dashboard/patients/patient-table";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicPatientsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

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

  // Strictly filter patients belonging to this clinic ID
  const patients = await prisma.patient.findMany({
    where: {
      organizationId: clinicId,
    },
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
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-up">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Patients</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez la liste des patients, leurs statuts (actifs / clôturés) et leurs dossiers pour cette clinique.
          </p>
        </div>
        <NewPatientDialog 
          isHoldingAdmin={isHoldingAdmin} 
          holdingId={activeUser.organizationId || ""} 
          clinics={clinics} 
          defaultOrganizationId={clinicId}
        />
      </div>

      <PatientTable patients={patients} clinicId={clinicId} />
    </div>
  );
}
