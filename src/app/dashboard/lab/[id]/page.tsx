import { getCurrentUser } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getLabOrder } from "@/actions/lab";
import LabOrderDetail from "./lab-order-detail";

export const metadata = {
  title: "Détail de la demande d'analyse | MedDoc",
};

interface LabOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LabOrderDetailPage({ params }: LabOrderDetailPageProps) {
  const resolvedParams = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const res = await getLabOrder(resolvedParams.id);
  if (!res.success || !res.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <LabOrderDetail order={res.data} currentUserRole={currentUser.role} />
    </div>
  );
}
