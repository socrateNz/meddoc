import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getAccountingJournal, getAccountingHeader, getAccountingLedger, getAccountingOverview, getAccountingTrialBalance, getCashWithdrawals } from "@/actions/accounting";
import { accountLabel, isWithdrawalCategory, JOURNALS } from "@/lib/accounting/plan";
import SyncButton from "./sync-button";
import WithdrawalCategorySelect from "./withdrawal-category-select";

export const metadata = { title: "Comptabilité | MedDoc" };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TABS = [
  { key: "tableau", label: "Tableau de bord" },
  { key: "journal", label: "Journal" },
  { key: "balance", label: "Balance" },
  { key: "grand-livre", label: "Grand livre" },
  { key: "sorties", label: "Sorties de caisse" },
  { key: "sante", label: "Santé de la compta" },
] as const;

const fcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} FCFA`;
const fr = (d: string) => d.split("-").reverse().join("/");
const amount = (n: number) => (n ? Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ") : "");

function Kpi({ label, value, hint, tone = "slate" }: { label: string; value: number; hint: string; tone?: "slate" | "emerald" | "rose" | "blue" }) {
  const color = { slate: "text-slate-900 dark:text-white", emerald: "text-emerald-600", rose: "text-rose-600", blue: "text-blue-600" }[tone];
  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{fcfa(value)}</p>
      <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

export default async function AccountingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id: clinicId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tab = (TABS.find((t) => t.key === one(sp.tab))?.key ?? "tableau") as (typeof TABS)[number]["key"];
  const periodInput = { from: one(sp.du), to: one(sp.au) };
  const header = await getAccountingHeader(clinicId, periodInput);
  if (!header.success) {
    return <div className="p-8 text-sm text-rose-600">{header.error}</div>;
  }
  const o = header.data;
  const p = o.period;
  const canWrite = ["COMPTABLE", "COORDINATOR"].includes(user.role);
  const base = `/dashboard/clinics/${clinicId}/comptabilite`;
  const query = (extra: Record<string, string>) => `?${new URLSearchParams({ du: p.from, au: p.to, ...extra }).toString()}`;
  const flow = `du ${fr(p.from)} au ${fr(p.to)}`;
  const at = `au ${fr(p.to)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comptabilité</h1>
          <p className="text-sm text-muted-foreground">
            SYSCOHADA — {o.clinicName}. Tous les chiffres sont lus dans les écritures comptables ({o.entryCount} sur la période).
            {o.lockedUntil ? ` Période verrouillée jusqu'au ${fr(o.lockedUntil)}.` : ""}
          </p>
        </div>
        {canWrite && <SyncButton organizationId={clinicId} missing={o.missingEntries} />}
      </div>

      <form className="flex flex-wrap items-end gap-3" action={base}>
        <input type="hidden" name="tab" value={tab} />
        {tab === "grand-livre" && <input type="hidden" name="compte" value={one(sp.compte) ?? "571"} />}
        {tab === "journal" && <input type="hidden" name="journal" value={one(sp.journal) ?? "ALL"} />}
        <label className="text-xs font-medium text-slate-500">
          Du
          <input type="date" name="du" defaultValue={p.from} className="mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Au
          <input type="date" name="au" defaultValue={p.to} className="mt-1 block h-9 rounded-xl border border-input bg-background px-3 text-sm" />
        </label>
        <button className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">Afficher</button>
      </form>

      <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60 w-fit">
        {TABS.map((t) => (
          <Link key={t.key} href={`${base}${query({ tab: t.key })}`} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t.key ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {(tab === "tableau" || tab === "sante") && (
        <Suspense key={`${tab}-${p.from}-${p.to}`} fallback={<TabLoading />}>
          <OverviewTab tab={tab} clinicId={clinicId} periodInput={periodInput} flow={flow} at={at} />
        </Suspense>
      )}

      {tab === "journal" && <Suspense key={`j-${one(sp.journal)}-${one(sp.page)}-${p.from}-${p.to}`} fallback={<TabLoading />}><JournalTab clinicId={clinicId} sp={sp} periodInput={periodInput} base={base} query={query} /></Suspense>}
      {tab === "balance" && <Suspense key={`b-${p.from}-${p.to}`} fallback={<TabLoading />}><BalanceTab clinicId={clinicId} periodInput={periodInput} base={base} query={query} /></Suspense>}
      {tab === "grand-livre" && <Suspense key={`g-${one(sp.compte)}-${one(sp.page)}-${p.from}-${p.to}`} fallback={<TabLoading />}><LedgerTab clinicId={clinicId} account={one(sp.compte) ?? "571"} page={Number(one(sp.page)) || 1} periodInput={periodInput} base={base} query={query} /></Suspense>}

      {tab === "sorties" && <Suspense key={`s-${p.from}-${p.to}`} fallback={<TabLoading />}><WithdrawalsTab clinicId={clinicId} periodInput={periodInput} canWrite={canWrite} flow={flow} /></Suspense>}

    </div>
  );
}

async function WithdrawalsTab({ clinicId, periodInput, canWrite, flow }: { clinicId: string; periodInput: { from?: string; to?: string }; canWrite: boolean; flow: string }) {
  const res = await getCashWithdrawals(clinicId, periodInput);
  if (!res.success) return <p className="text-sm text-rose-600">{res.error}</p>;
  const items = res.data.items;
  const charges = items.filter((i) => !isWithdrawalCategory(i.category)).reduce((s, i) => s + i.amount, 0);
  const others = items.reduce((s, i) => s + i.amount, 0) - charges;
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Toutes les sorties d&apos;argent saisies à la caisse ({flow}). Une sortie qui n&apos;appauvrit pas la clinique — argent remis
        au propriétaire, versé en banque, avance sur salaire, paiement d&apos;un fournisseur déjà enregistré — n&apos;est pas une
        charge : classez-la dans « Retraits qui ne sont pas des charges », elle sortira du résultat.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>Charges : <strong className="text-rose-600">{fcfa(charges)}</strong></span>
        <span>Retraits hors charges : <strong>{fcfa(others)}</strong></span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Motif</th>
              <th className="p-3 text-right">Montant</th>
              <th className="p-3">Classement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="p-3 whitespace-nowrap">{fr(i.date)}</td>
                <td className="p-3">{i.description}</td>
                <td className="p-3 text-right whitespace-nowrap font-medium">{fcfa(i.amount)}</td>
                <td className="p-3"><WithdrawalCategorySelect organizationId={clinicId} transactionId={i.id} value={i.category} disabled={!canWrite} /></td>
              </tr>
            ))}
            {!items.length && (
              <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucune sortie de caisse sur la période.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TabLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60" />
    </div>
  );
}

