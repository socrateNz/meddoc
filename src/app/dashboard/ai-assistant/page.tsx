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

  // Filtrage par organisation : une holding voit ses cliniques, une clinique
  // ne voit que ses propres données (cf. src/app/dashboard/page.tsx:82-91).
  const orgFilter: any = {};
  if (currentUser.organization?.type === "HOLDING") {
    orgFilter.OR = [
      { organizationId: currentUser.organizationId },
      { organization: { parentId: currentUser.organizationId } }
    ];
  } else if (currentUser.organization?.type === "CLINIC") {
    orgFilter.organizationId = currentUser.organizationId;
  } else {
    orgFilter.organizationId = "NO_ACCESS";
  }

  // Fetch patients with their user profile info, scoped to the current organization
  const patients = await prisma.patient.findMany({
    where: orgFilter,
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
