import { getClinicTeam } from "@/actions/team";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Stethoscope, BriefcaseMedical, ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AvailabilityToggle from "@/app/dashboard/team/availability-toggle";

export default async function ClinicTeamPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN" || currentUser.organization?.type !== "HOLDING") {
    redirect("/dashboard");
  }

  const response = await getClinicTeam(params.id);
  const members = response.success ? response.data : [];
  const clinicName = response.clinicName;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/clinics/${params.id}`}>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            Équipe Médicale
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            {clinicName || "Clinique"}
          </p>
        </div>
      </div>

      {members?.length === 0 ? (
        <div className="text-center py-12 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-muted-foreground">Aucun personnel n'est actuellement rattaché à cette clinique.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members?.map((member: any) => {
            const isCaregiver = !!member.caregiverProfile;
            const isCoordinator = !!member.coordinatorProfile;

            let roleLabel = member.role;
            if (member.role === "CAREGIVER") roleLabel = "Soignant";
            if (member.role === "COORDINATOR") roleLabel = "Coordinateur";
            if (member.role === "ADMIN") roleLabel = "Administrateur Local";

            const specialty = isCaregiver
              ? member.caregiverProfile.specialties?.[0] || "Soignant"
              : isCoordinator
                ? "Coordination Médicale"
                : "Direction";

            return (
              <Card key={member.id} className="overflow-hidden hover:shadow-md transition-all border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
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
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <h3 className="text-lg font-bold tracking-tight line-clamp-1">
                    {member.firstName} {member.lastName}
                  </h3>
                  <p className="text-sm font-medium text-primary mt-1 flex items-center gap-1.5">
                    {isCaregiver ? <Stethoscope className="h-3.5 w-3.5" /> : <BriefcaseMedical className="h-3.5 w-3.5" />}
                    {specialty}
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
                        <AvailabilityToggle
                          userId={member.id}
                          initialStatus={member.caregiverProfile.isAvailable}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Statut</span>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          Actif
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
