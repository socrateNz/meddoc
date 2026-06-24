import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Clock, User as UserIcon } from "lucide-react";
import NewAppointmentDialog from "./new-appointment-dialog";
import { Prisma } from "@prisma/client";

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: {
    patient: {
      include: { user: true }
    };
    caregiver: {
      include: { user: true }
    };
  };
}>;

export default async function AppointmentsPage() {
  const appointments = await prisma.appointment.findMany({
    include: {
      patient: {
        include: { user: true }
      },
      caregiver: {
        include: { user: true }
      }
    },
    orderBy: {
      scheduledAt: "asc"
    }
  });

  const patients = await prisma.patient.findMany({
    include: { user: true },
    orderBy: {
      user: {
        lastName: "asc"
      }
    }
  });

  const caregivers = await prisma.caregiver.findMany({
    include: { user: true },
    orderBy: {
      user: {
        lastName: "asc"
      }
    }
  });

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(date));
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rendez-vous</h1>
          <p className="text-muted-foreground">
            Visualisez et planifiez les interventions à domicile.
          </p>
        </div>
        <NewAppointmentDialog patients={patients} caregivers={caregivers} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {appointments.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border rounded-xl bg-card border-dashed">
            <CalendarIcon className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Aucun rendez-vous</h3>
            <p className="text-sm text-muted-foreground mt-1">Vous n&apos;avez aucun rendez-vous planifié.</p>
            <div className="mt-4">
              <NewAppointmentDialog patients={patients} caregivers={caregivers} />
            </div>
          </div>
        ) : (
          appointments.map((apt: AppointmentWithRelations) => (
            <div key={apt.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between mb-4">
                <Badge variant={apt.status === "SCHEDULED" ? "default" : "secondary"}>
                  {apt.status === "SCHEDULED" ? "Planifié" : apt.status}
                </Badge>
                <Badge variant="outline">{apt.type}</Badge>
              </div>

              <h3 className="font-semibold text-lg mb-2">{apt.title}</h3>

              <div className="space-y-3 mt-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <span className="capitalize">{formatDate(apt.scheduledAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>{formatTime(apt.scheduledAt)} - {apt.durationMinutes} min</span>
                </div>

                <div className="pt-4 mt-4 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{apt.patient.user.lastName} {apt.patient.user.firstName}</p>
                      <p className="text-xs text-muted-foreground">Patient</p>
                    </div>
                  </div>
                  {apt.caregiver ? (
                    <div className="text-right">
                      <p className="text-xs font-medium text-muted-foreground">Soignant</p>
                      <p className="text-sm font-semibold">{apt.caregiver.user.lastName}</p>
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">Non assigné</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
