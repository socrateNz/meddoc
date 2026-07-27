import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import UserManual from "@/components/dashboard/user-manual";

export default async function GlobalManualPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return <UserManual userRole={currentUser.role} />;
}
