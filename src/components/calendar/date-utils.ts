import { CalendarAppointment } from "./types";

export function startOfWeek(date: Date, mondayFirst = true): Date {
  const d = new Date(date);
  const day = d.getDay();
  // In JS getDay(): 0 is Sunday, 1 is Monday
  const diff = mondayFirst ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date, mondayFirst = true): Date {
  const start = startOfWeek(date, mondayFirst);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getDaysInWeek(currentDate: Date, workWeekOnly = false): Date[] {
  const start = startOfWeek(currentDate, true);
  const days: Date[] = [];
  const count = workWeekOnly ? 5 : 7;
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function getMonthDays(currentDate: Date): Date[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const startDay = startOfWeek(firstDayOfMonth, true);

  const days: Date[] = [];
  // 6 weeks * 7 days = 42 days grid for full consistent calendar
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    days.push(d);
  }
  return days;
}

export function isSameDay(d1: Date | string, d2: Date | string): boolean {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export function isToday(d: Date | string): boolean {
  return isSameDay(new Date(d), new Date());
}

export function isSameMonth(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDayHeader(date: Date): { dayName: string; dayNumber: number } {
  const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date).toUpperCase();
  const dayNumber = date.getDate();
  return { dayName, dayNumber };
}

export function formatTime(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function getEndTime(scheduledAt: Date | string, durationMinutes: number): Date {
  const start = new Date(scheduledAt);
  return new Date(start.getTime() + durationMinutes * 60 * 1000);
}

export interface PositionedAppointment {
  appointment: CalendarAppointment;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
}

/**
 * Calculates accurate positions and side-by-side columns for overlapping appointments
 * in a time grid (Outlook / Google Calendar layout).
 */
export function layoutAppointmentsForDay(
  appointments: CalendarAppointment[],
  targetDate: Date,
  startHour = 7,
  endHour = 20,
  hourHeight = 64
): PositionedAppointment[] {
  // 1. Filter appointments for this day
  const dayApts = appointments
    .filter((a) => isSameDay(a.scheduledAt, targetDate))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  if (dayApts.length === 0) return [];

  // Total grid minutes
  const gridStartMinutes = startHour * 60;
  const gridEndMinutes = endHour * 60;
  const totalGridMinutes = gridEndMinutes - gridStartMinutes;

  interface EventBounds {
    apt: CalendarAppointment;
    startMin: number;
    endMin: number;
    top: number;
    height: number;
    col: number;
    totalCols: number;
  }

  const events: EventBounds[] = dayApts.map((apt) => {
    const d = new Date(apt.scheduledAt);
    const startMin = d.getHours() * 60 + d.getMinutes();
    const endMin = Math.min(startMin + (apt.durationMinutes || 60), gridEndMinutes);

    // Clamp within visible grid
    const clampedStart = Math.max(startMin, gridStartMinutes);
    const clampedEnd = Math.max(endMin, clampedStart + 15);

    const top = ((clampedStart - gridStartMinutes) / 60) * hourHeight;
    const height = Math.max(((clampedEnd - clampedStart) / 60) * hourHeight, 26);

    return {
      apt,
      startMin,
      endMin,
      top,
      height,
      col: 0,
      totalCols: 1,
    };
  });

  // Cluster overlapping events together
  const clusters: EventBounds[][] = [];
  let currentCluster: EventBounds[] = [];
  let clusterEnd = -1;

  for (const ev of events) {
    if (currentCluster.length === 0) {
      currentCluster.push(ev);
      clusterEnd = ev.endMin;
    } else {
      if (ev.startMin < clusterEnd) {
        currentCluster.push(ev);
        clusterEnd = Math.max(clusterEnd, ev.endMin);
      } else {
        clusters.push(currentCluster);
        currentCluster = [ev];
        clusterEnd = ev.endMin;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // For each cluster, assign columns (greedy algorithm)
  const result: PositionedAppointment[] = [];

  for (const cluster of clusters) {
    const columns: EventBounds[][] = [];

    for (const ev of cluster) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (ev.startMin >= lastInCol.endMin) {
          columns[c].push(ev);
          ev.col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev.col = columns.length;
        columns.push([ev]);
      }
    }

    const totalCols = columns.length;
    for (const ev of cluster) {
      const widthPercent = 100 / totalCols;
      const leftPercent = ev.col * widthPercent;

      result.push({
        appointment: ev.apt,
        top: ev.top,
        height: ev.height,
        leftPercent,
        widthPercent,
      });
    }
  }

  return result;
}
