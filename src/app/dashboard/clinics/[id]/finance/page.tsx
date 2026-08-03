import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getFinanceSummary, listPendingInvoices } from "@/actions/finance";
import { getStockValuation } from "@/actions/stock";
import FinanceView from "@/app/dashboard/finance/finance-view";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Finance & Pharmacie Clinique | MedDoc",
};

interface ClinicFinancePageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicFinancePage({ params }: ClinicFinancePageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

  const activeUser = await getCurrentUser();
  if (!activeUser) {
    redirect("/login");
  }

  const financeRes = await getFinanceSummary(clinicId);
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

  const patients = await prisma.patient.findMany({
    where: { organizationId: clinicId },
    include: { user: true },
    orderBy: { user: { lastName: "asc" } }
  });

  const clinicOrg = await prisma.organization.findUnique({
    where: { id: clinicId },
    select: { name: true }
  });
  const orgName = clinicOrg?.name || (activeUser.organization as any)?.name || "ÉTABLISSEMENT MÉDICAL";

  const pendingInvoicesRes = await listPendingInvoices(clinicId);
  const pendingInvoices = pendingInvoicesRes.success ? pendingInvoicesRes.data || [] : [];

  const valuationRes = await getStockValuation(clinicId);
  const valuation = valuationRes.success ? valuationRes.data : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Finance & Pharmacie (Clinique)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gestion de la caisse, ventes de pharmacie et dépenses pour cette clinique.
        </p>
      </div>

      <FinanceView summary={summary} patients={patients} organizationId={clinicId} organizationName={orgName} currentUserRole={activeUser.role} pendingInvoices={pendingInvoices} valuation={valuation} />
    </div>
  );
}
