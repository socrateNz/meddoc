import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLabOrderStats, listLabOrders } from "@/actions/lab";
import { MAX_PAGE_SIZE, pageFromParam } from "@/lib/pagination";
import { keepQuery } from "@/components/ui/pagination-nav";
import LabView from "./lab-view";

export const metadata = {
  title: "Laboratoire | MedDoc",
};

interface LabPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_STATS = { pending: 0, inAnalysis: 0, toValidate: 0, validatedToday: 0, urgent: 0, critical: 0, open: 0 };

export default async function LabPage({ searchParams }: LabPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;

  const orgFilter: any = {};
  if (currentUser.organization?.type === "HOLDING") {
    orgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } }
    ];
  } else if (currentUser.organization?.type === "CLINIC") {
    orgFilter.organizationId = currentUser.organizationId;
  } else {
    orgFilter.organizationId = { in: [] };
  }

  const [labOrdersRes, statsRes, patients] = await Promise.all([
    listLabOrders({ page: pageFromParam(params.page), search, urgentOnly: params.urgent === "1" }),
    getLabOrderStats(),
    prisma.patient.findMany({
      where: orgFilter,
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
  ]);

  const list = labOrdersRes.success ? labOrdersRes : { data: [], total: 0, page: 1, pageSize: MAX_PAGE_SIZE };
  const stats = statsRes.success ? statsRes.data : EMPTY_STATS;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Laboratoire
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Demandes d&apos;analyses et résultats de laboratoire.
        </p>
      </div>

      <LabView
        labOrders={list.data}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        stats={stats}
        query={keepQuery(params)}
        pathname="/dashboard/lab"
        patients={patients}
        currentUserRole={currentUser.role}
        organizationId={currentUser.organization?.type === "CLINIC" ? currentUser.organizationId ?? undefined : undefined}
      />
    </div>
  );
}
