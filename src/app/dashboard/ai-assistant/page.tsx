import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatInterface from "./chat-interface";

export default async function AIAssistantPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  // Deny access to patients and families
  if (!["ADMIN", "COORDINATOR", "CAREGIVER"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  // Fetch all patients with their user profile info
  const patients = await prisma.patient.findMany({
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
          Posez vos questions sur les patients, analysez leurs traitements ou identifiez les alertes cliniques majeures.
        </p>
      </div>

      <ChatInterface patients={patients as any} />
    </div>
  );
}
