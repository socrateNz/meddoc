import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAuditLogs } from "@/actions/audit";
import { PaginationNav } from "@/components/ui/pagination-nav";
import AuditLogTable from "@/app/dashboard/audit-log/audit-log-table";

export const metadata = {
  title: "Journal d'audit (Clinique) | MedDoc",
};

interface ClinicAuditLogPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function ClinicAuditLogPage({ params, searchParams }: ClinicAuditLogPageProps) {
  const { id: clinicId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "ADMIN") {
    redirect(`/dashboard/clinics/${clinicId}`);
  }

  const { page } = await searchParams;
  const result = await getAuditLogs(clinicId, { page: Number(page) || 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Journal d'audit (Clinique)</h1>
        <p className="text-muted-foreground">
          Historique des actions sensibles effectuées dans cette clinique, 20 entrées par page.
        </p>
      </div>

      <AuditLogTable logs={result.success ? (result.data as any) : []} />
      {result.success && (
        <PaginationNav
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          pathname={`/dashboard/clinics/${clinicId}/audit-log`}
          itemLabel="entrée"
        />
      )}
    </div>
  );
}
