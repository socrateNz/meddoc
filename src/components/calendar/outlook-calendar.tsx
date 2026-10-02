"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
  Check,
  Briefcase,
  CalendarClock,
  ClipboardList,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  CalendarAppointment,
  CalendarItem,
  CalendarItemKind,
  CalendarViewMode,
  AppointmentCaregiver,
  AppointmentPatient,
  StaffUser,
  getCaregiverColor,
} from "./types";
import {
  getDaysInWeek,
  startOfWeek,
  endOfWeek,
  formatMonthYear,
} from "./date-utils";
import MiniCalendar from "./mini-calendar";
import CalendarTimeGrid from "./calendar-time-grid";
import CalendarMonthGrid from "./calendar-month-grid";
import CalendarAgendaView from "./calendar-agenda-view";
import NewAppointmentModal from "./new-appointment-modal";
import AppointmentDetailDialog from "./appointment-detail-dialog";
import NewShiftDialog, { ShiftRecord } from "./new-shift-dialog";
import NewEventDialog, { CalendarEventRecord } from "./new-event-dialog";

interface OutlookCalendarProps {
  initialItems: CalendarItem[];
  patients: AppointmentPatient[];
  caregivers: AppointmentCaregiver[];
  staffUsers: StaffUser[];
}

// Un groupe par case à cocher plutôt qu'un kind par case : "Échéances" couvre à la fois
// CONTRACT_DEADLINE et STOCK_EXPIRY (deux lectures en lecture seule, jamais créées depuis ce
// calendrier) sous un seul intitulé, cf. plan « Calendrier unifié ».
const KIND_FILTER_GROUPS: { label: string; kinds: CalendarItemKind[]; icon: typeof Briefcase }[] = [
  { label: "Rendez-vous", kinds: ["APPOINTMENT"], icon: ClipboardList },
  { label: "Gardes", kinds: ["SHIFT"], icon: Briefcase },
  { label: "Tâches de soins", kinds: ["CARE_TASK"], icon: ClipboardList },
  { label: "Échéances", kinds: ["CONTRACT_DEADLINE", "STOCK_EXPIRY"], icon: FileWarning },
  { label: "Événements", kinds: ["EVENT"], icon: CalendarClock },
];

