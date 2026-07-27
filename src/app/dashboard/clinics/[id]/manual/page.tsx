import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import UserManual from "@/components/dashboard/user-manual";

interface ClinicManualPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicManualPage({ params }: ClinicManualPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

  return <UserManual userRole={currentUser.role} clinicId={clinicId} />;
}
