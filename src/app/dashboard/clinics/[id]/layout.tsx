import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";

interface ClinicLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ClinicLayout(props: ClinicLayoutProps) {
  const params = await props.params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const clinicId = params.id;

  // 1. If user is CLINIC level, verify they belong to this clinic
  if (currentUser.organization?.type === "CLINIC") {
    if (currentUser.organizationId !== clinicId) {
      // Redirect to their own clinic
      redirect(`/dashboard/clinics/${currentUser.organizationId}`);
    }
  }

  // 2. If user is HOLDING admin, verify the clinic belongs to their holding
  if (currentUser.organization?.type === "HOLDING" && currentUser.role === "ADMIN") {
    const clinic = await prisma.organization.findFirst({
      where: {
        id: clinicId,
        parentId: currentUser.organizationId,
        type: "CLINIC",
      },
    });

    if (!clinic) {
      // Trying to access an unauthorized clinic
      notFound();
    }
  }

  // 3. Fallback check for standard medical staff roles
  if (!["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  return <>{props.children}</>;
}