// Les vues Jour/Semaine/Mois affichent des colonnes à largeur minimale fixe (cf.
// calendar-time-grid.tsx) qui débordent sur un écran de téléphone étroit — la vue Agenda, en
// cartes empilées, n'a aucune largeur fixe et reste toujours lisible. Plutôt que de risquer de
// casser le défilement horizontal/sticky de la grille horaire sans pouvoir le vérifier dans un
// vrai navigateur, on bascule simplement la vue par défaut sur Agenda en-dessous de 640px (seuil
// `sm` de Tailwind) — l'utilisateur reste entièrement libre de choisir Jour/Semaine/Mois ensuite,
// ce choix explicite n'est alors plus jamais remplacé automatiquement.
//
// useSyncExternalStore (plutôt qu'un useState+useEffect lisant window.innerWidth) pour la même
// raison que useIsOffline.ts : évite un setState synchrone dans un effet juste pour lire une
// valeur absente côté serveur (react-hooks/set-state-in-effect) — l'instantané serveur vaut
// "large écran", jusqu'à ce que l'hydratation resynchronise sur la vraie largeur.
function subscribeNarrowScreen(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
function getNarrowScreenSnapshot() {
  return window.innerWidth < 640;
}
function getNarrowScreenServerSnapshot() {
  return false;
}

export default function OutlookCalendar({
  initialItems,
  patients,
  caregivers,
  staffUsers,
}: OutlookCalendarProps) {
  const router = useRouter();
  const isNarrowScreen = useSyncExternalStore(subscribeNarrowScreen, getNarrowScreenSnapshot, getNarrowScreenServerSnapshot);

  // Navigation & View state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // null = pas encore de choix explicite de l'utilisateur : la vue effective suit alors
  // isNarrowScreen (Agenda sur téléphone, Semaine sinon) — cf. commentaire sur
  // getNarrowScreenSnapshot plus haut. Dès qu'il clique un onglet de vue, ce choix devient fixe.
  const [manualViewMode, setManualViewMode] = useState<CalendarViewMode | null>(null);
  const viewMode = manualViewMode ?? (isNarrowScreen ? "agenda" : "week");
  const setViewMode = setManualViewMode;

  // Filtering & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCaregiverIds, setSelectedCaregiverIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedKinds, setSelectedKinds] = useState<CalendarItemKind[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Modals state — rendez-vous
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newModalPrefill, setNewModalPrefill] = useState<{ date?: string; time?: string }>({});
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);

  // Modals state — gardes
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRecord | null>(null);

  // Modals state — événements libres
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRecord | null>(null);

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

  // Kind group toggle — ajoute/retire TOUS les kinds du groupe ensemble (cf. KIND_FILTER_GROUPS).
  const toggleKindGroup = (kinds: CalendarItemKind[]) => {
    setSelectedKinds((prev) => {
      const allActive = kinds.every((k) => prev.includes(k));
      if (allActive) return prev.filter((k) => !kinds.includes(k));
      return [...new Set([...prev, ...kinds])];
    });
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    return initialItems.filter((item) => {
      // Filtre par type d'élément (Rendez-vous/Gardes/Tâches/Échéances/Événements)
      if (selectedKinds.length > 0 && !selectedKinds.includes(item.kind)) {
        return false;
      }

      // Recherche texte — titre/sous-titre pour tous les types, + le type d'acte pour un rendez-vous
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = item.title.toLowerCase();
        const subtitle = (item.subtitle || "").toLowerCase();
        const aptType = item.kind === "APPOINTMENT" ? ((item.raw as CalendarAppointment).type || "").toLowerCase() : "";
        if (!title.includes(q) && !subtitle.includes(q) && !aptType.includes(q)) {
          return false;
        }
      }

      // Les filtres soignant/statut/type ne s'appliquent qu'aux rendez-vous — les autres types
      // n'ont pas d'équivalent et restent toujours visibles indépendamment de ces filtres.
      if (item.kind === "APPOINTMENT") {
        const apt = item.raw as CalendarAppointment;
        if (selectedCaregiverIds.length > 0) {
          if (!apt.caregiverId || !selectedCaregiverIds.includes(apt.caregiverId)) {
            return false;
          }
        }
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(apt.status)) {
          return false;
        }
        if (selectedType && apt.type !== selectedType) {
          return false;
        }
      }

      return true;
    });
  }, [initialItems, searchQuery, selectedCaregiverIds, selectedStatuses, selectedType, selectedKinds]);

  // Handle Slot Click -> Pre-fill rendez-vous (action par défaut d'un clic sur un créneau vide ;
  // les gardes/événements se créent via le bouton "+ Nouveau", qui laisse choisir le type).
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

  // Dispatch du clic selon le type d'élément — seuls rendez-vous/gardes/événements ouvrent un
  // dialogue ici (modifiables depuis ce calendrier) ; les échéances en lecture seule
  // (tâches/contrats/stock) renvoient vers la page où elles sont réellement gérées.
  const handleSelectItem = (item: CalendarItem) => {
    if (item.kind === "APPOINTMENT") {
      setSelectedAppointment(item.raw as CalendarAppointment);
    } else if (item.kind === "SHIFT") {
      setEditingShift(item.raw as ShiftRecord);
      setShiftModalOpen(true);
    } else if (item.kind === "EVENT") {
      setEditingEvent(item.raw as CalendarEventRecord);
      setEventModalOpen(true);
    } else if (item.href) {
      router.push(item.href);
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedCaregiverIds.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedType !== "" ||
    selectedKinds.length > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCaregiverIds([]);
    setSelectedStatuses([]);
    setSelectedType("");
    setSelectedKinds([]);
  };

  // Unique types from all appointments
  const allTypes = useMemo(() => {
    const typesSet = new Set<string>();
    initialItems.forEach((i) => {
      if (i.kind === "APPOINTMENT") {
        const type = (i.raw as CalendarAppointment).type;
        if (type) typesSet.add(type);
      }
    });
    return Array.from(typesSet);
  }, [initialItems]);

  // Menu "+ Nouveau" partagé par les deux emplacements (barre du haut + panneau latéral) — un
  // seul point d'entrée pour choisir entre rendez-vous/garde/événement, plutôt qu'un choix
  // déclenché par le clic sur un créneau (plus simple à câbler sur les 3 vues de grille).
  const newItemMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className="h-9 gap-1.5 text-xs font-semibold shadow-sm" />}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Nouveau</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            setNewModalPrefill({});
            setNewModalOpen(true);
          }}
        >
          <ClipboardList className="h-4 w-4" />
          Rendez-vous
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setEditingShift(null);
            setShiftModalOpen(true);
          }}
        >
          <Briefcase className="h-4 w-4" />
          Garde
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setEditingEvent(null);
            setEventModalOpen(true);
          }}
        >
          <CalendarClock className="h-4 w-4" />
          Événement
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
            Aujourd&apos;hui
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

          {/* Outlook View Switcher Pills — overflow-x-auto (pas de sticky/scroll imbriqué ici,
              contrairement à la grille horaire : aucun risque à faire défiler ce petit groupe de
              boutons si les 5 libellés français ne tiennent pas sur un très petit écran). */}
          <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
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
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
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
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
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
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
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
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "agenda"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Planning
            </button>
          </div>

          {newItemMenu}
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
          {/* Quick Plan Menu */}
          <div className="[&>button]:w-full">{newItemMenu}</div>

          {/* Outlook Mini Calendar */}
          <div className="pt-2 border-t border-border/60">
            <MiniCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectMiniDate}
              items={initialItems}
            />
          </div>

          {/* Type d'élément (Rendez-vous/Gardes/Tâches/Échéances/Événements) */}
          <div className="space-y-2 pt-3 border-t border-border/60">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Afficher
            </span>
            <div className="space-y-1">
              {KIND_FILTER_GROUPS.map(({ label, kinds, icon: Icon }) => {
                const active = selectedKinds.length === 0 || kinds.some((k) => selectedKinds.includes(k));
                return (
                  <label
                    key={label}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer select-none text-xs transition-colors"
                  >
                    <Checkbox checked={active} onCheckedChange={() => toggleKindGroup(kinds)} className="rounded" />
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate text-foreground font-medium flex-1">{label}</span>
                  </label>
                );
              })}
            </div>
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
                Type d&apos;intervention
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
              items={filteredItems}
              onSelectItem={handleSelectItem}
              onSlotClick={handleSlotClick}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}

          {viewMode === "workWeek" && (
            <CalendarTimeGrid
              days={getDaysInWeek(currentDate, true)}
              items={filteredItems}
              onSelectItem={handleSelectItem}
              onSlotClick={handleSlotClick}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}

          {viewMode === "week" && (
            <CalendarTimeGrid
              days={getDaysInWeek(currentDate, false)}
              items={filteredItems}
              onSelectItem={handleSelectItem}
              onSlotClick={handleSlotClick}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}

          {viewMode === "month" && (
            <CalendarMonthGrid
              currentDate={currentDate}
              items={filteredItems}
              onSelectItem={handleSelectItem}
              onDayClick={handleDayClick}
              selectedDate={selectedDate}
            />
          )}

          {viewMode === "agenda" && (
            <CalendarAgendaView
              items={filteredItems}
              onSelectItem={handleSelectItem}
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

      {/* 5. Shift Dialog (création + édition) */}
      <NewShiftDialog
        open={shiftModalOpen}
        onOpenChange={(open) => {
          setShiftModalOpen(open);
          if (!open) setEditingShift(null);
        }}
        staffUsers={staffUsers}
        shift={editingShift}
        onSuccess={handleRefresh}
      />

      {/* 6. Événement libre (création + édition) */}
      <NewEventDialog
        open={eventModalOpen}
        onOpenChange={(open) => {
          setEventModalOpen(open);
          if (!open) setEditingEvent(null);
        }}
        event={editingEvent}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
