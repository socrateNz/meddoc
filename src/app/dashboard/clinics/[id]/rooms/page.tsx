import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { listWardsWithRooms } from "@/actions/wards";
import RoomsView from "./rooms-view";

export const metadata = {
  title: "Chambres & Lits | MedDoc",
};

interface RoomsPageProps {
  params: Promise<{ id: string }>;
}

export default async function RoomsPage({ params }: RoomsPageProps) {
  const { id: clinicId } = await params;

  // L'utilisateur courant ne dépend pas de clinicId : on le charge en parallèle des requêtes de la clinique.
  const [currentUser, wardsRes, patients] = await Promise.all([
    getCurrentUser(),
    listWardsWithRooms(clinicId),
    prisma.patient.findMany({
      where: { organizationId: clinicId, status: { not: "DISCHARGED" } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { user: { lastName: "asc" } },
    }),
  ]);

  if (!currentUser) {
    redirect("/login");
  }

  if (!wardsRes.success) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 animate-fade-up">
        <Link href={`/dashboard/clinics/${clinicId}`}>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chambres & Lits</h1>
          <p className="text-sm text-muted-foreground">Services, chambres et lits de la clinique — affectez et libérez les patients lit par lit.</p>
        </div>
      </div>

      <RoomsView clinicId={clinicId} wards={wardsRes.data || []} patients={patients} currentUserRole={currentUser.role} />
    </div>
  );
}
