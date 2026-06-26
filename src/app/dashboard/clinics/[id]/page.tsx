import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Users, FileText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ClinicDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN" || user.organization?.type !== "HOLDING") {
    redirect("/dashboard");
  }

  const clinic = await prisma.organization.findFirst({
    where: {
      id: params.id,
      parentId: user.organizationId,
      type: "CLINIC"
    },
    include: {
      _count: {
        select: { users: true, patients: true }
      }
    }
  });

  if (!clinic) {
    redirect("/dashboard/clinics");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/clinics">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
          <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold">Personnel médical</h3>
          <p className="text-3xl font-bold mt-2">{clinic._count.users}</p>
          <p className="text-sm text-slate-500 mt-2">Membres rattachés</p>
          <Link href={`/dashboard/clinics/${clinic.id}/team`} className="w-full mt-6">
            <Button className="w-full" variant="outline">Gérer le personnel</Button>
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
            <Button className="w-full" variant="outline">Voir les patients</Button>
          </Link>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
          <div className="h-12 w-12 bg-violet-50 dark:bg-violet-900/20 rounded-full flex items-center justify-center mb-4">
            <Settings className="h-6 w-6 text-violet-500" />
          </div>
          <h3 className="text-lg font-semibold">Configuration</h3>
          <p className="text-sm text-slate-500 mt-4 flex-1">Paramètres généraux, adresse et facturation.</p>
          <Link href={`/dashboard/clinics/${clinic.id}/settings`} className="w-full mt-6">
            <Button className="w-full" variant="outline">Modifier</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
