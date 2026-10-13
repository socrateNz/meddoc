import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listRadiologyExams, listRadiologyOrders } from "@/actions/radiology";
import { RADIOLOGY_STATUS_LABELS } from "@/lib/radiology";
import { pageFromParam } from "@/lib/pagination";
import { PaginationNav } from "@/components/ui/pagination-nav";
import RadiologyOrderList from "./radiology-order-list";
import RadiologyCatalog from "./radiology-catalog";

export const metadata = {
  title: "Imagerie | MedDoc",
};

interface ImageriePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FILTERS = ["ALL", "PRESCRIBED", "PERFORMED", "REPORTED", "VALIDATED", "CANCELLED"];

export default async function ImageriePage({ params, searchParams }: ImageriePageProps) {
  const { id: clinicId } = await params;
  const query = await searchParams;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  const status = typeof query.status === "string" && FILTERS.includes(query.status) ? query.status : "ALL";
  const showCatalog = query.tab === "catalogue" && activeUser.role === "COORDINATOR";

  const [ordersRes, examsRes] = await Promise.all([
    listRadiologyOrders({ clinicId, status, page: pageFromParam(query.page) }),
    showCatalog ? listRadiologyExams(clinicId, { includeInactive: true }) : Promise.resolve(null),
  ]);

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${active ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-300"}`;
  const basePath = `/dashboard/clinics/${clinicId}/imagerie`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Imagerie médicale</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Examens prescrits, réalisation, clichés et comptes-rendus. La prescription se fait depuis le dossier du patient (onglet Imagerie).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
          {FILTERS.map((f) => (
            <Link key={f} href={f === "ALL" ? basePath : `${basePath}?status=${f}`} className={tabClass(!showCatalog && status === f)}>
              {f === "ALL" ? "Tous" : RADIOLOGY_STATUS_LABELS[f]}
            </Link>
          ))}
        </div>
        {activeUser.role === "COORDINATOR" && (
          <Link href={`${basePath}?tab=catalogue`} className={`${tabClass(showCatalog)} border border-slate-200 dark:border-slate-800`}>
            Catalogue des examens
          </Link>
        )}
      </div>

      {showCatalog && examsRes?.success ? (
        <RadiologyCatalog clinicId={clinicId} exams={examsRes.data} />
      ) : ordersRes.success ? (
        <>
          <RadiologyOrderList orders={ordersRes.data} clinicId={clinicId} />
          <PaginationNav
            page={ordersRes.page}
            pageSize={ordersRes.pageSize}
            total={ordersRes.total}
            pathname={basePath}
            query={status === "ALL" ? {} : { status }}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{ordersRes.error}</div>
      )}
    </div>
  );
}
