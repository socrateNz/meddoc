"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Clock, User as UserIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AppointmentPreview {
  id: string;
  title: string;
  status: string;
  type: string;
  scheduledAt: string;
  durationMinutes: number;
  patientName: string;
  caregiverName: string | null;
}

interface AppointmentsPreview {
  totalCount: number;
  appointments: AppointmentPreview[];
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function Loading() {
  // undefined = lecture du cache en cours, null = pas de cache disponible
  const [preview, setPreview] = useState<AppointmentsPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // clinicId vient TOUJOURS de l'URL réellement affichée, jamais d'un indice stocké — aucune
      // fuite inter-cliniques n'est structurellement possible. Ancré en fin de segment pour ne
      // jamais matcher la route imbriquée /clinics/[id]/appointments/[appointmentId]/... si elle
      // venait à exister.
      const match = window.location.pathname.match(/^\/dashboard\/clinics\/([^/]+)\/appointments\/?$/);
      const clinicId = match?.[1];
      if (!clinicId) {
        if (!cancelled) setPreview(null);
        return;
      }

      const { getCachedView } = await import("@/lib/view-cache");
      const cached = await getCachedView<AppointmentsPreview>(`appointments:${clinicId}`);
      if (!cancelled) setPreview(cached?.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pas encore de cache pour cette clinique (première visite sur cet appareil) — le titre et le
  // sous-titre de la page ne dépendent d'aucune donnée : ils s'affichent tout de suite, seules
  // les cartes de rendez-vous prennent la forme d'un squelette pendant le chargement.
  if (!preview) {
    return (
      <div className="space-y-6" aria-hidden="true">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rendez-vous</h1>
            <p className="text-muted-foreground">
              Visualisez et planifiez les rendez-vous et consultations cliniques pour cette clinique.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>

              <Skeleton className="h-5 w-3/4 mb-2" />

              <div className="space-y-3 mt-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <Skeleton className="h-3.5 w-24" />
                </div>

                <div className="pt-4 mt-4 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-sm space-y-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-2.5 w-12" />
                    </div>
                  </div>
                  <div className="text-right space-y-1.5">
                    <Skeleton className="h-2.5 w-14 ml-auto" />
                    <Skeleton className="h-3.5 w-16 ml-auto" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { totalCount, appointments } = preview;
  const shown = appointments.slice(0, 6);

  return (
    <div className="space-y-6 pointer-events-none select-none" aria-hidden="true" inert>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rendez-vous</h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Mise à jour…
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {shown.map((apt) => (
          <div key={apt.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
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
                    <p className="font-medium">{apt.patientName}</p>
                    <p className="text-xs text-muted-foreground">Patient</p>
                  </div>
                </div>
                {apt.caregiverName ? (
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted-foreground">Soignant</p>
                    <p className="text-sm font-semibold">{apt.caregiverName}</p>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">Non assigné</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {totalCount > shown.length && (
          <div className="col-span-full text-center text-xs text-muted-foreground">
            +{totalCount - shown.length} autres
          </div>
        )}
      </div>
    </div>
  );
}
