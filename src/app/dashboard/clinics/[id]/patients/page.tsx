import { getClinicPatients } from "@/actions/patients";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, Phone, ArrowLeft, Building2, AlertCircle, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ClinicPatientsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN" || currentUser.organization?.type !== "HOLDING") {
    redirect("/dashboard");
  }

  const response = await getClinicPatients(params.id);
  const patients = response.success ? response.data : [];
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
            Patients
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            {clinicName || "Clinique"}
          </p>
        </div>
      </div>

      {patients?.length === 0 ? (
        <div className="text-center py-12 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-muted-foreground">Aucun patient n'est actuellement rattaché à cette clinique.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {patients?.map((patient: any) => {
            const age = new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear();
            const hasActiveIncident = patient.incidents && patient.incidents.length > 0;

            return (
              <Card key={patient.id} className="overflow-hidden hover:shadow-md transition-all border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
                <CardHeader className="p-0">
                  <div className={`h-16 ${hasActiveIncident ? 'bg-red-500/10' : 'bg-emerald-500/10'} border-b border-border/50`} />
                  <div className="px-6 flex justify-between items-end -mt-8 mb-4">
                    <Avatar className="h-16 w-16 border-4 border-background shadow-sm">
                      <AvatarImage src={patient.user.avatarUrl || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                        {patient.user.lastName[0]}{patient.user.firstName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-2">
                      <Badge variant={hasActiveIncident ? "destructive" : "secondary"} className={!hasActiveIncident ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}>
                        {hasActiveIncident ? "Incident Actif" : "Stable"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <h3 className="text-lg font-bold tracking-tight line-clamp-1">
                    {patient.user.firstName} {patient.user.lastName}
                  </h3>
                  <p className="text-sm font-medium text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {age} ans
                  </p>

                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {patient.user.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" />
                        {patient.user.phone}
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <HeartPulse className="h-3.5 w-3.5 mt-0.5" />
                      <span className="line-clamp-2">
                        {patient.pathologies?.length > 0 
                          ? patient.pathologies.join(", ") 
                          : "Aucune pathologie renseignée"}
                      </span>
                    </div>
                  </div>

                  {hasActiveIncident && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-900 dark:text-red-200">Incident en cours</p>
                        <p className="text-xs text-red-700 dark:text-red-300 mt-0.5 line-clamp-1">
                          {patient.incidents[0].title}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 pt-4 border-t border-border/50">
                    <Link href={`/dashboard/patients/${patient.id}`}>
                      <Button variant="outline" className="w-full">
                        Voir le dossier
                      </Button>
                    </Link>
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
