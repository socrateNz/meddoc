"use client";

import { useMemo } from "react";
import { CalendarAppointment, getCaregiverColor } from "./types";
import { formatTime, getEndTime, isToday, isSameDay } from "./date-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, User, Calendar as CalendarIcon, Stethoscope, ChevronRight } from "lucide-react";
import Link from "next/link";

interface CalendarAgendaViewProps {
  appointments: CalendarAppointment[];
  onSelectAppointment: (appointment: CalendarAppointment) => void;
  selectedDate: Date;
}

export default function CalendarAgendaView({
  appointments,
  onSelectAppointment,
}: CalendarAgendaViewProps) {
  // Sort and group appointments by date
  const grouped = useMemo(() => {
    const sorted = [...appointments].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

    const groups: { date: Date; dateKey: string; apts: CalendarAppointment[] }[] = [];

    for (const apt of sorted) {
      const d = new Date(apt.scheduledAt);
      const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = groups.find((g) => g.dateKey === dateKey);
      if (existing) {
        existing.apts.push(apt);
      } else {
        groups.push({ date: d, dateKey, apts: [apt] });
      }
    }

    return groups;
  }, [appointments]);

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-border/70 rounded-xl bg-card">
        <CalendarIcon className="h-12 w-12 text-muted-foreground/60 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">Aucun rendez-vous trouvé</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Aucun rendez-vous ne correspond aux critères de recherche ou de filtre sélectionnés.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ date, dateKey, apts }) => {
        const today = isToday(date);
        const dayLabel = new Intl.DateTimeFormat("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(date);

        return (
          <div key={dateKey} className="space-y-3">
            {/* Date Group Header */}
            <div className="flex items-center gap-2 px-1">
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                  today
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {today ? "Aujourd'hui" : dayLabel}
              </span>
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-xs text-muted-foreground font-medium">
                {apts.length} rendez-vous
              </span>
            </div>

            {/* List of Appointments */}
            <div className="grid gap-2.5">
              {apts.map((apt) => {
                const colorMeta = getCaregiverColor(apt.caregiverId);
                const endTime = getEndTime(apt.scheduledAt, apt.durationMinutes);
                const isCancelled = apt.status === "CANCELLED";

                return (
                  <div
                    key={apt.id}
                    onClick={() => onSelectAppointment(apt)}
                    className={`
                      p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/15 transition-all shadow-xs hover:shadow-sm cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4
                      ${colorMeta.border}
                      ${isCancelled ? "opacity-60" : ""}
                    `}
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {apt.type}
                        </Badge>
                        <Badge
                          variant={apt.status === "COMPLETED" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {apt.status === "SCHEDULED"
                            ? "Planifié"
                            : apt.status === "COMPLETED"
                            ? "Terminé"
                            : apt.status === "CANCELLED"
                            ? "Annulé"
                            : apt.status}
                        </Badge>
                      </div>

                      <h4 className="font-semibold text-base text-foreground">
                        {apt.title}
                      </h4>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-mono">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {formatTime(apt.scheduledAt)} - {formatTime(endTime)} ({apt.durationMinutes} min)
                        </span>

                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary" />
                          <strong className="text-foreground">
                            {apt.patient.user.lastName} {apt.patient.user.firstName}
                          </strong>
                        </span>

                        {apt.caregiver && (
                          <span className="flex items-center gap-1.5">
                            <Stethoscope className="h-3.5 w-3.5 text-primary" />
                            Dr. {apt.caregiver.user.lastName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {apt.status !== "COMPLETED" && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/dashboard/appointments/${apt.id}/consultation`}>
                            <Stethoscope className="h-3.5 w-3.5" />
                            Consultation
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
