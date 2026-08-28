import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Stethoscope, BriefcaseMedical } from "lucide-react";
import AvailabilityToggle from "@/app/dashboard/team/availability-toggle";
import AddMemberDialog from "@/app/dashboard/team/add-member-dialog";
import UserActionsMenu from "@/app/dashboard/team/user-actions-menu";
import { Button } from "@/components/ui/button";
import { getClinics } from "@/actions/organizations";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClinicTeamPage({ params }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const isHoldingAdmin = currentUser.role === "ADMIN" && currentUser.organization?.type === "HOLDING";

  // Fetch only members in this clinic
  const [members, clinicsRes] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId: clinicId,
        role: { in: ["CAREGIVER", "COORDINATOR", "PHARMACIST", "ADMIN"] },
      },
      include: {
        caregiverProfile: {
          include: {
            _count: {
              select: { appointments: true, tasks: true }
            }
          }
        },
        coordinatorProfile: {
          include: {
            _count: {
              select: { managedPlans: true }
            }
          }
        },
        organization: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      },
      orderBy: { lastName: "asc" }
    }),
    isHoldingAdmin ? getClinics() : Promise.resolve(null),
  ]);

  let clinics: { id: string; name: string }[] = [];
  if (isHoldingAdmin && clinicsRes?.clinics) {
    clinics = clinicsRes.clinics.map(c => ({ id: c.id, name: c.name }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Équipe Médicale</h1>
          <p className="text-muted-foreground mt-1">
            Gérez le personnel, les spécialités et la disponibilité des praticiens et soignants pour cette clinique.
          </p>
        </div>
        <AddMemberDialog
          isHoldingAdmin={isHoldingAdmin}
          holdingId={currentUser.organizationId || ""}
          clinics={clinics}
          defaultOrganizationId={clinicId}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {members?.map((member: any) => {
          const isCaregiver = !!member.caregiverProfile;
          const isCoordinator = !!member.coordinatorProfile;

          let roleLabel = member.role;
          if (member.role === "MEDECIN") roleLabel = "Médecin";
          if (member.role === "CAREGIVER") roleLabel = "Infirmier(e)";
          if (member.role === "COORDINATOR") roleLabel = "Coordinateur";
          if (member.role === "ADMIN") roleLabel = "Administrateur";
          if (member.role === "PHARMACIST") roleLabel = "Pharmacien(ne)";

          const specialty = isCaregiver
            ? member.caregiverProfile.specialties?.[0] || (member.role === "MEDECIN" ? "Médecin" : "Soignant")
            : isCoordinator
              ? "Coordination Médicale"
              : "Direction";

          return (
            <Card key={member.id} className={`overflow-hidden transition-all ${!member.isActive ? "opacity-60 grayscale-[0.5]" : "hover:shadow-md"}`}>
              <CardHeader className="p-0">
                <div className="h-20 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-b border-border/50 relative" />
                <div className="px-6 flex justify-between items-end -mt-10 mb-4">
                  <Avatar className="h-20 w-20 border-4 border-background shadow-sm">
                    <AvatarImage src={member.avatarUrl || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                      {member.lastName[0]}{member.firstName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <Badge variant={member.role === "ADMIN" ? "destructive" : member.role === "COORDINATOR" ? "default" : "secondary"}>
                      {roleLabel}
                    </Badge>
                    {member.id !== currentUser.id && (
                      <UserActionsMenu
                        member={member}
                        isHoldingAdmin={isHoldingAdmin}
                        holdingId={currentUser.organizationId || ""}
                        clinics={clinics}
                        currentUserRole={currentUser.role}
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <h3 className="text-lg font-bold tracking-tight line-clamp-1">
                  {member.firstName} {member.lastName}
                  {!member.isActive && <span className="ml-2 text-xs font-normal text-destructive">(Désactivé)</span>}
                </h3>
                <p className="text-sm font-medium text-primary mt-1 flex items-center gap-1.5">
                  {isCaregiver ? <Stethoscope className="h-3.5 w-3.5" /> : <BriefcaseMedical className="h-3.5 w-3.5" />}
                  {specialty}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">
                  @ {member.organization?.name || "Siège (Holding)"}
                </p>

                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {member.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      {member.phone}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{member.email}</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border/50">
                  {isCaregiver ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Disponibilité</span>
                      {!member.isActive ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">Indisponible</Badge>
                      ) : (
                        <AvailabilityToggle
                          userId={member.id}
                          initialStatus={member.caregiverProfile.isAvailable}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Statut</span>
                      {!member.isActive ? (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                          Inactif
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          Actif
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                  {isCaregiver && (
                    <>
                      <div className="bg-muted/50 rounded-md py-2">
                        <span className="block font-bold text-base text-foreground">{member.caregiverProfile._count.appointments}</span>
                        <span className="text-muted-foreground">RDVs</span>
                      </div>
                      <div className="bg-muted/50 rounded-md py-2">
                        <span className="block font-bold text-base text-foreground">{member.caregiverProfile._count.tasks}</span>
                        <span className="text-muted-foreground">Tâches</span>
                      </div>
                    </>
                  )}
                  {isCoordinator && (
                    <div className="bg-muted/50 rounded-md py-2 col-span-2">
                      <span className="block font-bold text-base text-foreground">{member.coordinatorProfile._count.managedPlans}</span>
                      <span className="text-muted-foreground">Plans coordonnés</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
