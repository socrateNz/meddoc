"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMonthDays, isSameDay, isToday, isSameMonth } from "./date-utils";
import { CalendarAppointment } from "./types";

interface MiniCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  appointments: CalendarAppointment[];
}

export default function MiniCalendar({
  selectedDate,
  onSelectDate,
  appointments,
}: MiniCalendarProps) {
  // Current view month in the mini calendar (can navigate separately from selectedDate)
  const [viewDate, setViewDate] = useState<Date>(new Date(selectedDate));

  const handlePrevMonth = () => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    setViewDate(next);
  };

  const handleNextMonth = () => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    setViewDate(next);
  };

  const monthDays = getMonthDays(viewDate);

  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(viewDate);

  // Capitalize first letter of month
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const weekHeaders = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <div className="w-full select-none">
      {/* Month Navigator */}
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-xs font-semibold tracking-tight text-foreground">
          {capitalizedMonth}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevMonth}
            className="h-6 w-6 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Mois précédent"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextMonth}
            className="h-6 w-6 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Mois suivant"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Days of week header */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {weekHeaders.map((day, idx) => (
          <span
            key={idx}
            className="text-[10px] font-semibold text-muted-foreground uppercase"
          >
            {day}
          </span>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {monthDays.map((day, idx) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentToday = isToday(day);
          const inCurrentMonth = isSameMonth(day, viewDate);

          const hasApt = appointments.some((a) => isSameDay(a.scheduledAt, day));

          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onSelectDate(day);
                if (!inCurrentMonth) {
                  setViewDate(new Date(day));
                }
              }}
              className={`
                relative h-7 w-7 mx-auto rounded-full flex flex-col items-center justify-center text-xs transition-colors
                ${!inCurrentMonth ? "text-muted-foreground/40 hover:text-muted-foreground" : "text-foreground"}
                ${isSelected ? "bg-primary text-primary-foreground font-bold shadow-xs hover:bg-primary/90" : "hover:bg-accent"}
                ${isCurrentToday && !isSelected ? "ring-1.5 ring-primary font-bold text-primary" : ""}
              `}
            >
              <span>{day.getDate()}</span>
              {hasApt && !isSelected && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary/70" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
