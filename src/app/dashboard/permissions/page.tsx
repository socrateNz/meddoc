import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPermissions } from "@/actions/permissions";
import PermissionsMatrix from "./permissions-matrix";

export const metadata = {
  title: "Permissions | MedDoc",
};

export default async function PermissionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (currentUser.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const result = await listPermissions();

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
    </div>
  );
}
