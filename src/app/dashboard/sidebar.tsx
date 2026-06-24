"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  X
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
  } | null;
}

export default function Sidebar({ currentUser }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

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

  const navItems = [
    {
      name: "Tableau de bord",
      href: "/dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      name: "Patients",
      href: "/dashboard/patients",
      icon: Users,
    },
    {
      name: "Rendez-vous",
      href: "/dashboard/appointments",
      icon: Calendar,
    },
    {
      name: "Incidents",
      href: "/dashboard/incidents",
      icon: AlertCircle,
    },
    {
      name: "Messagerie",
      href: "/dashboard/messages",
      icon: MessageSquare,
    },
    {
      name: "Notifications",
      href: "/dashboard/notifications",
      icon: Bell,
    },
    {
      name: "Assistant Clinique IA",
      href: "/dashboard/ai-assistant",
      icon: Sparkles,
      iconClassName: "text-violet-500",
    },
  ];

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

  const renderNavLinks = () => (
    <nav className="grid items-start gap-1">
      {navItems.map((item) => {
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
          </Link>
        );
      })}
    </nav>
  );

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
            <Link
              href="/login"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 dark:hover:bg-red-500/15 hover:translate-x-1 transition-all duration-300 ease-out group"
            >
              <LogOut className="h-4 w-4 transition-all duration-300 group-hover:scale-110 group-hover:translate-x-0.5" />
              <span>Déconnexion</span>
            </Link>
          </nav>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/75 backdrop-blur-md px-6 lg:hidden">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsOpen(true)}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-primary focus:outline-none transition-colors"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link className="flex items-center gap-2 font-bold" href="/dashboard">
            <Activity className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">MedDoc</span>
          </Link>
        </div>
        {currentUser && (
          <Avatar className="h-8 w-8 border border-border">
            <AvatarImage src={currentUser.avatarUrl || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {currentUser.lastName[0] || ""}{currentUser.firstName[0] || ""}
            </AvatarFallback>
          </Avatar>
        )}
      </header>

      {/* Mobile Drawer (Backdrop & Sidebar panel) */}
      {/* Backdrop */}
      <div 
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-300 lg:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Slide-out Sidebar Panel */}
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
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 dark:hover:bg-red-500/15 hover:translate-x-1 transition-all duration-300 ease-out group"
            >
              <LogOut className="h-4 w-4 transition-all duration-300 group-hover:scale-110 group-hover:translate-x-0.5" />
              <span>Déconnexion</span>
            </Link>
          </nav>
        </div>
      </div>
    </>
  );
}
