"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  Building2,
  Server,
  Wallet,
  BookOpen,
  ScrollText,
  FileSignature,
  ShieldCheck,
  MessageCircle,
  FlaskConical,
  HeartPulse,
  BedDouble
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  const pathname = usePathname();
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
      roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER', 'PHARMACIST', 'SUPER_ADMIN'],
      section: "Aperçu",
    },
    // If a clinic is active, render clinic-specific items
    ...(activeClinicId ? [
      {
        name: "Tableau de bord Médecin",
        href: `/dashboard/clinics/${activeClinicId}/medecin`,
        icon: HeartPulse,
        roles: ['MEDECIN'],
        section: "Clinique",
      },
      {
        name: "Patients",
        href: `/dashboard/clinics/${activeClinicId}/patients`,
        icon: Users,
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER'],
        section: "Clinique",
      },
      {
        name: "Rendez-vous",
        href: `/dashboard/clinics/${activeClinicId}/appointments`,
        icon: Calendar,
        count: unreadCounts?.appointment || 0,
        badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER', 'PHARMACIST'],
        section: "Clinique",
      },
      {
        name: "Incidents",
        href: `/dashboard/clinics/${activeClinicId}/incidents`,
        icon: AlertCircle,
        count: unreadCounts?.incident || 0,
        badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse",
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER'],
        section: "Clinique",
      },
      {
        name: "Laboratoire",
        href: `/dashboard/clinics/${activeClinicId}/lab`,
        icon: FlaskConical,
        count: unreadCounts?.lab || 0,
        badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse",
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER'],
        section: "Clinique",
      },
      {
        name: "Chambres & Lits",
        href: `/dashboard/clinics/${activeClinicId}/rooms`,
        icon: BedDouble,
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER'],
        section: "Clinique",
      },
      {
        name: "Assistant Clinique IA",
        href: `/dashboard/clinics/${activeClinicId}/ai-assistant`,
        icon: Sparkles,
        iconClassName: "text-violet-500",
        count: unreadCounts?.ai || 0,
        badgeColor: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN'],
        section: "Clinique",
      },
      {
        name: "Finance & Pharmacie",
        href: `/dashboard/clinics/${activeClinicId}/finance`,
        icon: Wallet,
        roles: ['ADMIN', 'COORDINATOR', 'PHARMACIST'],
        section: "Finance",
      },
      {
        name: "Contrats aidants",
        href: `/dashboard/clinics/${activeClinicId}/contracts`,
        icon: FileSignature,
        roles: ['ADMIN', 'COORDINATOR'],
        section: "Finance",
      },
      {
        name: "Équipe médicale",
        href: `/dashboard/clinics/${activeClinicId}/team`,
        icon: Stethoscope,
        roles: ['ADMIN', 'COORDINATOR'],
        section: "Administration",
      },
      {
        name: "Journal d'audit",
        href: `/dashboard/clinics/${activeClinicId}/audit-log`,
        icon: ScrollText,
        roles: ['ADMIN'],
        section: "Administration",
      },
      {
        name: "Messagerie",
        href: `/dashboard/clinics/${activeClinicId}/messages`,
        icon: MessageSquare,
        count: unreadCounts?.message || 0,
        badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER', 'PHARMACIST'],
        section: "Autres",
      },
      {
        name: "Manuel d'utilisation",
        href: `/dashboard/clinics/${activeClinicId}/manual`,
        icon: BookOpen,
        roles: ['SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER', 'PHARMACIST', 'FAMILY', 'PATIENT'],
        section: "Autres",
      },
    ] : [
      {
        name: "Laboratoire",
        href: "/dashboard/lab",
        icon: FlaskConical,
        count: unreadCounts?.lab || 0,
        badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse",
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER'],
        section: "Clinique",
      },
      {
        name: "Finance & Pharmacie",
        href: "/dashboard/finance",
        icon: Wallet,
        roles: ['ADMIN', 'COORDINATOR', 'PHARMACIST'],
        section: "Finance",
      },
      {
        name: "Contrats aidants",
        href: "/dashboard/contracts",
        icon: FileSignature,
        roles: ['ADMIN', 'COORDINATOR'],
        section: "Finance",
      },
      {
        name: "Équipe médicale",
        href: "/dashboard/team",
        icon: Stethoscope,
        roles: ['ADMIN', 'COORDINATOR'],
        section: "Administration",
      },
      {
        name: "Journal d'audit",
        href: "/dashboard/audit-log",
        icon: ScrollText,
        roles: ['ADMIN'],
        section: "Administration",
      },
      {
        name: "Messagerie",
        href: "/dashboard/messages",
        icon: MessageSquare,
        count: unreadCounts?.message || 0,
        badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        roles: ['ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER', 'PHARMACIST'],
        section: "Autres",
      },
      {
        name: "Manuel d'utilisation",
        href: "/dashboard/manual",
        icon: BookOpen,
        roles: ['SUPER_ADMIN', 'ADMIN', 'COORDINATOR', 'MEDECIN', 'CAREGIVER', 'PHARMACIST', 'FAMILY', 'PATIENT'],
        section: "Autres",
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
      name: "Permissions",
      href: "/dashboard/permissions",
      icon: ShieldCheck,
      roles: ['ADMIN'],
      section: "Administration",
    },
    {
      name: "Toutes les Holdings",
      href: "/dashboard/holdings",
      icon: Server,
      count: superAdminAlerts?.expiringLicenses || 0,
      badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      roles: ['SUPER_ADMIN'],
      section: "Plateforme",
    },
    {
      name: "Messages de contact",
      href: "/dashboard/contact-messages",
      icon: MessageCircle,
      count: superAdminAlerts?.contactMessages || 0,
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      roles: ['SUPER_ADMIN'],
      section: "Plateforme",
    },
  ];

  // Ordre d'affichage des sections dans la sidebar (une section vide après filtrage par rôle
  // ne s'affiche simplement pas — cf. renderNavLinks).
  const SECTION_ORDER = ["Aperçu", "Clinique", "Finance", "Administration", "Plateforme", "Autres"];

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
        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block px-2">
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
      if (item.isHoldingOnly && currentUser.organization?.type !== 'HOLDING') return false;
      return true;
    });

    const renderLink = (item: any) => {
      const active = isActive(item);
      const Icon = item.icon;
      return (
        <Link key={item.href} href={item.href} className={getLinkClass(item)}>
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
            <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold border transition-all duration-300 ${item.badgeColor}`}>
              {item.count}
            </span>
          )}
        </Link>
      );
    };

    return (
      <nav className="grid items-start gap-4">
        {SECTION_ORDER.map((section) => {
          const items = filteredNavItems.filter((item: any) => item.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="grid gap-1">
              <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {section}
              </p>
              {items.map(renderLink)}
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
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold mt-1.5 leading-none">
            {currentUser.role.toLowerCase()}
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