async function OverviewTab({ tab, clinicId, periodInput, flow, at }: { tab: "tableau" | "sante"; clinicId: string; periodInput: { from?: string; to?: string }; flow: string; at: string }) {
  const overview = await getAccountingOverview(clinicId, periodInput);
  if (!overview.success) return <p className="text-sm text-rose-600">{overview.error}</p>;
  const o = overview.data;
  const d = o.dashboard;
  if (tab === "tableau") {
    return (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Activité — {flow}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Chiffre d'affaires" value={d.revenue} hint={`Ventes comptabilisées (comptes 70x), ${flow}`} tone="blue" />
              <Kpi label="Charges" value={d.expenses} hint={`Comptes 6x, ${flow}`} tone="rose" />
              <Kpi label="Résultat" value={d.result} hint={`Produits − charges, ${flow}`} tone={d.result >= 0 ? "emerald" : "rose"} />
              <Kpi label="Encaissements" value={d.cashIn} hint={`Argent reçu (débits des 5x hors virements internes), ${flow} — ce n'est pas le CA`} />
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Trésorerie, dettes et créances — {at}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Caisse" value={d.cash} hint={`Solde du compte 571 ${at}`} />
              <Kpi label="Mobile Money" value={d.mobileMoney} hint={`Solde du compte 552 ${at}`} />
              <Kpi label="Banque" value={d.bank} hint={`Solde du compte 521 ${at}`} />
              <Kpi label="Chèques à encaisser" value={d.cheques} hint={`Solde du compte 513 ${at}`} />
              <Kpi label="Créances patients" value={d.patientReceivables} hint={`Restes dus par les patients (411) ${at}`} />
              <Kpi label="Créances tiers payant" value={d.thirdPartyReceivables} hint={`Organismes de prise en charge (4111) ${at}`} />
              <Kpi label="Dettes fournisseurs" value={d.supplierDebt} hint={`Achats non réglés (401) ${at}`} tone="rose" />
              <Kpi label="TVA nette" value={o.vat.net} hint={`Collectée − déductible, ${flow} (actes médicaux exonérés)`} />
            </div>
          </section>
        </div>
    );
  }
  return (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Contrôles d&apos;intégrité — chacun doit être au vert</h2>
          <div className="divide-y rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
            {[
              { ok: o.checks.unbalancedEntries === 0, label: "Chaque écriture est équilibrée (Σ débits = Σ crédits)", detail: `${o.checks.unbalancedEntries} écriture(s) déséquilibrée(s)` },
              { ok: o.checks.globalBalanced, label: "Total des débits = total des crédits", detail: "Écart global" },
              { ok: o.checks.invalidLines === 0, label: "Aucune ligne à 0, avec débit et crédit, ou non entière", detail: `${o.checks.invalidLines} ligne(s) invalide(s)` },
              { ok: o.checks.balanceSheetBalanced, label: `Bilan : total actif = total passif ${at}`, detail: `${fcfa(o.sheet.totalAssets)} contre ${fcfa(o.sheet.totalLiabilities)}` },
              { ok: o.checks.missingEntries === 0, label: "Tout document réglé a son écriture", detail: `${o.checks.missingEntries} document(s) sans écriture — bouton « Générer les écritures manquantes »` },
            ].map((c) => (
              <div key={c.label} className="flex items-start gap-3 p-4 text-sm">
                {c.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />}
                <div>
                  <p className="font-medium">{c.label}</p>
                  {!c.ok && <p className="text-xs text-rose-600">{c.detail}</p>}
                </div>
              </div>
            ))}
          </div>
          {o.suspense !== 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm dark:border-amber-700/50 dark:bg-amber-900/10">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">À régulariser (compte d&apos;attente 471) {at} : {fcfa(o.suspense)}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Règlements annulés hors caisse : MedDoc ne les a pas sortis du tiroir. Si l&apos;argent a été rendu au patient (ou si
                  une sortie a servi à compenser, ex. « Annulation de règlement »), classez cette sortie dans l&apos;onglet « Sorties de
                  caisse » en « Remboursement / correction d&apos;un règlement annulé ».
                </p>
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-400">Résultat de l&apos;exercice selon le compte de résultat ({flow}) : {fcfa(o.income.result)}.</p>
        </section>
  );
}

type TabProps = { clinicId: string; periodInput: { from?: string; to?: string }; base: string; query: (extra: Record<string, string>) => string };

// Pagination : page 1 = les plus récentes.
function Pager({ page, pages, total, unit, href }: { page: number; pages: number; total: number; unit: string; href: (page: number) => string }) {
  if (pages <= 1) return <p className="text-xs text-slate-500">{total} {unit}</p>;
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-300 dark:border-slate-800 dark:text-slate-600">{label}</span>
    ) : (
      <Link href={href(p)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">{label}</Link>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {link(1, "« Plus récentes", page === 1)}
      {link(page - 1, "‹ Précédente", page === 1)}
      <span className="text-xs text-slate-500">Page {page} / {pages} — {total} {unit}</span>
      {link(page + 1, "Suivante ›", page === pages)}
      {link(pages, "Plus anciennes »", page === pages)}
    </div>
  );
}

async function JournalTab({ clinicId, sp, periodInput, base, query }: TabProps & { sp: SearchParams }) {
  const journal = one(sp.journal) ?? "ALL";
  const res = await getAccountingJournal(clinicId, periodInput, journal, Number(one(sp.page)) || 1);
  if (!res.success) return <p className="text-sm text-rose-600">{res.error}</p>;
  const pager = <Pager page={res.data.page} pages={res.data.pages} total={res.data.total} unit="écriture(s), les plus récentes d'abord" href={(p) => `${base}${query({ tab: "journal", journal, page: String(p) })}`} />;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {["ALL", ...Object.keys(JOURNALS)].map((j) => (
          <Link key={j} href={`${base}${query({ tab: "journal", journal: j })}`} className={`rounded-lg border px-3 py-1 text-xs font-semibold ${journal === j ? "border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700"}`}>
            {j === "ALL" ? "Tous" : `${j} · ${JOURNALS[j as keyof typeof JOURNALS]}`}
          </Link>
        ))}
      </div>
      {res.data.entries.length === 0 && <p className="text-sm text-muted-foreground">Aucune écriture sur la période.</p>}
      {pager}
      <div className="space-y-3">
        {res.data.entries.map((e) => (
          <div key={e.id} className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm">
              <span className="font-mono font-semibold">{e.number}</span>
              <span className="text-slate-500">{fr(e.entryDate)}</span>
              <span className="flex-1 truncate font-medium">{e.label}</span>
              {e.reversed && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">Contrepassée</span>}
              {e.isReversal && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">Contrepassation</span>}
            </div>
            <table className="w-full text-xs">
              <tbody>
                {e.lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800/50">
                    <td className="w-20 px-4 py-1.5 font-mono">{l.account}</td>
                    <td className="py-1.5 text-slate-500">{accountLabel(l.account)}</td>
                    <td className="w-32 py-1.5 text-right font-medium">{amount(l.debit)}</td>
                    <td className="w-32 px-4 py-1.5 text-right font-medium">{amount(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {pager}
    </section>
  );
}

async function BalanceTab({ clinicId, periodInput, base, query }: TabProps) {
  const res = await getAccountingTrialBalance(clinicId, periodInput);
  if (!res.success) return <p className="text-sm text-rose-600">{res.error}</p>;
  const b = res.data;
  return (
    <section className="space-y-2">
      <p className={`text-xs font-semibold ${b.balanced ? "text-emerald-600" : "text-rose-600"}`}>
        {b.balanced ? "Balance équilibrée sur chaque colonne." : "Balance déséquilibrée : vérifiez la santé de la compta."}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-2 text-left">Compte</th>
              <th className="px-3 py-2 text-left">Libellé</th>
              <th className="px-3 py-2 text-right">Ouverture débit</th>
              <th className="px-3 py-2 text-right">Ouverture crédit</th>
              <th className="px-3 py-2 text-right">Mouvements débit</th>
              <th className="px-3 py-2 text-right">Mouvements crédit</th>
              <th className="px-3 py-2 text-right">Solde débiteur</th>
              <th className="px-3 py-2 text-right">Solde créditeur</th>
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r) => (
              <tr key={r.account} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5 font-mono">
                  <Link href={`${base}${query({ tab: "grand-livre", compte: r.account })}`} className="text-blue-600 hover:underline">{r.account}</Link>
                </td>
                <td className="px-3 py-1.5 text-slate-500">{accountLabel(r.account)}</td>
                <td className="px-3 py-1.5 text-right">{amount(r.openingDebit)}</td>
                <td className="px-3 py-1.5 text-right">{amount(r.openingCredit)}</td>
                <td className="px-3 py-1.5 text-right">{amount(r.debit)}</td>
                <td className="px-3 py-1.5 text-right">{amount(r.credit)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{amount(r.closingDebit)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{amount(r.closingCredit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 font-bold dark:border-slate-600">
            <tr>
              <td className="px-3 py-2" colSpan={2}>Totaux</td>
              <td className="px-3 py-2 text-right">{amount(b.totals.openingDebit)}</td>
              <td className="px-3 py-2 text-right">{amount(b.totals.openingCredit)}</td>
              <td className="px-3 py-2 text-right">{amount(b.totals.debit)}</td>
              <td className="px-3 py-2 text-right">{amount(b.totals.credit)}</td>
              <td className="px-3 py-2 text-right">{amount(b.totals.closingDebit)}</td>
              <td className="px-3 py-2 text-right">{amount(b.totals.closingCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

async function LedgerTab({ clinicId, account, page, periodInput, base, query }: TabProps & { account: string; page: number }) {
  const res = await getAccountingLedger(clinicId, account, periodInput, page);
  if (!res.success) return <p className="text-sm text-rose-600">{res.error}</p>;
  const l = res.data;
  const pager = <Pager page={l.page} pages={l.pages} total={l.total} unit="ligne(s), les plus récentes d'abord" href={(p) => `${base}${query({ tab: "grand-livre", compte: account, page: String(p) })}`} />;
  return (
    <section className="space-y-3">
      <form action={base} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="grand-livre" />
        <input type="hidden" name="du" value={l.period.from} />
        <input type="hidden" name="au" value={l.period.to} />
        <label className="text-xs font-medium text-slate-500">
          Compte (ou préfixe : 5 = toute la trésorerie)
          <input name="compte" defaultValue={account} className="mt-1 block h-9 w-48 rounded-xl border border-input bg-background px-3 font-mono text-sm" />
        </label>
        <button className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">Voir</button>
      </form>
      <p className="text-sm font-semibold">{account} — {accountLabel(account)}</p>
      {pager}
      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">N°</th>
              <th className="px-3 py-2 text-left">Libellé</th>
              <th className="px-3 py-2 text-right">Débit</th>
              <th className="px-3 py-2 text-right">Crédit</th>
              <th className="px-3 py-2 text-right">Solde</th>
            </tr>
          </thead>
          <tbody>
            {l.page === 1 && (
              <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                <td className="px-3 py-1.5" colSpan={5}>Solde au {fr(l.period.to)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{amount(l.closing) || "0"}</td>
              </tr>
            )}
            {l.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5">{fr(r.entryDate)}</td>
                <td className="px-3 py-1.5 font-mono">{r.entryNumber}</td>
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 text-right">{amount(r.debit)}</td>
                <td className="px-3 py-1.5 text-right">{amount(r.credit)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{amount(r.running) || "0"}</td>
              </tr>
            ))}
            {l.page === l.pages && (
              <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                <td className="px-3 py-1.5" colSpan={5}>Solde d&apos;ouverture au {fr(l.period.from)}</td>
                <td className="px-3 py-1.5 text-right font-semibold">{amount(l.opening) || "0"}</td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 font-bold dark:border-slate-600">
            <tr>
              <td className="px-3 py-2" colSpan={3}>Totaux de la période — solde final</td>
              <td className="px-3 py-2 text-right">{amount(l.debit)}</td>
              <td className="px-3 py-2 text-right">{amount(l.credit)}</td>
              <td className="px-3 py-2 text-right">{amount(l.closing) || "0"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {pager}
    </section>
  );
}
