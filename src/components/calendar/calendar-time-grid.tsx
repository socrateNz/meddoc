"use client";

import { useMemo, useEffect, useRef } from "react";
import { CalendarAppointment, CalendarItem, getCaregiverColor, getKindColor } from "./types";
import {
  formatDayHeader,
  formatTime,
  isToday,
  isSameDay,
  layoutItemsForDay,
} from "./date-utils";
import { Clock, User } from "lucide-react";

interface CalendarTimeGridProps {
  days: Date[];
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
  onSlotClick: (date: Date, hour: number) => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export default function CalendarTimeGrid({
  days,
  items,
  onSelectItem,
  onSlotClick,
  selectedDate,
  onSelectDate,
}: CalendarTimeGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const START_HOUR = 7;
  const END_HOUR = 21;
  const ROW_HEIGHT = 64; // px per hour

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      list.push(h);
    }
    return list;
  }, [START_HOUR, END_HOUR]);

  // Current time position (minutes since START_HOUR * 60)
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentMinutesOffset = nowMinutes - START_HOUR * 60;
  const showCurrentTimeLine =
    currentMinutesOffset >= 0 && currentMinutesOffset <= (END_HOUR - START_HOUR) * 60;
  const currentTimeTop = (currentMinutesOffset / 60) * ROW_HEIGHT;

  // Auto scroll to 8:00 AM on initial load
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 1 * ROW_HEIGHT; // Scroll down slightly
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 h-full min-h-[500px] border border-border/70 rounded-xl bg-card overflow-hidden shadow-xs">
      {/* Sticky Header */}
      <div className="flex border-b border-border/70 bg-card/95 backdrop-blur-xs sticky top-0 z-20">
        {/* Time gutter corner */}
        <div className="w-16 sm:w-20 border-r border-border/70 py-3 px-2 text-center text-xs font-semibold text-muted-foreground select-none">
          Heure
        </div>

        {/* Day columns headers */}
        <div className="flex flex-1 divide-x divide-border/70">
          {days.map((day, idx) => {
            const { dayName, dayNumber } = formatDayHeader(day);
            const currentIsToday = isToday(day);
            const isSelected = isSameDay(day, selectedDate);

            return (
              <div
                key={idx}
                onClick={() => onSelectDate(day)}
                className={`flex-1 py-2.5 px-1 sm:px-2 flex flex-col items-center justify-center cursor-pointer transition-colors hover:bg-muted/40 ${
                  isSelected ? "bg-muted/20" : ""
                }`}
              >
                <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground tracking-wide">
                  {dayName}
                </span>
                <span
                  className={`mt-1 flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full text-sm font-bold transition-all ${
                    currentIsToday
                      ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                      : isSelected
                      ? "ring-1.5 ring-primary font-bold text-foreground"
                      : "text-foreground"
                  }`}
                >
                  {dayNumber}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bande "Toute la journée" : échéances ponctuelles (CONTRACT_DEADLINE, STOCK_EXPIRY) et
          événements libres marqués allDay — pas de vraie durée, ne jamais les forcer dans la
          grille horaire ci-dessous. */}
      {items.some((i) => i.allDay) && (
        <div className="flex border-b border-border/70 bg-muted/10">
          <div className="w-16 sm:w-20 border-r border-border/70 py-1.5 px-2 text-center text-[10px] font-semibold text-muted-foreground select-none shrink-0">
            Journée
          </div>
          <div className="flex flex-1 divide-x divide-border/70">
            {days.map((day, idx) => {
              const dayAllDayItems = items.filter((i) => i.allDay && isSameDay(i.start, day));
              return (
                <div key={idx} className="flex-1 p-1 space-y-0.5 min-w-[100px]">
                  {dayAllDayItems.map((item) => {
                    const colorMeta = getKindColor(item.kind)!;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => onSelectItem(item)}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate border ${colorMeta.pill}`}
                        title={item.title}
                      >
                        {item.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scrollable Time Grid */}
      <div ref={containerRef} className="flex-1 overflow-y-auto relative flex">
        {/* Time labels axis */}
        <div className="w-16 sm:w-20 border-r border-border/70 flex flex-col shrink-0 select-none bg-muted/10">
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: `${ROW_HEIGHT}px` }}
              className="relative pr-2 text-right text-[11px] sm:text-xs font-medium text-muted-foreground"
            >
              <span className="-top-2.5 relative block">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day Columns Grid */}
        <div className="flex flex-1 divide-x divide-border/70 relative">
          {days.map((day, dayIndex) => {
            const currentIsToday = isToday(day);
            const dayPositionedItems = layoutItemsForDay(
              items,
              day,
              START_HOUR,
              END_HOUR,
              ROW_HEIGHT
            );

            return (
              <div key={dayIndex} className="flex-1 relative min-w-[100px] select-none">
                {/* Horizontal hour lines and half-hour dashed lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    onClick={() => onSlotClick(day, hour)}
                    className="border-b border-border/50 relative group cursor-pointer hover:bg-primary/5 transition-colors"
                    title={`Cliquer pour planifier à ${hour}:00`}
                  >
                    {/* Half hour guide line */}
                    <div className="absolute inset-x-0 top-1/2 border-b border-border/25 border-dashed pointer-events-none" />

                    {/* Subtle hover slot hint */}
                    <span className="opacity-0 group-hover:opacity-60 text-[10px] text-muted-foreground font-medium pl-2 pt-1 block pointer-events-none">
                      + {hour}:00
                    </span>
                  </div>
                ))}

                {/* Current Time Indicator Red/Blue Line */}
                {currentIsToday && showCurrentTimeLine && (
                  <div
                    style={{ top: `${currentTimeTop}px` }}
                    className="absolute inset-x-0 z-10 flex items-center pointer-events-none"
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm -ml-1.5" />
                    <div className="flex-1 border-t-2 border-red-500 shadow-xs" />
                  </div>
                )}

                {/* Render Items */}
                {dayPositionedItems.map(({ item, top, height, leftPercent, widthPercent }) => {
                  const isAppointment = item.kind === "APPOINTMENT";
                  const appointmentRaw = isAppointment ? (item.raw as CalendarAppointment) : null;
                  const colorMeta = isAppointment ? getCaregiverColor(appointmentRaw!.caregiverId) : getKindColor(item.kind)!;
                  const isCancelled = isAppointment && item.status === "CANCELLED";
                  const isCompleted = isAppointment && item.status === "COMPLETED";

                  return (
                    <div
                      key={item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item);
                      }}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `${leftPercent}%`,
                        width: `calc(${widthPercent}% - 3px)`,
                      }}
                      className={`
                        absolute z-10 mx-0.5 rounded-lg border-l-4 p-2 cursor-pointer shadow-xs transition-all overflow-hidden flex flex-col justify-between
                        ${colorMeta.border}
                        ${
                          isCancelled
                            ? "bg-muted/60 opacity-60 text-muted-foreground line-through"
                            : isCompleted
                            ? "bg-emerald-500/10 hover:bg-emerald-500/15 border-l-emerald-600 text-emerald-950 dark:text-emerald-200"
                            : `${colorMeta.bg}`
                        }
                        hover:z-30 hover:shadow-md hover:scale-[1.01] duration-150
                      `}
                    >
                      <div className="min-w-0">
                        {/* Title & Status */}
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-semibold text-xs truncate leading-tight">
                            {item.title}
                          </p>
                          {isCompleted && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 shrink-0 font-medium">
                              Terminé
                            </span>
                          )}
                        </div>

                        {/* Sous-titre (patient / soignant selon le type) */}
                        {item.subtitle && (
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] font-medium opacity-90 truncate">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{item.subtitle}</span>
                          </div>
                        )}
                      </div>

                      {/* Time footer if height permits */}
                      {height >= 44 && (
                        <div className="flex items-center justify-between text-[10px] opacity-80 mt-1 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatTime(item.start)} - {formatTime(item.end)}
                          </span>
                          {isAppointment && appointmentRaw!.caregiver && (
                            <span className="truncate max-w-[80px] font-sans font-medium text-right">
                              Dr. {appointmentRaw!.caregiver.user.lastName}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
