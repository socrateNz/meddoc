import { getCurrentUser } from "@/lib/auth";
import { getFinanceSummary } from "@/actions/finance";
import { getStockValuation } from "@/actions/stock";
import { listCashSessions } from "@/actions/registers";
import FinanceView from "./finance-view";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Finance | MedDoc",
};

export default async function FinancePage() {
  const activeUser = await getCurrentUser();
  if (!activeUser) {
    redirect("/login");
  }

  // Les 3 requêtes ci-dessous sont indépendantes entre elles, on les lance en parallèle.
  const [financeRes, valuationRes, sessionsRes] = await Promise.all([
    getFinanceSummary(),
    getStockValuation(),
    listCashSessions(),
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

  const orgName = (activeUser.organization as any)?.name || "ÉTABLISSEMENT MÉDICAL";
  const orgLogoUrl = (activeUser.organization as any)?.logoUrl;

  const valuation = valuationRes.success ? valuationRes.data : undefined;
  const sessions = sessionsRes.success ? sessionsRes.data || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Finance
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Synthèse du solde de caisse (FCFA), journal des mouvements et valorisation du stock. L&apos;encaissement se fait en Caisse, la remise de médicaments en Pharmacie.
        </p>
      </div>

      <FinanceView
        summary={summary}
        organizationName={orgName}
        organizationLogoUrl={orgLogoUrl}
        currentUserRole={activeUser.role}
        sessions={sessions as any}
        valuation={valuation}
      />
    </div>
  );
}
