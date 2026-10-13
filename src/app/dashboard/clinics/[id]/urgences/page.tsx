import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listEmergencyBoard } from "@/actions/triage";
import EmergencyBoard from "./emergency-board";

export const metadata = {
  title: "Urgences | MedDoc",
};

interface UrgencesPageProps {
  params: Promise<{ id: string }>;
}

export default async function UrgencesPage({ params }: UrgencesPageProps) {
  const { id: clinicId } = await params;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  // listEmergencyBoard contrôle le rôle et le périmètre de la clinique.
  const res = await listEmergencyBoard(clinicId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Urgences</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tri des patients (échelle CIMU à 5 niveaux) et suivi des délais de prise en charge. Les arrivées sont enregistrées à l&apos;accueil, orientation « Urgences ».
        </p>
      </div>
      {res.success ? (
        <EmergencyBoard clinicId={clinicId} currentUserRole={activeUser.role} initialRows={res.data} canTriage={res.canTriage} />
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{res.error}</div>
      )}
    </div>
  );
}
