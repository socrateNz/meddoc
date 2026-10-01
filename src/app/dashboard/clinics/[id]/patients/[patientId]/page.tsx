import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClinics } from "@/actions/organizations";
import CacheWriter from "@/components/cache-writer";
import {
  PATIENT_DETAIL_INCLUDE,
  calculatePatientAge,
  fetchPatientRelatedData,
  formatPatientDate,
} from "@/app/dashboard/patients/[id]/patient-detail-data";
import PatientDetailView from "@/app/dashboard/patients/[id]/patient-detail-view";

interface PageProps {
  params: Promise<{ id: string; patientId: string }>;
}

export default async function PatientDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;
  const patientId = resolvedParams.patientId;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const hasAccess = await verifyPatientAccess(patientId, currentUser);
  if (!hasAccess) {
    notFound(); // Using notFound to hide the existence of the patient
  }

  const isHoldingAdmin = currentUser.role === "ADMIN" && currentUser.organization?.type === "HOLDING";
  // ADMIN (holding) consulte en lecture seule ; PHARMACIST n'a qu'un accès identité limité (cf. plan RBAC).
  const canWrite = ["COORDINATOR", "MEDECIN", "CAREGIVER"].includes(currentUser.role);
  // Rédiger/renouveler/envoyer une ordonnance reste réservé à l'autorité clinique complète.
  const canPrescribe = ["COORDINATOR", "MEDECIN"].includes(currentUser.role);
  // Prescrire un examen labo (autorité diagnostique) — mêmes rôles que LAB_ORDER_ROLES côté serveur.
  const canOrderLab = ["COORDINATOR", "MEDECIN"].includes(currentUser.role);
  const isPharmacist = currentUser.role === "PHARMACIST";
  let clinics: { id: string; name: string }[] = [];
  if (isHoldingAdmin) {
    const clinicsRes = await getClinics();
    if (clinicsRes.clinics) {
      clinics = clinicsRes.clinics.map((c) => ({ id: c.id, name: c.name }));
    }
  }

  // Utilisé par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement — cf.
  // plan « Affichage instantané depuis un cache local ». Même clé de cache que la jumelle
  // /dashboard/patients/[id] (même patient, même verifyPatientAccess) — cf. plan.
  const cachedAt = new Date().toISOString();

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: PATIENT_DETAIL_INCLUDE,
  });

  if (!patient) {
    notFound();
  }

  const { vitalSigns, prescriptions, labOrders, pregnancies, caregivers } = await fetchPatientRelatedData(patientId, {
    isPharmacist,
    organizationIdForCaregivers: clinicId,
  });

  // Accès pharmacien : identité uniquement, aucun onglet clinique (dossier, consultations...).
  if (isPharmacist) {
    return (
      <div className="space-y-6">
        <Link href={`/dashboard/clinics/${clinicId}/patients`}>
          <Button variant="ghost" className="gap-2 pl-2">
            <ArrowLeft className="h-4 w-4" />
            Retour aux patients
          </Button>
        </Link>
        <div className="rounded-2xl border bg-card text-card-foreground shadow-md overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
          <div className="p-6 md:p-8 flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <UserIcon className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {patient.user.lastName} {patient.user.firstName}
              </h1>
              <p className="text-muted-foreground mt-1">
                {calculatePatientAge(patient.dateOfBirth)} ans • {patient.sex === "M" ? "Homme" : patient.sex === "F" ? "Femme" : patient.sex || "Sexe non renseigné"} • Né(e) le {formatPatientDate(patient.dateOfBirth)}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          En tant que pharmacien(ne), vous n&apos;avez pas accès au dossier médical de ce patient. Les informations
          nécessaires à la délivrance des traitements sont disponibles depuis le journal des ventes en Finance & Pharmacie.
        </div>
        <CacheWriter
          cacheKey={`patient-detail:${patient.id}:pharmacist`}
          updatedAt={cachedAt}
          routeFamily="patient-detail"
          contextHint={{ isPharmacist: true }}
          data={{
            firstName: patient.user.firstName,
            lastName: patient.user.lastName,
            dateOfBirth: patient.dateOfBirth.toISOString(),
          }}
        />
      </div>
    );
  }

  return (
    <PatientDetailView
      patient={patient}
      currentUser={{ id: currentUser.id, role: currentUser.role, organizationId: currentUser.organizationId }}
      isHoldingAdmin={isHoldingAdmin}
      canWrite={canWrite}
      canPrescribe={canPrescribe}
      canOrderLab={canOrderLab}
      clinics={clinics}
      vitalSigns={vitalSigns}
      prescriptions={prescriptions}
      labOrders={labOrders}
      pregnancies={pregnancies}
      caregivers={caregivers}
      basePath={`/dashboard/clinics/${clinicId}/patients`}
      cachedAt={cachedAt}
    />
  );
}
