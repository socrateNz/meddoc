import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { listContracts } from "@/actions/contracts";
import NewContractDialog from "./new-contract-dialog";
import ContractsList from "./contracts-list";

export const metadata = {
  title: "Contrats aidants | MedDoc",
};

export default async function ContractsPage() {
  const activeUser = await getCurrentUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (activeUser.role !== "ADMIN" && activeUser.role !== "COORDINATOR") {
    redirect("/dashboard");
  }

  const whereClause: any = {};
  if (activeUser.organization?.type === "HOLDING") {
    whereClause.OR = [
      { organizationId: activeUser.organizationId },
      { organization: { parentId: activeUser.organizationId } },
    ];
  } else if (activeUser.organization?.type === "CLINIC") {
    whereClause.organizationId = activeUser.organizationId;
  }

  const [contractsRes, patients, caregivers] = await Promise.all([
    listContracts(),
    prisma.patient.findMany({
      where: whereClause,
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
    prisma.caregiver.findMany({
      where: { user: whereClause },
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contrats aidants</h1>
          <p className="text-muted-foreground">
            Conditions d'intervention (taux horaire, volume d'heures) entre patients et aidants/soignants.
          </p>
        </div>
        <NewContractDialog patients={patients} caregivers={caregivers} />
      </div>

      <ContractsList contracts={(contractsRes.success ? contractsRes.data : []) as any} />
    </div>
  );
}
