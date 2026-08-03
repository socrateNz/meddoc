import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatInterface from "@/app/dashboard/ai-assistant/chat-interface";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicAIAssistantPage({ params }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  // Assistance clinique IA : autorité diagnostique (COORDINATOR/MEDECIN), ADMIN en lecture seule.
  if (!["ADMIN", "COORDINATOR", "MEDECIN"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  // Fetch only patients belonging to this specific clinic
  const patients = await prisma.patient.findMany({
    where: {
      organizationId: clinicId
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: {
      user: {
        lastName: "asc",
      },
    },
  });

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assistant Clinique IA</h1>
        <p className="text-muted-foreground">
          Posez vos questions sur les patients de cette clinique, analysez leurs traitements ou identifiez les alertes cliniques majeures.
        </p>
      </div>

      <ChatInterface patients={patients as any} />
    </div>
  );
}
