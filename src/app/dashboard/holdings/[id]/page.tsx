import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Banknote,
  Blocks,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Crown,
  FlaskConical,
  Mail,
  MapPin,
  Phone,
  ScanLine,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getHoldingDetails } from "@/actions/super-admin";
import { Badge } from "@/components/ui/badge";
import { MODULES, MODULE_KEYS, enabledModulesFrom } from "@/lib/modules";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import HoldingActionsMenu from "../holding-actions-menu";

interface HoldingDetailPageProps {
  params: Promise<{ id: string }>;
}

const PLAN_LABELS: Record<string, string> = { TRIAL: "Essai", BASIC: "Basique", PREMIUM: "Premium", ENTERPRISE: "Entreprise" };
const STATUS_LABELS: Record<string, string> = { TRIALING: "En essai", ACTIVE: "Actif", INACTIVE: "Inactif", CANCELLED: "Annulé" };
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  TRIALING: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  INACTIVE: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  CANCELLED: "bg-red-500/10 text-red-600 border-red-500/30",
};
const PLAN_STYLES: Record<string, string> = {
  ENTERPRISE: "border-purple-500/30 text-purple-600 bg-purple-500/10",
  PREMIUM: "border-blue-500/30 text-blue-600 bg-blue-500/10",
};

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} FCFA`;
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const dayTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Jours restants avant une date (négatif : dépassée).
function daysUntil(d: Date | string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function Section({ title, icon: Icon, children, action }: { title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
      <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-0 border-slate-100 dark:border-slate-800 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-medium text-right text-slate-800 dark:text-slate-200">{children}</span>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone = "text-primary bg-primary/10" }: { icon: React.ElementType; label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white truncate">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// Jauge d'utilisation d'une limite de la licence (cliniques, utilisateurs).
function Usage({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color = used > max ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className={`font-semibold ${used > max ? "text-red-600" : "text-slate-800 dark:text-slate-200"}`}>
          {used} / {max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {used > max && <p className="text-xs text-red-600">Limite dépassée de {used - max}.</p>}
    </div>
  );
}

export default async function HoldingDetailPage({ params }: HoldingDetailPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "SUPER_ADMIN") redirect("/dashboard");

  const { id } = await params;
  const details = await getHoldingDetails(id);
  if (!details) notFound();

  const { holding, clinics, admins, staffByRole, recentUsers, totals } = details;
  const enabled = new Set(enabledModulesFrom(holding.disabledModules));
  const mainAdmin = admins[0] ?? null;
  const expiresIn = holding.licenseExpiresAt ? daysUntil(holding.licenseExpiresAt) : null;
  const nextPaymentIn = holding.nextPaymentDate ? daysUntil(holding.nextPaymentDate) : null;
  const balance = totals.income - totals.expense;

  // Même forme que sur la liste : le menu d'actions (modifier, modules, reçu...) est réutilisé tel quel.
  const menuHolding = {
    ...holding,
    adminUser: mainAdmin ? { firstName: mainAdmin.firstName, lastName: mainAdmin.lastName, email: mainAdmin.email } : null,
    _count: { children: totals.clinics, users: totals.staff, patients: totals.patients },
  };

  return (
    <div className="space-y-6">
      <Link href="/dashboard/holdings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Toutes les holdings
      </Link>

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 animate-fade-up">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex flex-wrap items-center gap-3">
              {holding.name}
              <Badge variant="outline" className={`text-xs uppercase font-bold tracking-wider ${PLAN_STYLES[holding.plan] ?? "border-slate-500/30 text-slate-600 bg-slate-500/10"}`}>
                {holding.plan === "ENTERPRISE" && <Crown className="h-3 w-3 mr-1 inline" />}
                {PLAN_LABELS[holding.plan] ?? holding.plan}
              </Badge>
              <Badge variant="outline" className={`text-xs uppercase font-bold ${STATUS_STYLES[holding.subscriptionStatus] ?? ""}`}>
                {STATUS_LABELS[holding.subscriptionStatus] ?? holding.subscriptionStatus}
              </Badge>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Client depuis le {day(holding.createdAt)} · Dernière modification le {day(holding.updatedAt)}
            </p>
          </div>
        </div>
        <HoldingActionsMenu holding={menuHolding} variant="detail" />
      </div>

      {/* Alertes */}
      {(expiresIn !== null && expiresIn <= 30) || (nextPaymentIn !== null && nextPaymentIn <= 7) || totals.clinics > holding.maxClinics || totals.staff > holding.maxUsers ? (
        <div className="space-y-2">
          {expiresIn !== null && expiresIn <= 30 && (
            <div className={`rounded-lg border px-4 py-2.5 text-sm ${expiresIn < 0 ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30"}`}>
              {expiresIn < 0 ? `La licence a expiré le ${day(holding.licenseExpiresAt)}.` : `La licence expire dans ${expiresIn} jour(s) (${day(holding.licenseExpiresAt)}).`}
            </div>
          )}
          {nextPaymentIn !== null && nextPaymentIn <= 7 && (
            <div className={`rounded-lg border px-4 py-2.5 text-sm ${nextPaymentIn < 0 ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30"}`}>
              {nextPaymentIn < 0 ? `Paiement en retard depuis le ${day(holding.nextPaymentDate)}.` : `Prochain paiement dans ${nextPaymentIn} jour(s) (${day(holding.nextPaymentDate)}).`}
            </div>
          )}
          {(totals.clinics > holding.maxClinics || totals.staff > holding.maxUsers) && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-700">
              Les limites de la licence sont dépassées (voir « Utilisation de la licence »).
            </div>
          )}
        </div>
      ) : null}

      {/* Indicateurs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Building2} label="Cliniques" value={totals.clinics} hint={`${totals.activeClinics} active(s) · limite ${holding.maxClinics}`} />
        <Kpi icon={Users} label="Personnel" value={totals.staff} hint={`${totals.activeStaff} compte(s) actif(s) · limite ${holding.maxUsers}`} tone="text-sky-600 bg-sky-500/10" />
        <Kpi icon={Activity} label="Patients" value={totals.patients} hint={`+${totals.newPatients30} sur les 30 derniers jours`} tone="text-rose-600 bg-rose-500/10" />
        <Kpi icon={TrendingUp} label="Recettes (30 j)" value={fcfa(totals.income30)} hint={`Dépenses 30 j : ${fcfa(totals.expense30)}`} tone="text-emerald-600 bg-emerald-500/10" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Abonnement */}
        <Section title="Abonnement & facturation" icon={Banknote}>
          <Row label="Forfait">{PLAN_LABELS[holding.plan] ?? holding.plan}</Row>
          <Row label="Statut">{STATUS_LABELS[holding.subscriptionStatus] ?? holding.subscriptionStatus}</Row>
          <Row label="Licence">
            {holding.licenseExpiresAt ? (
              <span className={expiresIn !== null && expiresIn < 0 ? "text-red-600" : expiresIn !== null && expiresIn <= 30 ? "text-amber-600" : ""}>
                Expire le {day(holding.licenseExpiresAt)}
              </span>
            ) : (
              <span className="text-emerald-600">Illimitée</span>
            )}
          </Row>
          <Row label="Tarif">
            {holding.paymentAmount != null ? `${fcfa(holding.paymentAmount)} / ${holding.paymentFrequency === "YEARLY" ? "an" : "mois"}` : "Non défini"}
          </Row>
          <Row label="Mode de paiement">
            {holding.paymentPlan === "INSTALLMENTS" ? `Échelonné${holding.installmentsCount ? ` (${holding.installmentsCount} tranches)` : ""}` : "Intégral"}
          </Row>
          {holding.paymentPlan === "INSTALLMENTS" && holding.paymentAmount != null && holding.installmentsCount ? (
            <Row label="Montant d'une tranche">{fcfa(holding.paymentAmount / holding.installmentsCount)}</Row>
          ) : null}
          <Row label="Prochain paiement">{day(holding.nextPaymentDate)}</Row>
          <Row label="Identifiant">
            <span className="font-mono text-xs text-slate-500">{holding.id}</span>
          </Row>
        </Section>

        {/* Limites */}
        <Section title="Utilisation de la licence" icon={ShieldCheck}>
          <div className="space-y-5">
            <Usage label="Cliniques" used={totals.clinics} max={holding.maxClinics} />
            <Usage label="Utilisateurs (personnel)" used={totals.staff} max={holding.maxUsers} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <FlaskConical className="h-4 w-4 mx-auto text-violet-500 mb-1" />
              <p className="text-lg font-bold">{totals.labOrders}</p>
              <p className="text-xs text-slate-500">Demandes labo</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <ScanLine className="h-4 w-4 mx-auto text-cyan-500 mb-1" />
              <p className="text-lg font-bold">{totals.radiologyOrders}</p>
              <p className="text-xs text-slate-500">Demandes imagerie</p>
            </div>
          </div>
        </Section>

        {/* Finances cumulées */}
        <Section title="Activité financière (cumul)" icon={TrendingUp}>
          <Row label="Recettes totales">
            <span className="text-emerald-600">{fcfa(totals.income)}</span>
          </Row>
          <Row label="Dépenses totales">
            <span className="text-red-600">{fcfa(totals.expense)}</span>
          </Row>
          <Row label="Solde">
            <span className={balance >= 0 ? "text-emerald-700" : "text-red-600"}>{fcfa(balance)}</span>
          </Row>
          <Row label="Recettes 30 derniers jours">{fcfa(totals.income30)}</Row>
          <Row label="Dépenses 30 derniers jours">{fcfa(totals.expense30)}</Row>
          <p className="mt-3 text-xs text-slate-400">Somme des opérations de caisse de toutes les cliniques de la holding.</p>
        </Section>
      </div>

      {/* Cliniques */}
      <Section title={`Cliniques (${clinics.length})`} icon={Building2}>
        {clinics.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">Aucune clinique rattachée à cette holding.</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-2 font-medium">Clinique</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium text-center">Statut</th>
                  <th className="px-3 py-2 font-medium text-right">Personnel</th>
                  <th className="px-3 py-2 font-medium text-right">Patients</th>
                  <th className="px-3 py-2 font-medium text-right">Recettes 30 j</th>
                  <th className="px-3 py-2 font-medium text-right">Recettes totales</th>
                  <th className="px-5 py-2 font-medium text-right">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {clinics.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/clinics/${c.id}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-primary">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 space-y-0.5">
                      {c.phone ? (
                        <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</p>
                      ) : null}
                      {c.address ? (
                        <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.address}</p>
                      ) : null}
                      {!c.phone && !c.address ? "—" : null}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {c.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><XCircle className="h-3.5 w-3.5" /> Suspendue</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">{c.staff}</td>
                    <td className="px-3 py-3 text-right">{c.patients}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{fcfa(c.income30)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">{fcfa(c.income)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{day(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Administrateurs */}
        <Section title={`Administrateurs (${admins.length})`} icon={UserCog}>
          {admins.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun administrateur au niveau de la holding.</p>
          ) : (
            <ul className="space-y-3">
              {admins.map((a, i) => (
                <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {a.firstName} {a.lastName}
                      {i === 0 && <Badge variant="outline" className="text-[10px]">Principal</Badge>}
                      {!a.isActive && <Badge variant="secondary" className="text-[10px]">Désactivé</Badge>}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {a.email}</p>
                    {a.phone && <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" /> {a.phone}</p>}
                  </div>
                  <div className="text-right text-xs text-slate-500 shrink-0">
                    <p>Dernière activité</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{dayTime(a.lastActiveAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Personnel par rôle */}
        <Section title="Personnel par rôle" icon={Users}>
          {staffByRole.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun membre du personnel.</p>
          ) : (
            <ul className="space-y-2">
              {staffByRole.map((r) => {
                const total = r.active + r.inactive;
                const pct = totals.staff > 0 ? Math.round((total / totals.staff) * 100) : 0;
                return (
                  <li key={r.role} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-700 dark:text-slate-300">{STAFF_ROLE_LABELS[r.role] ?? r.role}</span>
                      <span className="font-semibold">
                        {total}
                        {r.inactive > 0 && <span className="ml-1 text-xs font-normal text-slate-400">({r.inactive} désactivé{r.inactive > 1 ? "s" : ""})</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Modules */}
        <Section title={`Modules de la licence (${enabled.size}/${MODULE_KEYS.length})`} icon={Blocks}>
          <ul className="grid sm:grid-cols-2 gap-2">
            {MODULE_KEYS.map((key) => {
              const on = enabled.has(key);
              return (
                <li key={key} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-slate-200 dark:border-slate-800 opacity-60"}`}>
                  {on ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />}
                  <span className={on ? "text-slate-800 dark:text-slate-200" : "text-slate-500 line-through"}>{MODULES[key].label}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-400">Le socle (patients, dossier, rendez-vous, caisse, finance, équipe…) est toujours inclus.</p>
        </Section>

        {/* Dernières connexions */}
        <Section title="Dernières activités du personnel" icon={Clock}>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune activité enregistrée.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {STAFF_ROLE_LABELS[u.role] ?? u.role}
                      {u.organizationName ? ` · ${u.organizationName}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0 flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {dayTime(u.lastActiveAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {totals.expense > totals.income && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <TrendingDown className="h-3.5 w-3.5" /> Les dépenses cumulées dépassent les recettes.
        </p>
      )}
    </div>
  );
}
