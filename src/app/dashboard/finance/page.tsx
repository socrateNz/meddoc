import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getFinanceSummary } from "@/actions/finance";
import FinanceView from "./finance-view";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Gestion Financière & Pharmacie | MedDoc",
};

export default async function FinancePage() {
  const activeUser = await getCurrentUser();
  if (!activeUser) {
    redirect("/login");
  }

  const financeRes = await getFinanceSummary();
  const summary = financeRes.success && financeRes.data ? financeRes.data : {
    totalIncome: 0,
    totalExpenses: 0,
    cashBalance: 0,
    todayIncome: 0,
    todayExpenses: 0,
    lowStockCount: 0,
    transactions: [],
    pharmacyItems: [],
  };

  // Fetch patients list for dropdowns
  const whereClause: any = {};
  if (activeUser.organization?.type === "HOLDING") {
    whereClause.OR = [
      { organizationId: activeUser.organizationId },
      { organization: { parentId: activeUser.organizationId } }
    ];
  } else if (activeUser.organization?.type === "CLINIC") {
    whereClause.organizationId = activeUser.organizationId;
  }

  const patients = await prisma.patient.findMany({
    where: whereClause,
    include: { user: true },
    orderBy: { user: { lastName: "asc" } }
  });

  const orgName = (activeUser.organization as any)?.name || "ÉTABLISSEMENT MÉDICAL";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Finance, Pharmacie & Caisse
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Suivi en temps réel du solde de caisse (FCFA), vente de médicaments avec gestion de stock et enregistrement des encaissements et dépenses.
        </p>
      </div>

      <FinanceView summary={summary} patients={patients} organizationName={orgName} />
    </div>
  );
}
