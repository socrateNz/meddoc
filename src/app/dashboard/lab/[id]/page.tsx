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

  // Indépendants : la demande d'analyse ne dépend pas de l'utilisateur courant chargé ici.
  const [currentUser, res] = await Promise.all([
    getCurrentUser(),
    getLabOrder(resolvedParams.id),
  ]);
  if (!currentUser) {
    redirect("/login");
  }

  if (!res.success || !res.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <LabOrderDetail order={res.data} currentUserRole={currentUser.role} />
    </div>
  );
}
