import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { listContracts } from "@/actions/contracts";
import NewContractDialog from "@/app/dashboard/contracts/new-contract-dialog";
import ContractsList from "@/app/dashboard/contracts/contracts-list";

export const metadata = {
  title: "Contrats aidants (Clinique) | MedDoc",
};

interface ClinicContractsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicContractsPage({ params }: ClinicContractsPageProps) {
  const { id: clinicId } = await params;

  const activeUser = await getCurrentUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (activeUser.role !== "ADMIN" && activeUser.role !== "COORDINATOR") {
    redirect(`/dashboard/clinics/${clinicId}`);
  }

  const [contractsRes, patients, caregivers] = await Promise.all([
    listContracts(clinicId),
    prisma.patient.findMany({
      where: { organizationId: clinicId },
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
    prisma.caregiver.findMany({
      where: { user: { organizationId: clinicId } },
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contrats aidants (Clinique)</h1>
          <p className="text-muted-foreground">
            Conditions d'intervention (taux horaire, volume d'heures) entre patients et aidants/soignants de cette clinique.
          </p>
        </div>
        <NewContractDialog patients={patients} caregivers={caregivers} organizationId={clinicId} />
      </div>

      <ContractsList contracts={(contractsRes.success ? contractsRes.data : []) as any} />
    </div>
  );
}
