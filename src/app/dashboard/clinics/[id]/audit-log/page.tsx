import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAuditLogs } from "@/actions/audit";
import AuditLogTable from "@/app/dashboard/audit-log/audit-log-table";

export const metadata = {
  title: "Journal d'audit (Clinique) | MedDoc",
};

interface ClinicAuditLogPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicAuditLogPage({ params }: ClinicAuditLogPageProps) {
  const { id: clinicId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "ADMIN") {
    redirect(`/dashboard/clinics/${clinicId}`);
  }

  const result = await getAuditLogs(clinicId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Journal d'audit (Clinique)</h1>
        <p className="text-muted-foreground">
          Historique des actions sensibles effectuées dans cette clinique (200 dernières entrées).
        </p>
      </div>

      <AuditLogTable logs={result.success ? (result.data as any) : []} />
    </div>
  );
}
