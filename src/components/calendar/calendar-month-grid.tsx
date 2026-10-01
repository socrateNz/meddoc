"use client";

import { useState } from "react";
import { CalendarAppointment, getCaregiverColor } from "./types";
import { getMonthDays, isToday, isSameDay, isSameMonth, formatTime, formatDateTime } from "./date-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";

interface CalendarMonthGridProps {
  currentDate: Date;
  appointments: CalendarAppointment[];
  onSelectAppointment: (appointment: CalendarAppointment) => void;
  onDayClick: (date: Date) => void;
  selectedDate: Date;
}

export default function CalendarMonthGrid({
  currentDate,
  appointments,
  onSelectAppointment,
  onDayClick,
  selectedDate,
}: CalendarMonthGridProps) {
  const [dayDetailsModal, setDayDetailsModal] = useState<{
    date: Date;
    apts: CalendarAppointment[];
  } | null>(null);

  const monthDays = getMonthDays(currentDate);
  const weekHeaders = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

  return (
    <>
      <div className="flex flex-col flex-1 h-full min-h-[600px] border border-border/70 rounded-xl bg-card overflow-hidden shadow-xs">
        {/* Weekday Names Header */}
        <div className="grid grid-cols-7 border-b border-border/70 bg-muted/20">
          {weekHeaders.map((dayName, idx) => (
            <div
              key={idx}
              className="py-2.5 px-2 text-center text-xs font-semibold text-muted-foreground select-none uppercase tracking-wider"
            >
              <span className="hidden sm:inline">{dayName}</span>
              <span className="sm:hidden">{dayName.slice(0, 3)}</span>
            </div>
          ))}
        </div>

        {/* 6-week Days Grid */}
        <div className="grid grid-cols-7 grid-rows-6 flex-1 divide-x divide-y divide-border/60">
          {monthDays.map((day, idx) => {
            const inCurrentMonth = isSameMonth(day, currentDate);
            const currentIsToday = isToday(day);
            const isSelected = isSameDay(day, selectedDate);

            const dayApts = appointments.filter((a) => isSameDay(a.scheduledAt, day));
            const maxVisible = 3;
            const visibleApts = dayApts.slice(0, maxVisible);
            const extraCount = dayApts.length - maxVisible;

            return (
              <div
                key={idx}
                onClick={() => onDayClick(day)}
                className={`
                  relative min-h-[90px] sm:min-h-[105px] p-1.5 flex flex-col justify-start transition-colors group cursor-pointer
                  ${!inCurrentMonth ? "bg-muted/15 text-muted-foreground/50" : "bg-card hover:bg-muted/10"}
                  ${isSelected ? "ring-1 ring-inset ring-primary/40" : ""}
                `}
              >
                {/* Day Header number */}
                <div className="flex items-center justify-between mb-1 px-1">
                  <span
                    className={`
                      inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold select-none
                      ${
                        currentIsToday
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : inCurrentMonth
                          ? "text-foreground group-hover:text-primary"
                          : "text-muted-foreground/40"
                      }
                    `}
                  >
                    {day.getDate()}
                  </span>

                  {dayApts.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">
                      {dayApts.length} RDV
                    </span>
                  )}
                </div>

                {/* List of Appointment chips */}
                <div className="space-y-1 flex-1 overflow-hidden">
                  {visibleApts.map((apt) => {
                    const colorMeta = getCaregiverColor(apt.caregiverId);
                    const isCancelled = apt.status === "CANCELLED";

                    return (
                      <div
                        key={apt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAppointment(apt);
                        }}
                        className={`
                          group/apt px-1.5 py-0.5 rounded text-[11px] truncate flex items-center gap-1.5 cursor-pointer transition-all border
                          ${colorMeta.pill}
                          ${isCancelled ? "opacity-50 line-through" : "hover:brightness-95 hover:shadow-xs"}
                        `}
                        title={`${formatTime(apt.scheduledAt)} - ${apt.title} (${apt.patient.user.lastName} ${apt.patient.user.firstName})`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colorMeta.dot}`} />
                        <span className="font-mono text-[10px] font-medium shrink-0 opacity-80">
                          {formatTime(apt.scheduledAt)}
                        </span>
                        <span className="truncate font-medium">
                          {apt.patient.user.lastName}
                        </span>
                      </div>
                    );
                  })}

                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDayDetailsModal({ date: day, apts: dayApts });
                      }}
                      className="text-[10px] font-semibold text-primary hover:underline px-1 py-0.5 block w-full text-left"
                    >
                      + {extraCount} autre{extraCount > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Popover/Modal for day with many appointments */}
      <Dialog
        open={!!dayDetailsModal}
        onOpenChange={(open) => !open && setDayDetailsModal(null)}
      >
        <DialogContent className="sm:max-w-[480px] bg-card border border-border/70 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight capitalize">
              {dayDetailsModal &&
                new Intl.DateTimeFormat("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(dayDetailsModal.date)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 pt-2">
            {dayDetailsModal?.apts.map((apt) => {
              const colorMeta = getCaregiverColor(apt.caregiverId);

              return (
                <div
                  key={apt.id}
                  onClick={() => {
                    setDayDetailsModal(null);
                    onSelectAppointment(apt);
                  }}
                  className={`
                    p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md flex items-center justify-between gap-3
                    ${colorMeta.pill}
                  `}
                >
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{apt.title}</p>
                    <div className="flex items-center gap-2 text-xs opacity-80">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3" />
                        {formatTime(apt.scheduledAt)} ({apt.durationMinutes} min)
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 truncate">
                        <User className="h-3 w-3" />
                        {apt.patient.user.lastName} {apt.patient.user.firstName}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {apt.status === "SCHEDULED" ? "Planifié" : apt.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
