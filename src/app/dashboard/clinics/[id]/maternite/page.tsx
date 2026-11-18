import Link from "next/link";
import { redirect } from "next/navigation";
import { Baby, Phone } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listPrenatalFollowUp } from "@/actions/maternity";
import { PRENATAL_FOLLOW_UP_LABELS, PRENATAL_TO_CALL, type PrenatalFollowUpStatus } from "@/lib/maternity-labels";

export const metadata = {
  title: "Maternité | MedDoc",
};

interface MaternitePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_CLASS: Record<PrenatalFollowUpStatus, string> = {
  TERM_PASSED: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
  OVERDUE: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
  NO_VISIT: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  DUE_SOON: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
  NO_APPOINTMENT: "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-300",
  SCHEDULED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
};

function formatDate(d: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

// Suivi des consultations prénatales de la clinique : qui relancer aujourd'hui (terme dépassé,
// CPN manquée, aucune CPN), puis les rendez-vous à venir.
export default async function MaternitePage({ params, searchParams }: MaternitePageProps) {
  const { id: clinicId } = await params;
  const query = await searchParams;
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");

  const res = await listPrenatalFollowUp(clinicId);
  const all = res.success ? res.data : [];
  const toCall = all.filter((r) => PRENATAL_TO_CALL.includes(r.status));
  const showAll = query.vue === "toutes";
  const rows = showAll ? all : toCall;
  const basePath = `/dashboard/clinics/${clinicId}/maternite`;

  const count = (s: PrenatalFollowUpStatus) => all.filter((r) => r.status === s).length;
  const tabClass = (active: boolean) =>
    `px-3 py-2 text-sm font-semibold rounded-lg transition-all ${active ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-300"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          <Baby className="h-7 w-7 text-pink-500" />
          Maternité
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Grossesses en cours et suivi des consultations prénatales. Les visites se saisissent dans le dossier de la patiente (onglet Maternité).
        </p>
      </div>

      {res.success ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["Grossesses en cours", all.length, "text-slate-900 dark:text-white"],
              ["CPN en retard", count("OVERDUE"), "text-red-600"],
              ["Terme dépassé", count("TERM_PASSED"), "text-red-600"],
              ["CPN cette semaine", count("DUE_SOON"), "text-blue-600"],
            ] as const).map(([label, value, color]) => (
              <div key={label} className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="flex w-full items-center gap-1 rounded-xl bg-slate-100/80 p-1 sm:w-fit dark:bg-slate-800/60">
            <Link href={basePath} className={`flex-1 text-center sm:flex-none ${tabClass(!showAll)}`}>
              À relancer ({toCall.length})
            </Link>
            <Link href={`${basePath}?vue=toutes`} className={`flex-1 text-center sm:flex-none ${tabClass(showAll)}`}>
              Toutes ({all.length})
            </Link>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {showAll ? "Aucune grossesse en cours." : "Personne à relancer : toutes les patientes sont à jour de leurs CPN."}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <div key={r.id} className="space-y-2 rounded-2xl border border-slate-200/70 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/dashboard/patients/${r.patientId}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                        {r.patientName}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {r.ipp ? `${r.ipp} • ` : ""}G{r.gravidity}P{r.parity} • {r.gestationalWeeks} SA • DPA {formatDate(r.expectedDueDate)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[r.status]}`}>
                      {PRENATAL_FOLLOW_UP_LABELS[r.status]}
                      {r.daysLate > 0 ? ` (${r.daysLate} j)` : ""}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {r.lastVisit
                      ? `Dernière CPN${r.lastVisit.cpnNumber ? ` (n° ${r.lastVisit.cpnNumber})` : ""} : ${formatDate(r.lastVisit.visitDate)} • ${r.visitCount} visite${r.visitCount > 1 ? "s" : ""}`
                      : "Aucune visite prénatale enregistrée"}
                    {r.lastVisit?.nextVisitDate ? ` • Prochain RDV : ${formatDate(r.lastVisit.nextVisitDate)}` : ""}
                  </p>
                  {r.riskFactors.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.riskFactors.map((f) => (
                        <span key={f} className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">{f}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.phone && (
                      <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        <Phone className="h-4 w-4" />
                        {r.phone}
                      </a>
                    )}
                    <Link href={`/dashboard/patients/${r.patientId}`} className="inline-flex h-10 items-center rounded-lg border px-3 text-sm font-medium">
                      Ouvrir le dossier
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{res.error}</div>
      )}
    </div>
  );
}
