import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listBloodStock, listTransfusions } from "@/actions/blood-bank";
import BloodStockView from "./blood-stock-view";
import TransfusionsView from "./transfusions-view";
import ReceiveUnitDialog from "./receive-unit-dialog";
import ReserveUnitDialog from "./reserve-unit-dialog";

export const metadata = {
  title: "Banque de sang | MedDoc",
};

interface BanqueSangPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BanqueSangPage({ params, searchParams }: BanqueSangPageProps) {
  const { id: clinicId } = await params;
  const query = await searchParams;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  const tab = query.tab === "transfusions" ? "transfusions" : "stock";
  const basePath = `/dashboard/clinics/${clinicId}/banque-sang`;
  // Les deux listes contrôlent le rôle et le périmètre de la clinique.
  const [stockRes, transfusionsRes] = await Promise.all([listBloodStock(clinicId), tab === "transfusions" ? listTransfusions({ clinicId }) : Promise.resolve(null)]);

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${active ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-300"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 animate-fade-up">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Banque de sang</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Stock de produits sanguins, contrôles de compatibilité et traçabilité des transfusions (hémovigilance).</p>
        </div>
        {stockRes.success && (
          <div className="flex flex-wrap gap-2">
            {stockRes.canManage && <ReceiveUnitDialog clinicId={clinicId} />}
            {stockRes.canReserve && <ReserveUnitDialog clinicId={clinicId} />}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl w-fit">
        <Link href={basePath} className={tabClass(tab === "stock")}>
          Stock
        </Link>
        <Link href={`${basePath}?tab=transfusions`} className={tabClass(tab === "transfusions")}>
          Transfusions
        </Link>
      </div>

      {tab === "stock" ? (
        stockRes.success ? (
          <BloodStockView units={stockRes.data} canManage={stockRes.canManage} />
        ) : (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{stockRes.error}</div>
        )
      ) : transfusionsRes?.success ? (
        <TransfusionsView clinicId={clinicId} transfusions={transfusionsRes.data} permissions={transfusionsRes.permissions} />
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{transfusionsRes?.error}</div>
      )}
    </div>
  );
}
