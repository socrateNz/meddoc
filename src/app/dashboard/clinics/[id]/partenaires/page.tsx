import Link from "next/link";
import { redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPartnerStatement, listPartners } from "@/actions/partners";
import PrintButton from "./print-button";
import SettlementForm from "./settlement-form";

const SETTLEMENT_METHODS: Record<string, string> = { CASH: "Espèces", MOBILE: "Mobile money", TRANSFER: "Virement", CHEQUE: "Chèque" };

const LAB_STATUS_LABELS: Record<string, string> = {
  PRESCRIBED: "Prescrit",
  SAMPLE_COLLECTED: "Prélevé",
  RECEIVED_AT_LAB: "Reçu au labo",
  IN_ANALYSIS: "En analyse",
  TO_VALIDATE: "À valider",
  VALIDATED: "Validé",
  DELIVERED: "Remis",
};

export const metadata = {
  title: "Relevés partenaires | MedDoc",
};

interface PartnersPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function formatFCFA(value: number) {
  return `${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

// Relevé mensuel des examens réalisés pour une clinique partenaire, à imprimer et lui remettre.
export default async function PartnersStatementPage({ params, searchParams }: PartnersPageProps) {
  const { id: clinicId } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const partnersRes = await listPartners(clinicId, { includeInactive: true });
  const partners = partnersRes.success ? partnersRes.data : [];
  const month = typeof query.mois === "string" && /^\d{4}-\d{2}$/.test(query.mois) ? query.mois : currentMonth();
  const partnerId = typeof query.partenaire === "string" ? query.partenaire : partners[0]?.id;
  const statementRes = partnerId ? await getPartnerStatement({ partnerId, month }) : null;
  // Enregistrer un règlement : coordinateur et comptable de la clinique (l'admin de holding consulte).
  const canSettle = ["COORDINATOR", "COMPTABLE"].includes(user.role) && user.organizationId === clinicId;
  // Caisses ouvertes de la clinique (règlement en espèces).
  const openSessions = canSettle
    ? (
        await prisma.cashSession.findMany({
          where: { organizationId: clinicId, status: "OPEN" },
          select: { id: true, openedAt: true, register: { select: { name: true } } },
        })
      ).map((s) => ({ id: s.id, label: `${s.register?.name ?? "Caisse"} (ouverte le ${s.openedAt.toLocaleDateString("fr-FR")})` }))
    : [];
  const basePath = `/dashboard/clinics/${clinicId}/partenaires`;
  const href = (p: string | undefined, m: string) => `${basePath}?${new URLSearchParams({ ...(p ? { partenaire: p } : {}), mois: m })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 print:hidden">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          <Handshake className="h-7 w-7 text-violet-600" />
          Relevés partenaires
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Examens réalisés pour chaque clinique partenaire, au prix figé à la demande. Les partenaires se gèrent dans Configuration.
        </p>
      </div>

      {!partnersRes.success ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{partnersRes.error}</div>
      ) : partners.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucun partenaire. Le coordinateur les ajoute dans Configuration &gt; Cliniques partenaires.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {partners.map((p) => (
              <Link
                key={p.id}
                href={href(p.id, month)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${p.id === partnerId ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300" : ""}`}
              >
                {p.name}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link href={href(partnerId, shiftMonth(month, -1))} className="rounded-lg border px-3 py-1.5 text-sm">
              ← Mois précédent
            </Link>
            <span className="px-2 text-sm font-semibold capitalize">{monthLabel(month)}</span>
            <Link href={href(partnerId, shiftMonth(month, 1))} className="rounded-lg border px-3 py-1.5 text-sm">
              Mois suivant →
            </Link>
            <PrintButton />
          </div>

          {statementRes && !statementRes.success && (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{statementRes.error}</div>
          )}
          {statementRes?.success && (
            <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Relevé des examens</p>
                  <h2 className="text-xl font-bold">{statementRes.data.partner.name}</h2>
                  <p className="text-sm capitalize text-muted-foreground">{monthLabel(month)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {statementRes.data.rows.length} demande(s) • {statementRes.data.examCount} examen(s)
                  </p>
                  <p className="text-2xl font-extrabold text-violet-700 dark:text-violet-300">{formatFCFA(statementRes.data.total)}</p>
                  <p className="text-[11px] text-muted-foreground">dû par le partenaire</p>
                  {statementRes.data.total > 0 && (
                    <p className={`mt-1 text-sm font-semibold ${statementRes.data.balance === 0 ? "text-emerald-600" : statementRes.data.paid > 0 ? "text-amber-600" : "text-red-600"}`}>
                      {statementRes.data.balance === 0
                        ? "Réglé"
                        : statementRes.data.paid > 0
                          ? `Partiellement réglé — reste ${formatFCFA(statementRes.data.balance)}`
                          : "Non réglé"}
                    </p>
                  )}
                </div>
              </div>

              {statementRes.data.settlements.length > 0 && (
                <div className="space-y-1 rounded-xl border border-slate-200/70 p-3 text-sm dark:border-slate-800">
                  <p className="text-xs font-bold uppercase text-slate-500">Règlements reçus</p>
                  {statementRes.data.settlements.map((s) => (
                    <p key={s.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {new Date(s.paidAt).toLocaleDateString("fr-FR")} — {SETTLEMENT_METHODS[s.paymentMethod] ?? s.paymentMethod}
                        {s.reference ? ` (${s.reference})` : ""}
                      </span>
                      <span className="font-semibold">{formatFCFA(s.amount)}</span>
                    </p>
                  ))}
                </div>
              )}
              {canSettle && statementRes.data.balance > 0 && (
                <SettlementForm
                  partnerId={statementRes.data.partner.id}
                  month={month}
                  balance={statementRes.data.balance}
                  openSessions={openSessions}
                  canCash={user.role === "COORDINATOR"}
                />
              )}

              {statementRes.data.rows.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun examen ce mois-ci.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Patient</th>
                        <th className="py-2 pr-3 font-medium">Bon n°</th>
                        <th className="py-2 pr-3 font-medium">Examens</th>
                        <th className="py-2 pr-3 font-medium">Statut</th>
                        <th className="py-2 text-right font-medium">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementRes.data.rows.map((r) => (
                        <tr key={r.id} className="border-b align-top last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.date).toLocaleDateString("fr-FR")}</td>
                          <td className="py-2 pr-3">
                            {r.patientName}
                            {r.ipp && <span className="block text-xs text-muted-foreground">{r.ipp}</span>}
                          </td>
                          <td className="py-2 pr-3">{r.reference ?? "—"}</td>
                          <td className="py-2 pr-3">
                            {r.exams.map((e) => (
                              <span key={e.name} className="block text-xs">
                                {e.name} — {formatFCFA(e.price)}
                              </span>
                            ))}
                          </td>
                          <td className="py-2 pr-3 text-xs">{LAB_STATUS_LABELS[r.status] ?? r.status}</td>
                          <td className="py-2 text-right font-semibold whitespace-nowrap">
                            {formatFCFA(r.total)}
                            {r.paidByPatient && <span className="block text-[10px] font-normal text-muted-foreground">réglé par le patient</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
