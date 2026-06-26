import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import ConsultationWorkspace from "./consultation-workspace";

export const metadata = {
  title: "Espace Consultation | MedDoc",
};

interface ConsultationPageProps {
  params: {
    appointmentId: string;
  };
}

export default async function ConsultationPage({ params }: ConsultationPageProps) {
  const resolvedParams = await params;
  const appointmentId = resolvedParams.appointmentId;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        include: {
          user: true,
          medicalRecords: {
            orderBy: { createdAt: 'desc' }
          }
        }
      },
      caregiver: {
        include: { user: true }
      }
    }
  });

  if (!appointment) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Espace Consultation</h1>
        <p className="text-muted-foreground">
          Rendez-vous pour {appointment.patient.user.firstName} {appointment.patient.user.lastName}
        </p>
      </div>

      <ConsultationWorkspace appointment={appointment} patient={appointment.patient} />
    </div>
  );
}
