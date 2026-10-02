"use client";

import { useMemo } from "react";
import { CalendarAppointment, CalendarItem, getCaregiverColor, getKindColor } from "./types";
import { formatTime, isToday } from "./date-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, User, Calendar as CalendarIcon, Stethoscope, ChevronRight } from "lucide-react";
import Link from "next/link";

interface CalendarAgendaViewProps {
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
  selectedDate: Date;
}

export default function CalendarAgendaView({
  items,
  onSelectItem,
}: CalendarAgendaViewProps) {
  // Sort and group items by date
  const grouped = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());

    const groups: { date: Date; dateKey: string; items: CalendarItem[] }[] = [];

    for (const item of sorted) {
      const d = item.start;
      const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = groups.find((g) => g.dateKey === dateKey);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ date: d, dateKey, items: [item] });
      }
    }

    return groups;
  }, [items]);

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-border/70 rounded-xl bg-card">
        <CalendarIcon className="h-12 w-12 text-muted-foreground/60 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">Aucun élément trouvé</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Rien ne correspond aux critères de recherche ou de filtre sélectionnés.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ date, dateKey, items: dayItems }) => {
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
                {dayItems.length} élément{dayItems.length > 1 ? "s" : ""}
              </span>
            </div>

            {/* List of items, tous types confondus */}
            <div className="grid gap-2.5">
              {dayItems.map((item) => {
                const isAppointment = item.kind === "APPOINTMENT";
                const appointmentRaw = isAppointment ? (item.raw as CalendarAppointment) : null;
                const colorMeta = isAppointment ? getCaregiverColor(appointmentRaw!.caregiverId) : getKindColor(item.kind)!;
                const isCancelled = isAppointment && item.status === "CANCELLED";

                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className={`
                      p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/15 transition-all shadow-xs hover:shadow-sm cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4
                      ${colorMeta.border}
                      ${isCancelled ? "opacity-60" : ""}
                    `}
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isAppointment && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {appointmentRaw!.type}
                          </Badge>
                        )}
                        {item.status && (
                          <Badge
                            variant={item.status === "COMPLETED" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {item.status === "SCHEDULED"
                              ? "Planifié"
                              : item.status === "COMPLETED"
                              ? "Terminé"
                              : item.status === "CANCELLED"
                              ? "Annulé"
                              : item.status === "PENDING"
                              ? "En attente"
                              : item.status}
                          </Badge>
                        )}
                      </div>

                      <h4 className="font-semibold text-base text-foreground">
                        {item.title}
                      </h4>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        {!item.allDay && (
                          <span className="flex items-center gap-1.5 font-mono">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            {formatTime(item.start)} - {formatTime(item.end)}
                          </span>
                        )}

                        {item.subtitle && (
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-primary" />
                            <strong className="text-foreground">{item.subtitle}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {isAppointment && item.status !== "COMPLETED" && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/dashboard/appointments/${item.id}/consultation`}>
                            <Stethoscope className="h-3.5 w-3.5" />
                            Consultation
                          </Link>
                        </Button>
                      )}
                      {item.href && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={item.href}>Voir</Link>
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
