import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAuditLogs } from "@/actions/audit";
import AuditLogTable from "./audit-log-table";

export default async function AuditLogPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const result = await getAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Journal d'audit</h1>
        <p className="text-muted-foreground">
          Historique des actions sensibles effectuées sur votre périmètre (200 dernières entrées).
        </p>
      </div>

      <AuditLogTable logs={result.success ? (result.data as any) : []} />
    </div>
  );
}
