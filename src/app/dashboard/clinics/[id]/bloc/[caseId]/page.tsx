import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSurgeryCase, listOperatingRooms } from "@/actions/surgery";
import SurgeryCaseDetail from "./surgery-case-detail";

export const metadata = {
  title: "Intervention | MedDoc",
};

interface SurgeryCasePageProps {
  params: Promise<{ id: string; caseId: string }>;
}

export default async function SurgeryCasePage({ params }: SurgeryCasePageProps) {
  const { id: clinicId, caseId } = await params;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  // getSurgeryCase contrôle le rôle et l'accès au patient.
  const [res, roomsRes] = await Promise.all([getSurgeryCase(caseId), listOperatingRooms(clinicId)]);
  if (!res.success || res.data.organizationId !== clinicId) notFound();

  return <SurgeryCaseDetail surgery={res.data} clinicId={clinicId} rooms={roomsRes.success ? roomsRes.data.map((r) => ({ id: r.id, name: r.name })) : []} />;
}
