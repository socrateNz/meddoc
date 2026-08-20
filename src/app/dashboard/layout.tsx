import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import SidebarData from "./sidebar-data";
import SidebarSkeleton from "./sidebar-skeleton";

export const dynamic = "force-dynamic";

import { OfflineBanner } from "@/components/ui/offline-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  if (currentUser && currentUser.requiresPasswordChange) {
    redirect("/setup-password");
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-slate-50/80 to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 relative">
      {/* Decorative background glow circles */}
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-blue-400/10 dark:bg-blue-600/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute -bottom-[20%] left-[20%] w-[500px] h-[500px] rounded-full bg-violet-400/10 dark:bg-violet-600/5 blur-[120px] pointer-events-none z-0" />

      {/* Sidebar : notifications/cliniques/alertes chargées dans leur propre boundary Suspense,
          pour ne jamais retarder l'affichage de {children} en dessous. */}
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarData currentUser={currentUser} />
      </Suspense>

      {/* Main Content */}
      <main className="flex flex-1 flex-col h-full min-h-0 overflow-hidden relative z-10">
        <OfflineBanner />
        <div className="flex-1 p-6 lg:p-8 flex flex-col overflow-y-auto min-h-0">
          {children}
        </div>
      </main>
    </div>
  );
}

