import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClinicSettingsForm from "./settings-form";

export default async function ClinicSettingsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN" || currentUser.organization?.type !== "HOLDING") {
    redirect("/dashboard");
  }

  const clinic = await prisma.organization.findFirst({
    where: {
      id: params.id,
      parentId: currentUser.organizationId,
      type: "CLINIC"
    }
  });

  if (!clinic) {
    redirect("/dashboard/clinics");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/clinics/${params.id}`}>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            Configuration
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            {clinic.name}
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <ClinicSettingsForm clinic={{ id: clinic.id, name: clinic.name }} />
      </div>
    </div>
  );
}
