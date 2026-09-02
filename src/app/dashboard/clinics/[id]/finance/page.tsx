import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getFinanceSummary } from "@/actions/finance";
import { getStockValuation } from "@/actions/stock";
import { listCashSessions } from "@/actions/registers";
import FinanceView from "@/app/dashboard/finance/finance-view";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Finance Clinique | MedDoc",
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

  // Les 4 requêtes ci-dessous ne dépendent que de clinicId / activeUser (déjà résolus),
  // elles sont indépendantes entre elles et peuvent donc partir en parallèle.
  const [financeRes, clinicOrg, valuationRes, sessionsRes] = await Promise.all([
    getFinanceSummary(clinicId),
    prisma.organization.findUnique({
      where: { id: clinicId },
      select: { name: true, logoUrl: true }
    }),
    getStockValuation(clinicId),
    listCashSessions(clinicId),
  ]);

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

  const orgName = clinicOrg?.name || (activeUser.organization as any)?.name || "ÉTABLISSEMENT MÉDICAL";

  const valuation = valuationRes.success ? valuationRes.data : undefined;
  const sessions = sessionsRes.success ? sessionsRes.data || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Finance (Clinique)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Synthèse du solde de caisse, journal des mouvements et valorisation du stock pour cette clinique.
        </p>
      </div>

      <FinanceView
        summary={summary}
        organizationId={clinicId}
        organizationName={orgName}
        organizationLogoUrl={clinicOrg?.logoUrl}
        currentUserRole={activeUser.role}
        sessions={sessions as any}
        valuation={valuation}
      />
    </div>
  );
}
