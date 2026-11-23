"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useModules } from "@/components/modules-provider";
import { usePathname, useParams, useRouter } from "next/navigation";
import { 
  Activity, 
  LayoutDashboard, 
  Users, 
  Calendar, 
  AlertCircle, 
  MessageSquare, 
  Settings, 
  LogOut, 
  Sparkles,
  Bell,
  Menu,
  X,
  Stethoscope,
  Ticket,
  ScanLine,
  Siren,
  Scissors,
  Droplet,
  Building2,
  Server,
  Wallet,
  BookOpen,
  BookOpenCheck,
  ScrollText,
  FileSignature,
  ShieldCheck,
  MessageCircle,
  FlaskConical,
  HeartPulse,
  BedDouble,
  Banknote,
  PackageSearch,
  Baby,
  Handshake
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SECTION_PERMISSIONS, can } from "@/lib/permissions-catalog";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { ChevronDown } from "lucide-react";

interface SidebarProps {
  currentUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    phone: string | null;
    avatarUrl: string | null;
    organizationId?: string | null;
    organization?: { type: string } | null;
    // Permissions effectives (cf. src/lib/permissions-server.ts), lues par can().
    permissions?: string[];
  } | null;
  unreadCounts: {
    total: number;
    incident: number;
    appointment: number;
    message: number;
    ai: number;
    lab: number;
  };
  clinics?: { id: string; name: string }[];
  // Alertes réservées au SUPER_ADMIN : ne proviennent pas du modèle Notification,
  // calculées séparément dans src/app/dashboard/layout.tsx.
  superAdminAlerts?: { contactMessages: number; expiringLicenses: number };
}

