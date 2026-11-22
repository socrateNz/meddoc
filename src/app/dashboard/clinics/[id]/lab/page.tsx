import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLabOrderStats, listLabOrders } from "@/actions/lab";
import { MAX_PAGE_SIZE, pageFromParam } from "@/lib/pagination";
import { keepQuery } from "@/components/ui/pagination-nav";
import LabView from "@/app/dashboard/lab/lab-view";
import { listPartners } from "@/actions/partners";
import { patientServiceWhere, restrictedServiceIds } from "@/lib/service-access";

export const metadata = {
  title: "Laboratoire (Clinique) | MedDoc",
};

interface ClinicLabPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const EMPTY_STATS = { pending: 0, inAnalysis: 0, toValidate: 0, validatedToday: 0, urgent: 0, critical: 0, open: 0 };

export default async function ClinicLabPage({ params, searchParams }: ClinicLabPageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : undefined;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const myServices = await restrictedServiceIds(currentUser);
  const bench = typeof query.paillasse === "string" ? query.paillasse : undefined;
  const [labOrdersRes, statsRes, patients, partnersRes, benchRows] = await Promise.all([
    listLabOrders({ organizationId: clinicId, page: pageFromParam(query.page), search, urgentOnly: query.urgent === "1", bench }),
    getLabOrderStats({ organizationId: clinicId }),
    // Patients proposés pour une nouvelle demande : ceux des services de l'utilisateur.
    prisma.patient.findMany({
      where: { organizationId: clinicId, ...patientServiceWhere(myServices) },
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
    listPartners(clinicId),
    // Paillasses utilisées dans le catalogue de la clinique.
    prisma.labTest.findMany({ where: { organizationId: clinicId, isActive: true, department: { not: null } }, select: { department: true } }),
  ]);
  const benches = [...new Set(benchRows.map((r) => r.department?.trim()).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, "fr"));
  const partners = partnersRes.success ? partnersRes.data.map((p) => ({ id: p.id, name: p.name })) : [];

  const list = labOrdersRes.success ? labOrdersRes : { data: [], total: 0, page: 1, pageSize: MAX_PAGE_SIZE };
  const stats = statsRes.success ? statsRes.data : EMPTY_STATS;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Laboratoire (Clinique)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Demandes d&apos;analyses et résultats de laboratoire pour cette clinique.
        </p>
      </div>

      <LabView
        labOrders={list.data}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        stats={stats}
        query={keepQuery(query)}
        pathname={`/dashboard/clinics/${clinicId}/lab`}
        patients={patients}
        currentUserRole={currentUser.role}
        organizationId={clinicId}
        partners={partners}
        benches={benches}
      />
    </div>
  );
}
