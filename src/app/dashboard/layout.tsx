import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import SidebarData from "./sidebar-data";
import SidebarSkeleton from "./sidebar-skeleton";

export const dynamic = "force-dynamic";
// S'applique à toutes les routes /dashboard/* (Server Actions et Route Handlers déclenchés
// depuis elles y compris) — un fichier "use server" n'autorisant pas cet export lui-même
// (seules les fonctions async y sont permises, cf. src/actions/stock.ts et finance.ts), le poser
// ici sur le layout partagé couvre chaque page sans avoir à traquer individuellement laquelle
// invoque une action à transaction longue (saveInventoryCounts/completeInventoryCount sur un
// grand catalogue, dispensePendingInvoice/cancelDispense) — sinon Vercel coupe la fonction à la
// limite par défaut du plan (souvent 10s) avant même que Prisma n'atteigne son propre timeout.
export const maxDuration = 60;

import { OfflineBanner } from "@/components/ui/offline-banner";
import PushNotificationsInit from "@/components/push-notifications-init";

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
        <PushNotificationsInit />
        <OfflineBanner />
        <div className="flex-1 p-6 lg:p-8 flex flex-col overflow-y-auto min-h-0">
          {children}
        </div>
      </main>
    </div>
  );
}