export default function Sidebar({ currentUser, unreadCounts, clinics = [], superAdminAlerts }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Groupes du menu dépliés à la main (en plus de celui de la page ouverte, toujours déplié).
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (section: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  const pathname = usePathname();
  const enabledModules = useModules();
  const params = useParams();
  const router = useRouter();

  // Close mobile drawer when pathname changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const urlClinicId = params?.id as string | undefined;

  const isHoldingUser = currentUser?.organization?.type === "HOLDING";
  const isClinicUser = currentUser?.organization?.type === "CLINIC";

  let activeClinicId = "";
  if (isClinicUser) {
    activeClinicId = currentUser?.organizationId || "";
  } else if (isHoldingUser && urlClinicId) {
    activeClinicId = urlClinicId;
  }

  // Dynamic Navigation Items based on the active clinic context
  const navItems = [
    {
      name: "Tableau de bord",
      href: activeClinicId ? `/dashboard/clinics/${activeClinicId}` : "/dashboard",
      icon: LayoutDashboard,
      exact: true,
      section: "Aperçu",
    },
    {
      name: "Notifications",
      href: activeClinicId ? `/dashboard/clinics/${activeClinicId}/notifications` : "/dashboard/notifications",
      icon: Bell,
      count: unreadCounts?.total || 0,
      badgeColor: "bg-primary text-primary-foreground font-bold shadow-xs",
      permission: SECTION_PERMISSIONS.notifications,
      section: "Aperçu",
    },
    // If a clinic is active, render clinic-specific items
    ...(activeClinicId ? [
      {
        name: "Tableau de bord Médecin",
        href: `/dashboard/clinics/${activeClinicId}/medecin`,
        icon: HeartPulse,
        permission: SECTION_PERMISSIONS.medecin,
        section: "Aperçu",
      },
      {
        name: "Accueil & file d'attente",
        module: "ACCUEIL",
        href: `/dashboard/clinics/${activeClinicId}/accueil`,
        icon: Ticket,
        permission: SECTION_PERMISSIONS.accueil,
        section: "Patients",
      },
      {
        name: "Urgences",
        module: "URGENCES",
        href: `/dashboard/clinics/${activeClinicId}/urgences`,
        icon: Siren,
        iconClassName: "text-red-500",
        permission: SECTION_PERMISSIONS.urgences,
        section: "Patients",
      },
      {
        name: "Bloc opératoire",
        module: "BLOC",
        href: `/dashboard/clinics/${activeClinicId}/bloc`,
        icon: Scissors,
        iconClassName: "text-teal-600",
        permission: SECTION_PERMISSIONS.bloc,
        section: "Soins",
      },
      {
        name: "Banque de sang",
        module: "BANQUE_SANG",
        href: `/dashboard/clinics/${activeClinicId}/banque-sang`,
        icon: Droplet,
        iconClassName: "text-red-600",
        permission: SECTION_PERMISSIONS["banque-sang"],
        section: "Soins",
      },
      {
        name: "Patients",
        href: `/dashboard/clinics/${activeClinicId}/patients`,
        icon: Users,
        permission: SECTION_PERMISSIONS.patients,
        section: "Patients",
      },
      {
        name: "Calendrier",
        href: `/dashboard/clinics/${activeClinicId}/appointments`,
        icon: Calendar,
        count: unreadCounts?.appointment || 0,
        badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        permission: SECTION_PERMISSIONS.appointments,
        section: "Patients",
      },
      {
        name: "Incidents",
        href: `/dashboard/clinics/${activeClinicId}/incidents`,
        icon: AlertCircle,
        count: unreadCounts?.incident || 0,
        badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse",
        permission: SECTION_PERMISSIONS.incidents,
        section: "Outils",
      },
      {
        name: "Laboratoire",
        module: "LABORATOIRE",
        href: `/dashboard/clinics/${activeClinicId}/lab`,
        icon: FlaskConical,
        count: unreadCounts?.lab || 0,
        badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse",
        permission: SECTION_PERMISSIONS.lab,
        section: "Examens",
      },
      {
        name: "Imagerie",
        module: "IMAGERIE",
        href: `/dashboard/clinics/${activeClinicId}/imagerie`,
        icon: ScanLine,
        permission: SECTION_PERMISSIONS.imagerie,
        section: "Examens",
      },
      {
        name: "Maternité",
        module: "MATERNITE",
        href: `/dashboard/clinics/${activeClinicId}/maternite`,
        icon: Baby,
        permission: SECTION_PERMISSIONS.maternite,
        section: "Soins",
      },
      {
        name: "Chambres & Lits",
        module: "HOSPITALISATION",
        href: `/dashboard/clinics/${activeClinicId}/rooms`,
        icon: BedDouble,
        permission: SECTION_PERMISSIONS.rooms,
        section: "Soins",
      },
      {
        name: "Ronde médicale",
        module: "HOSPITALISATION",
        href: `/dashboard/clinics/${activeClinicId}/ronde`,
        icon: Stethoscope,
        permission: SECTION_PERMISSIONS.ronde,
        section: "Soins",
      },
      {
        name: "Assistant Clinique IA",
        module: "IA",
        href: `/dashboard/clinics/${activeClinicId}/ai-assistant`,
        icon: Sparkles,
        iconClassName: "text-violet-500",
        count: unreadCounts?.ai || 0,
        badgeColor: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
        permission: SECTION_PERMISSIONS["ai-assistant"],
        section: "Outils",
      },
      {
        name: "Caisse",
        href: `/dashboard/clinics/${activeClinicId}/caisse`,
        icon: Banknote,
        permission: SECTION_PERMISSIONS.caisse,
        section: "Caisse & pharmacie",
      },
      {
        name: "Pharmacie",
        module: "PHARMACIE",
        href: `/dashboard/clinics/${activeClinicId}/pharmacie`,
        icon: PackageSearch,
        permission: SECTION_PERMISSIONS.pharmacie,
        section: "Caisse & pharmacie",
      },
      {
        name: "Finance",
        href: `/dashboard/clinics/${activeClinicId}/finance`,
        icon: Wallet,
        permission: SECTION_PERMISSIONS.finance,
        section: "Gestion",
      },
      {
        name: "Comptabilité",
        module: "COMPTABILITE",
        href: `/dashboard/clinics/${activeClinicId}/comptabilite`,
        icon: BookOpenCheck,
        permission: SECTION_PERMISSIONS.comptabilite,
        section: "Gestion",
      },
      {
        name: "Relevés partenaires",
        module: "LABORATOIRE",
        href: `/dashboard/clinics/${activeClinicId}/partenaires`,
        icon: Handshake,
        permission: SECTION_PERMISSIONS.partenaires,
        section: "Gestion",
      },
      {
        name: "Contrats aidants",
        module: "CONTRATS_AIDANTS",
        href: `/dashboard/clinics/${activeClinicId}/contracts`,
        icon: FileSignature,
        permission: SECTION_PERMISSIONS.contracts,
        section: "Gestion",
      },
      {
        // Paramètres de la clinique : services, partenaires, logo, fonctionnement (caisse, consultation).
        name: "Configuration",
        href: `/dashboard/clinics/${activeClinicId}/settings`,
        icon: Settings,
        roles: ["ADMIN", "COORDINATOR"],
        section: "Administration",
      },
      {
        name: "Équipe médicale",
        href: `/dashboard/clinics/${activeClinicId}/team`,
        icon: Stethoscope,
        permission: SECTION_PERMISSIONS.team,
        section: "Administration",
      },
      {
        // Ce que chaque rôle peut faire, rôles propres à la clinique (cf. ClinicRole).
        name: "Rôles et permissions",
        href: `/dashboard/clinics/${activeClinicId}/roles`,
        icon: ShieldCheck,
        permission: SECTION_PERMISSIONS.roles,
        section: "Administration",
      },
      {
        name: "Journal d'audit",
        href: `/dashboard/clinics/${activeClinicId}/audit-log`,
        icon: ScrollText,
        permission: SECTION_PERMISSIONS["audit-log"],
        section: "Administration",
      },
      {
        name: "Messagerie",
        href: `/dashboard/clinics/${activeClinicId}/messages`,
        icon: MessageSquare,
        count: unreadCounts?.message || 0,
        badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        permission: SECTION_PERMISSIONS.messages,
        section: "Outils",
      },
      {
        name: "Manuel d'utilisation",
        href: `/dashboard/clinics/${activeClinicId}/manual`,
        icon: BookOpen,
        permission: SECTION_PERMISSIONS.manual,
        section: "Outils",
      },
    ] : [
      {
        name: "Laboratoire",
        module: "LABORATOIRE",
        href: "/dashboard/lab",
        icon: FlaskConical,
        count: unreadCounts?.lab || 0,
        badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse",
        permission: SECTION_PERMISSIONS.lab,
        section: "Examens",
      },
      {
        name: "Caisse",
        href: "/dashboard/caisse",
        icon: Banknote,
        permission: SECTION_PERMISSIONS.caisse,
        section: "Caisse & pharmacie",
      },
      {
        name: "Pharmacie",
        module: "PHARMACIE",
        href: "/dashboard/pharmacie",
        icon: PackageSearch,
        permission: SECTION_PERMISSIONS.pharmacie,
        section: "Caisse & pharmacie",
      },
      {
        name: "Finance",
        href: "/dashboard/finance",
        icon: Wallet,
        permission: SECTION_PERMISSIONS.finance,
        section: "Gestion",
      },
      {
        name: "Contrats aidants",
        module: "CONTRATS_AIDANTS",
        href: "/dashboard/contracts",
        icon: FileSignature,
        permission: SECTION_PERMISSIONS.contracts,
        section: "Gestion",
      },
      {
        name: "Équipe médicale",
        href: "/dashboard/team",
        icon: Stethoscope,
        permission: SECTION_PERMISSIONS.team,
        section: "Administration",
      },
      {
        name: "Journal d'audit",
        href: "/dashboard/audit-log",
        icon: ScrollText,
        permission: SECTION_PERMISSIONS["audit-log"],
        section: "Administration",
      },
      {
        name: "Messagerie",
        href: "/dashboard/messages",
        icon: MessageSquare,
        count: unreadCounts?.message || 0,
        badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        permission: SECTION_PERMISSIONS.messages,
        section: "Outils",
      },
      {
        name: "Manuel d'utilisation",
        href: "/dashboard/manual",
        icon: BookOpen,
        permission: SECTION_PERMISSIONS.manual,
        section: "Outils",
      },
    ]),
    ...(!activeClinicId ? [
      {
        name: "Cliniques",
        href: "/dashboard/clinics",
        icon: Building2,
        roles: ['ADMIN'],
        isHoldingOnly: true,
        section: "Administration",
      }
    ] : []),
    {
      name: "Toutes les Holdings",
      href: "/dashboard/holdings",
      icon: Server,
      count: superAdminAlerts?.expiringLicenses || 0,
      badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      permission: SECTION_PERMISSIONS.holdings,
      section: "Plateforme",
    },
    {
      name: "Messages de contact",
      href: "/dashboard/contact-messages",
      icon: MessageCircle,
      count: superAdminAlerts?.contactMessages || 0,
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      permission: SECTION_PERMISSIONS["contact-messages"],
      section: "Plateforme",
    },
  ];

  // Ordre d'affichage des sections dans la sidebar (une section vide après filtrage par rôle
  // ne s'affiche simplement pas — cf. renderNavLinks).
  // Groupes du menu, par métier. « Aperçu » reste toujours ouvert ; les autres se replient (cf.
  // renderNavLinks) pour ne pas noyer l'utilisateur sous une vingtaine d'entrées.
  const SECTION_ORDER = ["Aperçu", "Patients", "Soins", "Examens", "Caisse & pharmacie", "Gestion", "Administration", "Outils", "Plateforme"];

  const isActive = (item: typeof navItems[0]) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  const getLinkClass = (item: typeof navItems[0]) => {
    const active = isActive(item);
    return `flex items-center gap-3 rounded-lg py-2.5 px-3 text-sm font-medium transition-all duration-300 relative group ${
      active
        ? "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-xs"
        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 hover:text-blue-600 dark:hover:text-blue-400 hover:translate-x-1"
    }`;
  };

  const handleClinicChange = (newId: string) => {
    if (!newId) {
      router.push("/dashboard");
    } else {
      // If we are currently inside a nested page segment like patients, team, appointments etc.
      // preserve the segment during switch, otherwise default to detail page.
      const segments = pathname.split("/");
      // Path format: /dashboard/clinics/[oldId]/[tab]
      if (segments.includes("clinics") && segments.length >= 5) {
        const tab = segments[4];
        router.push(`/dashboard/clinics/${newId}/${tab}`);
      } else {
        router.push(`/dashboard/clinics/${newId}`);
      }
    }
  };

  const renderClinicSwitcher = () => {
    if (!isHoldingUser || clinics.length === 0) return null;

    return (
      <div className="mb-4 space-y-1.5">
        <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block px-2">
          Clinique active
        </label>
        <select
          value={activeClinicId}
          onChange={(e) => handleClinicChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-background/50 text-slate-800 dark:text-slate-200 px-3 py-2 text-xs font-semibold shadow-xs focus:ring-1 focus:ring-primary focus:outline-none transition-all cursor-pointer"
        >
          <option value="">-- Toutes les cliniques --</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              🏥 {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderNavLinks = () => {
    const filteredNavItems = navItems.filter((item: any) => {
      if (!currentUser) return !item.roles;
      if (item.roles && !item.roles.includes(currentUser.role)) return false;
      if (item.permission && !can(currentUser, item.permission)) return false;
      // Module hors licence de l'établissement (cf. src/lib/modules.ts) : entrée masquée.
      if (item.module && !enabledModules.includes(item.module)) return false;
      if (item.isHoldingOnly && currentUser.organization?.type !== 'HOLDING') return false;
      return true;
    });

    const renderLink = (item: any) => {
      const active = isActive(item);
      const Icon = item.icon;
      return (
        // Ces liens sont visibles en permanence (menu latéral) : le préchargement automatique
        // de Next.js déclenchait un rendu serveur en arrière-plan pour CHAQUE lien du menu à
        // chaque navigation (~15-20 requêtes parasites par changement de page, mesuré). Comme
        // ces pages sont toutes force-dynamic, ce préchargement n'apporte rien — le nouveau
        // cache d'aperçu instantané (loading.tsx) remplit déjà ce rôle.
        <Link key={item.href} href={item.href} className={getLinkClass(item)} prefetch={false}>
          {/* Visual active left border accent */}
          {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-r-full shadow-md shadow-blue-500/50" />
          )}
          <Icon
            className={`h-4 w-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${
              item.iconClassName || ""
            }`}
          />
          <span>{item.name}</span>
          {item.count !== undefined && item.count > 0 && (
            <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold border transition-all duration-300 ${item.badgeColor}`}>
              {item.count}
            </span>
          )}
        </Link>
      );
    };

    // Peu d'entrées (accueil, laborantin, caissier...) : tout reste déplié, rien à chercher.
    const collapsible = filteredNavItems.length > 10;
    return (
      <nav className="grid items-start gap-3">
        {SECTION_ORDER.map((section) => {
          const items = filteredNavItems.filter((item: any) => item.section === section);
          if (items.length === 0) return null;
          const hasActive = items.some((item: any) => isActive(item));
          const canCollapse = collapsible && section !== "Aperçu";
          const open = !canCollapse || hasActive || openSections.has(section);
          return (
            <div key={section} className="grid gap-1">
              {canCollapse ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  aria-expanded={open}
                  className="flex items-center justify-between rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"
                >
                  {section}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
              ) : (
                <p className="px-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{section}</p>
              )}
              {open && items.map(renderLink)}
            </div>
          );
        })}
      </nav>
    );
  };

  const renderUserSection = () => {
    if (!currentUser) return null;
    return (
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 transition-all duration-300 hover:bg-white dark:hover:bg-slate-800/60 hover:shadow-xs hover:border-slate-200 dark:hover:border-slate-800">
        <Avatar className="h-9 w-9 border border-slate-200/60 dark:border-slate-800/60">
          <AvatarImage src={currentUser.avatarUrl || ""} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold">
            {currentUser.lastName[0] || ""}{currentUser.firstName[0] || ""}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200 leading-none truncate">
            {currentUser.firstName} {currentUser.lastName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1.5 leading-none">
            {STAFF_ROLE_LABELS[currentUser.role] ?? ({ SUPER_ADMIN: "Équipe MedDoc", PATIENT: "Patient", FAMILY: "Proche" } as Record<string, string>)[currentUser.role] ?? currentUser.role}
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar (hidden on mobile, shown on lg screens) */}
      <aside className="hidden w-64 flex-col border-r border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/75 backdrop-blur-md lg:flex h-screen sticky top-0 z-30 shadow-sm">
        <div className="flex h-16 items-center border-b border-slate-200/50 dark:border-slate-800/50 px-6">
          <Link className="flex items-center gap-2 font-bold" href="/dashboard">
            <Activity className="h-6 w-6 text-primary" />
            <span className="text-xl text-primary font-bold">MedDoc</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-4 px-4">
          {renderClinicSwitcher()}
          {renderNavLinks()}
        </div>

        <div className="border-t border-slate-200/50 dark:border-slate-800/50 p-4 flex flex-col gap-3">
          {renderUserSection()}
          <nav className="grid gap-1">
            <Link
              href="/dashboard/settings"
              prefetch={false}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300 hover:translate-x-1 group ${
                pathname.startsWith("/dashboard/settings")
                  ? "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 hover:text-blue-600 dark:hover:text-blue-400"
              }`}
            >
              <Settings className="h-4 w-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12" />
              <span>Paramètres</span>
            </Link>
            <a
              href="/api/auth/logout"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 dark:hover:bg-red-500/15 hover:translate-x-1 transition-all duration-300 ease-out group"
            >
              <LogOut className="h-4 w-4 transition-all duration-300 group-hover:scale-110 group-hover:translate-x-0.5" />
              <span>Déconnexion</span>
            </a>
          </nav>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/75 backdrop-blur-md px-6 lg:hidden">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsOpen(true)}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-primary focus:outline-none transition-colors relative"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-6 w-6" />
            {unreadCounts?.total > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
          </button>
          <Link className="flex items-center gap-2 font-bold" href="/dashboard">
            <Activity className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">MedDoc</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/dashboard/notifications" 
            className="p-1.5 rounded-xl hover:bg-slate-100/60 dark:hover:bg-slate-800/60 text-slate-500 hover:text-primary relative transition-all"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCounts?.total > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                {unreadCounts.total}
              </span>
            )}
          </Link>
          {currentUser && (
            <Avatar className="h-8 w-8 border border-border">
              <AvatarImage src={currentUser.avatarUrl || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {currentUser.lastName[0] || ""}{currentUser.firstName[0] || ""}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </header>

      {/* Mobile Drawer (Backdrop & Sidebar panel) */}
      <div 
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-300 lg:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      <div 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white/95 dark:bg-slate-900/95 border-r border-slate-200/50 dark:border-slate-800/50 flex flex-col p-4 shadow-xl transition-transform duration-300 ease-in-out lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b pb-4 mb-4">
          <Link className="flex items-center gap-2 font-bold" href="/dashboard" onClick={() => setIsOpen(false)}>
            <Activity className="h-6 w-6 text-primary" />
            <span className="text-xl text-primary font-bold">MedDoc</span>
          </Link>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-primary focus:outline-none transition-colors"
            aria-label="Fermer le menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {renderClinicSwitcher()}
          {renderNavLinks()}
        </div>

        <div className="border-t border-slate-200/50 dark:border-slate-800/50 pt-4 flex flex-col gap-3">
          {renderUserSection()}
          <nav className="grid gap-1">
            <Link
              href="/dashboard/settings"
              prefetch={false}
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300 hover:translate-x-1 group ${
                pathname.startsWith("/dashboard/settings")
                  ? "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 hover:text-blue-600 dark:hover:text-blue-400"
              }`}
            >
              <Settings className="h-4 w-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12" />
              <span>Paramètres</span>
            </Link>
            <a
              href="/api/auth/logout"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 dark:hover:bg-red-500/15 hover:translate-x-1 transition-all duration-300 ease-out group"
            >
              <LogOut className="h-4 w-4 transition-all duration-300 group-hover:scale-110 group-hover:translate-x-0.5" />
              <span>Déconnexion</span>
            </a>
          </nav>
        </div>
      </div>
    </>
  );
}
