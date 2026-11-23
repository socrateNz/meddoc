import Link from "next/link";
import {
  BedDouble,
  Calculator,
  CalendarPlus,
  FlaskConical,
  HeartPulse,
  type LucideIcon,
  Pill,
  Receipt,
  Siren,
  Stethoscope,
  Ticket,
  UserPlus,
  Users,
  Warehouse,
} from "lucide-react";
import { can, type Permission, type PermissionSubject } from "@/lib/permissions-catalog";
import type { ModuleKey } from "@/lib/modules";

// « Mes actions du jour » : les 4 tâches les plus courantes du rôle de l'utilisateur, en gros
// boutons, en tête de son tableau de bord. Déduites de ses permissions (rôle ajusté par la clinique
// compris) : l'ordre ci-dessous est celui de la priorité métier — la première action utile à un
// rôle est celle qu'il fait le plus souvent.
type Action = { label: string; hint: string; segment: string; icon: LucideIcon; permission: Permission; module?: ModuleKey; tone: string };

const ACTIONS: Action[] = [
  { label: "Mes consultations", hint: "Patients du jour", segment: "medecin", icon: Stethoscope, permission: "dashboard.doctor", tone: "from-blue-500 to-indigo-500" },
  { label: "Remettre des médicaments", hint: "Ordonnances à servir", segment: "pharmacie", icon: Pill, permission: "pharmacy.dispense", module: "PHARMACIE", tone: "from-emerald-500 to-teal-500" },
  { label: "Encaisser un ticket", hint: "Tickets en attente", segment: "caisse", icon: Receipt, permission: "register.operate", tone: "from-amber-500 to-orange-500" },
  { label: "Enregistrer une arrivée", hint: "Ticket et orientation", segment: "accueil", icon: Ticket, permission: "visits.register", module: "ACCUEIL", tone: "from-sky-500 to-blue-500" },
  { label: "Résultats à valider", hint: "Laboratoire", segment: "lab", icon: FlaskConical, permission: "lab.validate", module: "LABORATOIRE", tone: "from-violet-500 to-purple-500" },
  { label: "Saisir des résultats", hint: "Laboratoire", segment: "lab", icon: FlaskConical, permission: "lab.operate", module: "LABORATOIRE", tone: "from-violet-500 to-purple-500" },
  { label: "Urgences", hint: "Tri et prise en charge", segment: "urgences", icon: Siren, permission: "triage.write", module: "URGENCES", tone: "from-rose-500 to-red-500" },
  { label: "Ronde médicale", hint: "Patients hospitalisés", segment: "ronde", icon: HeartPulse, permission: "rounds.run", module: "HOSPITALISATION", tone: "from-pink-500 to-rose-500" },
  { label: "Lits et admissions", hint: "Chambres et séjours", segment: "rooms", icon: BedDouble, permission: "rooms.operate", module: "HOSPITALISATION", tone: "from-cyan-500 to-sky-500" },
  { label: "Nouveau patient", hint: "Créer un dossier", segment: "patients", icon: UserPlus, permission: "patients.create", tone: "from-blue-500 to-cyan-500" },
  { label: "Prendre un rendez-vous", hint: "Calendrier", segment: "appointments", icon: CalendarPlus, permission: "appointments.schedule", tone: "from-indigo-500 to-blue-500" },
  { label: "Stock et achats", hint: "Pharmacie", segment: "pharmacie", icon: Warehouse, permission: "stock.write", module: "PHARMACIE", tone: "from-emerald-500 to-green-500" },
  { label: "Comptabilité", hint: "Saisies et états", segment: "comptabilite", icon: Calculator, permission: "accounting.write", module: "COMPTABILITE", tone: "from-slate-500 to-slate-700" },
  { label: "Équipe", hint: "Membres et rôles", segment: "team", icon: Users, permission: "team.manage", tone: "from-slate-500 to-slate-700" },
];

// Une page n'apparaît qu'une fois (ex : valider OU saisir des résultats), quatre actions au plus.
export function quickActionsFor(user: PermissionSubject, modules: readonly string[], max = 4, exclude?: string): Action[] {
  const out: Action[] = [];
  const seen = new Set<string>();
  for (const action of ACTIONS) {
    if (out.length >= max) break;
    if (seen.has(action.segment) || action.segment === exclude) continue;
    if (!can(user, action.permission)) continue;
    if (action.module && !modules.includes(action.module)) continue;
    // Patients : la page liste exige aussi de pouvoir lire les dossiers.
    if (action.segment === "patients" && !can(user, "records.read")) continue;
    seen.add(action.segment);
    out.push(action);
  }
  return out;
}

// `exclude` : la page où l'on est déjà (ex : le tableau de bord du médecin).
export default function QuickActions({ clinicId, user, modules, exclude }: { clinicId: string; user: PermissionSubject; modules: readonly string[]; exclude?: string }) {
  const actions = quickActionsFor(user, modules, 4, exclude);
  if (actions.length === 0) return null;
  return (
    <section aria-label="Mes actions du jour" className="space-y-3">
      <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">Mes actions du jour</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={`/dashboard/clinics/${clinicId}/${a.segment}`}
            prefetch={false}
            className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900"
          >
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${a.tone} text-white shadow-sm`}>
              <a.icon className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-slate-900 dark:text-white">{a.label}</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400">{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
