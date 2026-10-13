import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listTodayVisits } from "@/actions/visits";
import AccueilView from "./accueil-view";

export const metadata = {
  title: "Accueil & file d'attente | MedDoc",
};

interface AccueilPageProps {
  params: Promise<{ id: string }>;
}

export default async function AccueilPage({ params }: AccueilPageProps) {
  const { id: clinicId } = await params;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  // listTodayVisits contrôle le rôle et le périmètre de la clinique.
  const [visitsRes, doctors] = await Promise.all([
    listTodayVisits(clinicId),
    prisma.user.findMany({
      where: { organizationId: clinicId, role: "MEDECIN", isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Accueil & file d&apos;attente</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enregistrez les arrivées, orientez les patients et suivez la file du jour jusqu&apos;à leur prise en charge.
        </p>
      </div>

      {visitsRes.success ? (
        <AccueilView
          clinicId={clinicId}
          currentUserId={activeUser.id}
          currentUserRole={activeUser.role}
          doctors={doctors.map((d) => ({ id: d.id, name: `Dr ${d.lastName} ${d.firstName}` }))}
          initialVisits={visitsRes.data}
          canRegister={visitsRes.canRegister}
        />
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{visitsRes.error}</div>
      )}
    </div>
  );
}
