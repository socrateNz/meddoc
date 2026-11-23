import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listRegistersWithStatus } from "@/actions/registers";
import { getPharmacyItems, listCaisseHistoryInvoices } from "@/actions/finance";
import { listLabTestsForSale } from "@/actions/lab";
import { listRadiologyExamsForSale } from "@/actions/radiology";
import CaisseView from "@/app/dashboard/caisse/caisse-view";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions-catalog";

export const metadata = {
  title: "Caisse | MedDoc",
};

interface ClinicCaissePageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicCaissePage({ params }: ClinicCaissePageProps) {
  const { id: clinicId } = await params;

  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");
  // Le middleware filtre déjà sur le jeton ; ici sur les permissions à jour (rôle ajusté par la
  // clinique depuis l'émission du jeton, ex: pharmacien privé de caisse) : retour à sa pharmacie.
  if (!can(activeUser, "caisse.access")) {
    redirect(`/dashboard/clinics/${clinicId}${can(activeUser, "pharmacy.access") ? "/pharmacie" : ""}`);
  }

  const [registersRes, patients, clinicOrg, pharmacyItemsRes, historyRes, labTestsRes, services, imagingRes] = await Promise.all([
    listRegistersWithStatus(clinicId),
    prisma.patient.findMany({
      where: { organizationId: clinicId },
      include: { user: true },
      orderBy: { user: { lastName: "asc" } },
    }),
    prisma.organization.findUnique({ where: { id: clinicId }, select: { name: true, logoUrl: true, phone: true, address: true } }),
    getPharmacyItems(clinicId),
    listCaisseHistoryInvoices(clinicId),
    // Catalogues de la vente au guichet : examens (tarif maison) et consultations (tarif des services).
    listLabTestsForSale(clinicId),
    prisma.clinicService.findMany({
      where: { organizationId: clinicId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, consultationPrice: true },
    }),
    listRadiologyExamsForSale(clinicId),
  ]);

  const registers = registersRes.success ? registersRes.data || [] : [];
  const pharmacyItems = pharmacyItemsRes.success ? pharmacyItemsRes.data || [] : [];
  const initialHistory = historyRes.success ? historyRes.data || [] : [];
  const initialHistoryTotal = historyRes.success ? historyRes.total ?? 0 : 0;
  const orgName = clinicOrg?.name || (activeUser.organization as any)?.name || "ÉTABLISSEMENT MÉDICAL";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Caisse</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ouvrez votre session, encaissez les patients, suivez l&apos;historique des tickets et identifiez les clients.
        </p>
      </div>

      <CaisseView
        initialRegisters={registers as any}
        initialHistory={initialHistory as any}
        initialHistoryTotal={initialHistoryTotal}
        organizationId={clinicId}
        organizationName={orgName}
        organizationLogoUrl={clinicOrg?.logoUrl}
        organizationContact={clinicOrg}
        currentUserId={activeUser.id}
        currentUserRole={activeUser.role}
        patients={patients}
        pharmacyItems={pharmacyItems}
        labTests={labTestsRes.success ? labTestsRes.data : []}
        services={services}
        imagingExams={imagingRes.success ? imagingRes.data : []}
      />
    </div>
  );
}
