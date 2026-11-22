import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can, GRANTABLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions-catalog";
import { STAFF_ROLE_LABELS, STAFF_ROLE_DESCRIPTIONS } from "@/lib/staff-roles";
import { listClinicRoles } from "@/actions/clinic-roles";
import { Button } from "@/components/ui/button";
import RolesEditor from "./roles-editor";

export default async function ClinicRolesPage(props: { params: Promise<{ id: string }> }) {
  const { id: clinicId } = await props.params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!can(currentUser, "roles.manage") || currentUser.organizationId !== clinicId) redirect(`/dashboard/clinics/${clinicId}`);

  const res = await listClinicRoles(clinicId);
  if (!res.success) {
    return <p className="text-sm text-red-600">{res.error}</p>;
  }

  // Catalogue affiché, groupé (seulement ce qu'un rôle de clinique peut recevoir).
  const groups: { name: string; permissions: { key: string; label: string }[] }[] = [];
  for (const key of GRANTABLE_PERMISSIONS) {
    const def = PERMISSIONS[key];
    let group = groups.find((g) => g.name === def.group);
    if (!group) groups.push((group = { name: def.group, permissions: [] }));
    group.permissions.push({ key, label: def.label });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/clinics/${clinicId}/settings`}>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-emerald-600" />
            Rôles et permissions
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Choisissez ce que chaque rôle peut faire dans votre clinique, ou créez des rôles à attribuer en plus du rôle principal d&apos;un membre (Équipe).
            Le rôle Coordinateur garde toujours tous les droits.
          </p>
        </div>
      </div>
      <RolesEditor
        clinicId={clinicId}
        groups={groups}
        roleLabels={STAFF_ROLE_LABELS}
        roleDescriptions={STAFF_ROLE_DESCRIPTIONS}
        initial={res.data}
      />
    </div>
  );
}
