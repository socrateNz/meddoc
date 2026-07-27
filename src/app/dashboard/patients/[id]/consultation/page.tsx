import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import ConsultationWorkspace from "@/app/dashboard/appointments/[appointmentId]/consultation/consultation-workspace";

export const metadata = {
  title: "Première Consultation | MedDoc",
};

interface PatientConsultationPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PatientConsultationPage({ params }: PatientConsultationPageProps) {
  const resolvedParams = await params;
  const patientId = resolvedParams.id;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      user: true,
      carePlans: true,
      medicalRecords: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!patient) {
    notFound();
  }

  const isDischarged = (patient as any).status === "DISCHARGED" || (patient.carePlans && patient.carePlans.length > 0 && !patient.carePlans.some((cp: any) => cp.status === "ACTIVE"));
  if (isDischarged) {
    redirect(`/dashboard/patients/${patientId}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Nouvelle Consultation</h1>
        <p className="text-muted-foreground">
          Évaluation initiale ou consultation ad-hoc pour {patient.user.firstName} {patient.user.lastName}
        </p>
      </div>

      <ConsultationWorkspace patient={patient} />
    </div>
  );
}
