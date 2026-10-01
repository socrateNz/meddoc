"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  Briefcase,
  ListFilter,
  X,
  Stethoscope,
  Filter,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarAppointment,
  CalendarViewMode,
  AppointmentCaregiver,
  AppointmentPatient,
  getCaregiverColor,
} from "./types";
import {
  getDaysInWeek,
  startOfWeek,
  endOfWeek,
  formatMonthYear,
  isSameDay,
} from "./date-utils";
import MiniCalendar from "./mini-calendar";
import CalendarTimeGrid from "./calendar-time-grid";
import CalendarMonthGrid from "./calendar-month-grid";
import CalendarAgendaView from "./calendar-agenda-view";
import NewAppointmentModal from "./new-appointment-modal";
import AppointmentDetailDialog from "./appointment-detail-dialog";

interface OutlookCalendarProps {
  initialAppointments: CalendarAppointment[];
  patients: AppointmentPatient[];
  caregivers: AppointmentCaregiver[];
}

export default function OutlookCalendar({
  initialAppointments,
  patients,
  caregivers,
}: OutlookCalendarProps) {
  const router = useRouter();

  // Navigation & View state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");

  // Filtering & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCaregiverIds, setSelectedCaregiverIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Modals state
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newModalPrefill, setNewModalPrefill] = useState<{
    date?: string;
    time?: string;
  }>({});
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);

  // Date Navigation handlers
  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === "day") {
      next.setDate(next.getDate() - 1);
      setSelectedDate(next);
    } else if (viewMode === "workWeek" || viewMode === "week") {
      next.setDate(next.getDate() - 7);
    } else if (viewMode === "month") {
      next.setMonth(next.getMonth() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === "day") {
      next.setDate(next.getDate() + 1);
      setSelectedDate(next);
    } else if (viewMode === "workWeek" || viewMode === "week") {
      next.setDate(next.getDate() + 7);
    } else if (viewMode === "month") {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentDate(next);
  };

  // Header Title generation (Outlook style)
  const headerTitle = useMemo(() => {
    if (viewMode === "day") {
      return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(selectedDate);
    }
    if (viewMode === "month") {
      return formatMonthYear(currentDate);
    }
    if (viewMode === "workWeek") {
      const days = getDaysInWeek(currentDate, true);
      const start = days[0];
      const end = days[days.length - 1];
      const startFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(start);
      const endFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(end);
      return `${startFmt} - ${endFmt}`;
    }
    if (viewMode === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      const startFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(start);
      const endFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(end);
      return `${startFmt} - ${endFmt}`;
    }
    return formatMonthYear(currentDate);
  }, [viewMode, currentDate, selectedDate]);

  // Caregiver filtering toggle
  const toggleCaregiver = (id: string) => {
    setSelectedCaregiverIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAllCaregivers = () => {
    if (selectedCaregiverIds.length === caregivers.length) {
      setSelectedCaregiverIds([]);
    } else {
      setSelectedCaregiverIds(caregivers.map((c) => c.id));
    }
  };

  // Status filtering toggle
  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return initialAppointments.filter((apt) => {
      // Search text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const patientName = `${apt.patient.user.lastName} ${apt.patient.user.firstName}`.toLowerCase();
        const caregiverName = apt.caregiver ? `${apt.caregiver.user.lastName} ${apt.caregiver.user.firstName}`.toLowerCase() : "";
        const title = (apt.title || "").toLowerCase();
        const type = (apt.type || "").toLowerCase();

        if (!patientName.includes(q) && !caregiverName.includes(q) && !title.includes(q) && !type.includes(q)) {
          return false;
        }
      }

      // Caregiver filter
      if (selectedCaregiverIds.length > 0) {
        if (!apt.caregiverId || !selectedCaregiverIds.includes(apt.caregiverId)) {
          return false;
        }
      }

      // Status filter
      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(apt.status)) {
          return false;
        }
      }

      // Type filter
      if (selectedType && apt.type !== selectedType) {
        return false;
      }

      return true;
    });
  }, [initialAppointments, searchQuery, selectedCaregiverIds, selectedStatuses, selectedType]);

  // Handle Slot Click -> Pre-fill modal
  const handleSlotClick = (date: Date, hour: number) => {
    const dateStr = date.toISOString().split("T")[0];
    const timeStr = `${String(hour).padStart(2, "0")}:00`;
    setNewModalPrefill({ date: dateStr, time: timeStr });
    setNewModalOpen(true);
  };

  // Handle Day Click in Month Grid -> Pre-fill modal
  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    const dateStr = date.toISOString().split("T")[0];
    setNewModalPrefill({ date: dateStr, time: "09:00" });
    setNewModalOpen(true);
  };

  // Select day from Mini Calendar
  const handleSelectMiniDate = (date: Date) => {
    setSelectedDate(date);
    setCurrentDate(date);
  };

  const handleRefresh = () => {
    router.refresh();
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedCaregiverIds.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedType !== "";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCaregiverIds([]);
    setSelectedStatuses([]);
    setSelectedType("");
  };

  // Unique types from all appointments
  const allTypes = useMemo(() => {
    const typesSet = new Set<string>();
    initialAppointments.forEach((a) => {
      if (a.type) typesSet.add(a.type);
    });
    return Array.from(typesSet);
  }, [initialAppointments]);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Outlook Top Command Bar / Ribbon */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border/70 shadow-xs">
        {/* Navigation & Period Title */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Aujourd'hui */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="font-semibold text-xs h-9 px-3 hover:bg-muted/80"
          >
            Aujourd'hui
          </Button>

          {/* Chevrons */}
          <div className="flex items-center rounded-lg border border-border/70 p-0.5 bg-muted/20">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              className="h-7 w-7 rounded-md"
              title="Période précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              className="h-7 w-7 rounded-md"
              title="Période suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Current Period Label */}
          <span className="text-base sm:text-lg font-bold text-foreground capitalize tracking-tight select-none pl-1">
            {headerTitle}
          </span>
        </div>

        {/* Center / Search bar */}
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher patient, praticien, motif..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 h-9 text-xs bg-muted/20 border-border/70 focus-visible:bg-background"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right Section: View Switcher & Action */}
        <div className="flex items-center gap-2 self-end lg:self-center flex-wrap">
          {/* Mobile Filter Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden h-9 px-2.5 gap-1.5 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtres
            {hasActiveFilters && (
              <span className="h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>

          {/* Outlook View Switcher Pills */}
          <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "day"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Jour
            </button>
            <button
              type="button"
              onClick={() => setViewMode("workWeek")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "workWeek"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sem. travail
            </button>
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "week"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Semaine
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "month"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mois
            </button>
            <button
              type="button"
              onClick={() => setViewMode("agenda")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "agenda"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Planning
            </button>
          </div>

          {/* + Nouveau rendez-vous Button */}
          <Button
            onClick={() => {
              setNewModalPrefill({});
              setNewModalOpen(true);
            }}
            className="h-9 gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouveau rendez-vous</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        </div>
      </div>

      {/* 2. Main Content Split: Left Outlook Sidebar + Right Grid */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        {/* Left Sidebar (Outlook Navigation & Filters Pane) */}
        <aside
          className={`
            w-full lg:w-72 shrink-0 space-y-5 rounded-2xl bg-card border border-border/70 p-4 shadow-xs
            ${sidebarOpen ? "block" : "hidden lg:block"}
          `}
        >
          {/* Quick Plan Button */}
          <Button
            onClick={() => {
              setNewModalPrefill({});
              setNewModalOpen(true);
            }}
            variant="default"
            className="w-full gap-2 font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" />
            Nouveau rendez-vous
          </Button>

          {/* Outlook Mini Calendar */}
          <div className="pt-2 border-t border-border/60">
            <MiniCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectMiniDate}
              appointments={initialAppointments}
            />
          </div>

          {/* Praticiens / Soignants Checkboxes (Outlook Calendars style) */}
          <div className="space-y-2.5 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Praticiens & Soignants
              </span>
              <button
                type="button"
                onClick={toggleAllCaregivers}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                {selectedCaregiverIds.length === caregivers.length ? "Tout désélectionner" : "Tous"}
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {caregivers.map((c, idx) => {
                const colorMeta = getCaregiverColor(c.id, idx);
                const isChecked = selectedCaregiverIds.includes(c.id);

                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer select-none text-xs transition-colors"
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleCaregiver(c.id)}
                      className="rounded"
                    />
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${colorMeta.dot}`} />
                    <span className="truncate text-foreground font-medium flex-1">
                      Dr. {c.user.lastName} {c.user.firstName}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Statut filter */}
          <div className="space-y-2 pt-3 border-t border-border/60">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Statuts
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                { id: "SCHEDULED", label: "Planifié" },
                { id: "IN_PROGRESS", label: "En cours" },
                { id: "COMPLETED", label: "Terminé" },
                { id: "CANCELLED", label: "Annulé" },
              ].map((st) => {
                const active = selectedStatuses.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => toggleStatus(st.id)}
                    className={`
                      px-2.5 py-1.5 rounded-lg border text-left font-medium transition-all flex items-center justify-between
                      ${
                        active
                          ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                          : "border-border/60 text-muted-foreground hover:bg-muted/30"
                      }
                    `}
                  >
                    <span>{st.label}</span>
                    {active && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type filter if types available */}
          {allTypes.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border/60">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Type d'intervention
              </span>
              <div className="flex flex-wrap gap-1">
                {allTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedType(selectedType === t ? "" : t)}
                    className={`
                      text-[11px] px-2 py-0.5 rounded-md border transition-all
                      ${
                        selectedType === t
                          ? "bg-primary text-primary-foreground border-primary font-medium"
                          : "bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reset button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="w-full text-xs text-muted-foreground hover:text-foreground pt-2"
            >
              Réinitialiser tous les filtres
            </Button>
          )}
        </aside>

        {/* Right Main Calendar View Area */}
        <main className="flex-1 w-full min-w-0">
          {viewMode === "day" && (
            <CalendarTimeGrid
              days={[selectedDate]}
              appointments={filteredAppointments}
              onSelectAppointment={(apt) => setSelectedAppointment(apt)}
              onSlotClick={handleSlotClick}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}

          {viewMode === "workWeek" && (
            <CalendarTimeGrid
              days={getDaysInWeek(currentDate, true)}
              appointments={filteredAppointments}
              onSelectAppointment={(apt) => setSelectedAppointment(apt)}
              onSlotClick={handleSlotClick}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}

          {viewMode === "week" && (
            <CalendarTimeGrid
              days={getDaysInWeek(currentDate, false)}
              appointments={filteredAppointments}
              onSelectAppointment={(apt) => setSelectedAppointment(apt)}
              onSlotClick={handleSlotClick}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}

          {viewMode === "month" && (
            <CalendarMonthGrid
              currentDate={currentDate}
              appointments={filteredAppointments}
              onSelectAppointment={(apt) => setSelectedAppointment(apt)}
              onDayClick={handleDayClick}
              selectedDate={selectedDate}
            />
          )}

          {viewMode === "agenda" && (
            <CalendarAgendaView
              appointments={filteredAppointments}
              onSelectAppointment={(apt) => setSelectedAppointment(apt)}
              selectedDate={selectedDate}
            />
          )}
        </main>
      </div>

      {/* 3. New Appointment Dialog */}
      <NewAppointmentModal
        open={newModalOpen}
        onOpenChange={setNewModalOpen}
        patients={patients}
        caregivers={caregivers}
        defaultDate={newModalPrefill.date}
        defaultTime={newModalPrefill.time}
        onSuccess={handleRefresh}
      />

      {/* 4. Appointment Detail Modal */}
      <AppointmentDetailDialog
        appointment={selectedAppointment}
        open={!!selectedAppointment}
        onOpenChange={(open) => !open && setSelectedAppointment(null)}
        caregivers={caregivers}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
