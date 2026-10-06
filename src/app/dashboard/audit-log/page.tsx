import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAuditLogs } from "@/actions/audit";
import { PaginationNav } from "@/components/ui/pagination-nav";
import AuditLogTable from "./audit-log-table";

interface AuditLogPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const { page } = await searchParams;
  const result = await getAuditLogs(undefined, { page: Number(page) || 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Journal d&apos;audit</h1>
        <p className="text-muted-foreground">
          Historique des actions sensibles effectuées sur votre périmètre, 20 entrées par page.
        </p>
      </div>

      <AuditLogTable logs={result.success ? (result.data as any) : []} />
      {result.success && (
        <PaginationNav
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          pathname="/dashboard/audit-log"
          itemLabel="entrée"
        />
      )}
    </div>
  );
}
