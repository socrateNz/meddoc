import { getCurrentUser } from "@/lib/auth";
import { getPharmacyItems, listPharmacyDispenseQueue, listPharmacyDispenseHistory } from "@/actions/finance";
import { keepQuery } from "@/components/ui/pagination-nav";
import { pageFromParam } from "@/lib/pagination";
import { listRegistersWithStatus } from "@/actions/registers";
import PharmacieView from "@/app/dashboard/pharmacie/pharmacie-view";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Pharmacie | MedDoc",
};

interface ClinicPharmaciePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClinicPharmaciePage({ params, searchParams }: ClinicPharmaciePageProps) {
  const { id: clinicId } = await params;
  const query = await searchParams;
  const queuePage = pageFromParam(query.queuePage);
  const historyPage = pageFromParam(query.historyPage);
  const historySearch = typeof query.historySearch === "string" ? query.historySearch : undefined;

  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  const [pharmacyItemsRes, dispenseQueueRes, dispenseHistoryRes, registersRes] = await Promise.all([
    getPharmacyItems(clinicId),
    listPharmacyDispenseQueue(clinicId, { page: queuePage }),
    listPharmacyDispenseHistory(clinicId, { page: historyPage, search: historySearch }),
    listRegistersWithStatus(clinicId),
  ]);

  const pharmacyItems = pharmacyItemsRes.success ? pharmacyItemsRes.data || [] : [];
  const dispenseQueue = dispenseQueueRes.success ? dispenseQueueRes.data || [] : [];
  const dispenseHistory = dispenseHistoryRes.success ? dispenseHistoryRes.data || [] : [];
  const pathname = `/dashboard/clinics/${clinicId}/pharmacie`;
  const queuePagination = dispenseQueueRes.success
    ? { page: dispenseQueueRes.page, pageSize: dispenseQueueRes.pageSize, total: dispenseQueueRes.total }
    : { page: 1, pageSize: 20, total: 0 };
  const historyPagination = dispenseHistoryRes.success
    ? { page: dispenseHistoryRes.page, pageSize: dispenseHistoryRes.pageSize, total: dispenseHistoryRes.total }
    : { page: 1, pageSize: 20, total: 0 };
  const openRegisters = (registersRes.success ? registersRes.data || [] : []).filter((r) => r.isActive && r.openSession);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Pharmacie</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Remettez les médicaments réglés à la caisse et gérez le stock du comptoir pharmacie.
        </p>
      </div>

      <PharmacieView
        pharmacyItems={pharmacyItems}
        dispenseQueue={dispenseQueue}
        dispenseHistory={dispenseHistory}
        queuePagination={queuePagination}
        historyPagination={historyPagination}
        initialHistorySearch={historySearch ?? ""}
        pathname={pathname}
        queueQuery={keepQuery(query, ["queuePage"])}
        historyQuery={keepQuery(query, ["historyPage"])}
        organizationId={clinicId}
        currentUserRole={activeUser.role}
        openRegisters={openRegisters as any}
      />
    </div>
  );
}
