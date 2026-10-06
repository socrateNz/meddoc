import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPermissions } from "@/actions/permissions";
import { PaginationNav, keepQuery } from "@/components/ui/pagination-nav";
import { pageFromParam } from "@/lib/pagination";
import PermissionsMatrix from "./permissions-matrix";

export const metadata = {
  title: "Permissions | MedDoc",
};

interface PermissionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PermissionsPage({ searchParams }: PermissionsPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const query = await searchParams;
  const result = await listPermissions({ page: pageFromParam(query.page) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Permissions</h1>
        <p className="text-muted-foreground">
          Contrôlez finement, par rôle, quelles actions sensibles sont autorisées. Ce réglage vient s'ajouter aux
          restrictions de base déjà appliquées par page.
        </p>
      </div>

      <PermissionsMatrix permissions={result.success ? (result.data as any) : []} />
      {result.success && (
        <PaginationNav
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          pathname="/dashboard/permissions"
          query={keepQuery(query)}
          itemLabel="permission"
        />
      )}
    </div>
  );
}
