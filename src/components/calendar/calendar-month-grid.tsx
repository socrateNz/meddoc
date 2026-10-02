"use client";

import { useState } from "react";
import { CalendarAppointment, CalendarItem, getCaregiverColor, getKindColor } from "./types";
import { getMonthDays, isToday, isSameDay, isSameMonth, formatTime } from "./date-utils";
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
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
  onDayClick: (date: Date) => void;
  selectedDate: Date;
}

export default function CalendarMonthGrid({
  currentDate,
  items,
  onSelectItem,
  onDayClick,
  selectedDate,
}: CalendarMonthGridProps) {
  const [dayDetailsModal, setDayDetailsModal] = useState<{
    date: Date;
    items: CalendarItem[];
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

            const dayItems = items
              .filter((i) => isSameDay(i.start, day))
              .sort((a, b) => a.start.getTime() - b.start.getTime());
            const maxVisible = 3;
            const visibleItems = dayItems.slice(0, maxVisible);
            const extraCount = dayItems.length - maxVisible;

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

                  {dayItems.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">
                      {dayItems.length}
                    </span>
                  )}
                </div>

                {/* List of chips, tous types confondus */}
                <div className="space-y-1 flex-1 overflow-hidden">
                  {visibleItems.map((item) => {
                    const isAppointment = item.kind === "APPOINTMENT";
                    const colorMeta = isAppointment
                      ? getCaregiverColor((item.raw as CalendarAppointment).caregiverId)
                      : getKindColor(item.kind)!;
                    const isCancelled = isAppointment && item.status === "CANCELLED";

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item);
                        }}
                        className={`
                          group/apt px-1.5 py-0.5 rounded text-[11px] truncate flex items-center gap-1.5 cursor-pointer transition-all border
                          ${colorMeta.pill}
                          ${isCancelled ? "opacity-50 line-through" : "hover:brightness-95 hover:shadow-xs"}
                        `}
                        title={`${item.allDay ? "" : formatTime(item.start) + " - "}${item.title}${item.subtitle ? ` (${item.subtitle})` : ""}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colorMeta.dot}`} />
                        {!item.allDay && (
                          <span className="font-mono text-[10px] font-medium shrink-0 opacity-80">
                            {formatTime(item.start)}
                          </span>
                        )}
                        <span className="truncate font-medium">
                          {item.subtitle || item.title}
                        </span>
                      </div>
                    );
                  })}

                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDayDetailsModal({ date: day, items: dayItems });
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
            {dayDetailsModal?.items.map((item) => {
              const isAppointment = item.kind === "APPOINTMENT";
              const colorMeta = isAppointment
                ? getCaregiverColor((item.raw as CalendarAppointment).caregiverId)
                : getKindColor(item.kind)!;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setDayDetailsModal(null);
                    onSelectItem(item);
                  }}
                  className={`
                    p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md flex items-center justify-between gap-3
                    ${colorMeta.pill}
                  `}
                >
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{item.title}</p>
                    <div className="flex items-center gap-2 text-xs opacity-80">
                      {!item.allDay && (
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="h-3 w-3" />
                          {formatTime(item.start)}
                        </span>
                      )}
                      {item.subtitle && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 truncate">
                            <User className="h-3 w-3" />
                            {item.subtitle}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {item.status && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {item.status === "SCHEDULED" ? "Planifié" : item.status === "PENDING" ? "En attente" : item.status}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
