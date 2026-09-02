import { getCurrentUser } from "@/lib/auth";
import { getPharmacyItems, listPharmacyDispenseQueue } from "@/actions/finance";
import PharmacieView from "@/app/dashboard/pharmacie/pharmacie-view";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Pharmacie | MedDoc",
};

interface ClinicPharmaciePageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicPharmaciePage({ params }: ClinicPharmaciePageProps) {
  const { id: clinicId } = await params;

  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  const [pharmacyItemsRes, dispenseQueueRes] = await Promise.all([
    getPharmacyItems(clinicId),
    listPharmacyDispenseQueue(clinicId),
  ]);

  const pharmacyItems = pharmacyItemsRes.success ? pharmacyItemsRes.data || [] : [];
  const dispenseQueue = dispenseQueueRes.success ? dispenseQueueRes.data || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Pharmacie</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Remettez les médicaments réglés à la caisse et gérez le stock du comptoir pharmacie.
        </p>
      </div>

      <PharmacieView
        pharmacyItems={pharmacyItems}
        dispenseQueue={dispenseQueue}
        organizationId={clinicId}
        currentUserRole={activeUser.role}
      />
    </div>
  );
}
