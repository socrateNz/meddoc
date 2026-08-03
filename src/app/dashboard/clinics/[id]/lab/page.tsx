import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listLabOrders } from "@/actions/lab";
import LabView from "@/app/dashboard/lab/lab-view";

export const metadata = {
  title: "Laboratoire (Clinique) | MedDoc",
};

interface ClinicLabPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicLabPage({ params }: ClinicLabPageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const [labOrdersRes, patients] = await Promise.all([
    listLabOrders({ organizationId: clinicId }),
    prisma.patient.findMany({
      where: { organizationId: clinicId },
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
  ]);

  const labOrders = labOrdersRes.success ? labOrdersRes.data || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Laboratoire (Clinique)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Demandes d&apos;analyses et résultats de laboratoire pour cette clinique.
        </p>
      </div>

      <LabView labOrders={labOrders} patients={patients} currentUserRole={currentUser.role} />
    </div>
  );
}
