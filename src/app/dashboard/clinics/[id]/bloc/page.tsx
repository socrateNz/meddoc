import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listOperatingRooms, listSurgeryDay } from "@/actions/surgery";
import { clinicDateKey } from "@/lib/clinic-day";
import SurgeryDayPlan from "./surgery-day-plan";
import ScheduleSurgeryDialog from "./schedule-surgery-dialog";
import OperatingRoomsManager from "./operating-rooms-manager";

export const metadata = {
  title: "Bloc opératoire | MedDoc",
};

interface BlocPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function shiftDate(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function BlocPage({ params, searchParams }: BlocPageProps) {
  const { id: clinicId } = await params;
  const query = await searchParams;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  const today = clinicDateKey();
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : today;
  const showRooms = query.tab === "salles" && activeUser.role === "COORDINATOR";
  const basePath = `/dashboard/clinics/${clinicId}/bloc`;

  const [dayRes, roomsRes] = await Promise.all([
    showRooms ? Promise.resolve(null) : listSurgeryDay(clinicId, date),
    listOperatingRooms(clinicId, { includeInactive: showRooms }),
  ]);

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${active ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-300"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 animate-fade-up">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Bloc opératoire</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Programme des salles, check-list de sécurité et comptes-rendus opératoires.</p>
        </div>
        {!showRooms && dayRes?.success && dayRes.data.canSchedule && roomsRes.success && (
          <ScheduleSurgeryDialog clinicId={clinicId} rooms={roomsRes.data.map((r) => ({ id: r.id, name: r.name }))} defaultDate={date} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
          <Link href={`${basePath}?date=${date}`} className={tabClass(!showRooms)}>
            Programme
          </Link>
          {activeUser.role === "COORDINATOR" && (
            <Link href={`${basePath}?tab=salles`} className={tabClass(showRooms)}>
              Salles
            </Link>
          )}
        </div>
        {!showRooms && (
          <div className="flex items-center gap-1">
            <Link href={`${basePath}?date=${shiftDate(date, -1)}`} className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800" aria-label="Jour précédent">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="px-2 text-sm font-semibold capitalize">{formatDayLabel(date)}</span>
            <Link href={`${basePath}?date=${shiftDate(date, 1)}`} className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800" aria-label="Jour suivant">
              <ChevronRight className="h-4 w-4" />
            </Link>
            {date !== today && (
              <Link href={basePath} className="ml-1 text-xs font-semibold text-blue-600 hover:underline">
                Aujourd&apos;hui
              </Link>
            )}
          </div>
        )}
      </div>

      {showRooms ? (
        roomsRes.success ? (
          <OperatingRoomsManager clinicId={clinicId} rooms={roomsRes.data.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive }))} />
        ) : (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{roomsRes.error}</div>
        )
      ) : dayRes?.success ? (
        <SurgeryDayPlan clinicId={clinicId} rooms={dayRes.data.rooms} cases={dayRes.data.cases} />
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{dayRes?.error}</div>
      )}
    </div>
  );
}
