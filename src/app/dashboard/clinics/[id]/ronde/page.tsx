import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRound, getRoundTeam, getRoundWards } from "@/actions/rounds";
import { canRunRound, clinicDay, isValidRoundDay } from "@/lib/rounds";
import { keepQuery } from "@/components/ui/pagination-nav";
import { pageFromParam } from "@/lib/pagination";
import RondeView, { type RoundData } from "./ronde-view";

export const metadata = {
  title: "Ronde médicale | MedDoc",
};

interface RondePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RondePage({ params, searchParams }: RondePageProps) {
  const { id: clinicId } = await params;
  const query = await searchParams;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!canRunRound(currentUser.role)) redirect(`/dashboard/clinics/${clinicId}`);

  const [wardsRes, teamRes] = await Promise.all([getRoundWards(clinicId), getRoundTeam(clinicId)]);
  const wards = wardsRes.success ? wardsRes.data : [];
  const team = teamRes.success ? teamRes.data : [];

  const requestedWard = typeof query.ward === "string" ? query.ward : undefined;
  const wardId = wards.find((w) => w.id === requestedWard)?.id ?? wards[0]?.id ?? null;
  const day = typeof query.day === "string" && isValidRoundDay(query.day) ? query.day : clinicDay();
  const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${day}T12:00:00Z`));

  const roundRes = wardId ? await getRound(clinicId, wardId, day, { page: pageFromParam(query.page) }) : null;
  const round = roundRes && roundRes.success ? (roundRes.data as RoundData | null) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Ronde médicale</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          La visite quotidienne de l&apos;équipe au chevet des patients hospitalisés : état de chacun, constats, décision et conduite à tenir.
        </p>
      </div>

      {roundRes && !roundRes.success && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{roundRes.error}</div>
      )}

      <RondeView
        key={`${wardId}-${day}-${round?.session.id ?? "none"}`}
        clinicId={clinicId}
        currentUserId={currentUser.id}
        wards={wards}
        wardId={wardId}
        day={day}
        dayLabel={dayLabel}
        round={round}
        team={team}
        query={keepQuery(query, ["page"])}
        pathname={`/dashboard/clinics/${clinicId}/ronde`}
      />
    </div>
  );
}
