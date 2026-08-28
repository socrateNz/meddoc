import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConsultationWorkspace from "@/app/dashboard/appointments/[appointmentId]/consultation/consultation-workspace";
import { getConsultationDraft } from "@/actions/appointments";

export const metadata = {
  title: "Première Consultation | MedDoc",
};

interface PatientConsultationPageProps {
  params: Promise<{
    id: string;
    patientId: string;
  }>;
}

export default async function PatientConsultationPage({ params }: PatientConsultationPageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;
  const patientId = resolvedParams.patientId;

  // Le brouillon de consultation ne dépend que du patientId (déjà connu via les params),
  // pas du patient chargé ci-dessous : les deux requêtes peuvent partir en parallèle.
  const [patient, draftRes] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        user: true,
        carePlans: true,
        medicalRecords: {
          orderBy: { createdAt: 'desc' }
        }
      }
    }),
    getConsultationDraft({ patientId }),
  ]);

  if (!patient) {
    notFound();
  }

  const isDischarged = (patient as any).status === "DISCHARGED" || (patient.carePlans && patient.carePlans.length > 0 && !patient.carePlans.some((cp: any) => cp.status === "ACTIVE"));
  if (isDischarged) {
    redirect(`/dashboard/clinics/${clinicId}/patients/${patientId}`);
  }

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/clinics/${clinicId}/patients/${patientId}`}>
        <Button variant="ghost" className="gap-2 pl-2">
          <ArrowLeft className="h-4 w-4" />
          Retour au patient
        </Button>
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Nouvelle Consultation</h1>
        <p className="text-muted-foreground">
          Évaluation initiale ou consultation ad-hoc pour {patient.user.firstName} {patient.user.lastName}
        </p>
      </div>

      <ConsultationWorkspace patient={patient} draft={draftRes.success ? draftRes.data : null} />
    </div>
  );
}
