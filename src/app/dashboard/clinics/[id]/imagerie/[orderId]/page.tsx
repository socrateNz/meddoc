import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRadiologyOrder } from "@/actions/radiology";
import RadiologyOrderDetail from "./radiology-order-detail";

export const metadata = {
  title: "Examen d'imagerie | MedDoc",
};

interface RadiologyOrderPageProps {
  params: Promise<{ id: string; orderId: string }>;
}

export default async function RadiologyOrderPage({ params }: RadiologyOrderPageProps) {
  const { id: clinicId, orderId } = await params;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  // getRadiologyOrder contrôle le rôle et l'accès au patient.
  const res = await getRadiologyOrder(orderId);
  if (!res.success || res.data.organizationId !== clinicId) notFound();

  return <RadiologyOrderDetail order={res.data} clinicId={clinicId} />;
}
