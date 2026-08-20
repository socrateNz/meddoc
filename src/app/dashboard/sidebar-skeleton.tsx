import { Activity } from "lucide-react";

// Fallback affiché pendant que <SidebarData> résout ses requêtes (notifications, cliniques,
// alertes). Reprend exactement la géométrie de src/app/dashboard/sidebar.tsx (largeur,
// hauteur d'en-tête) pour qu'il n'y ait aucun saut de mise en page à la résolution.
export default function SidebarSkeleton() {
  return (
    <>
      <aside className="hidden w-64 flex-col border-r border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/75 backdrop-blur-md lg:flex h-screen sticky top-0 z-30 shadow-sm">
        <div className="flex h-16 items-center border-b border-slate-200/50 dark:border-slate-800/50 px-6">
          <div className="flex items-center gap-2 font-bold">
            <Activity className="h-6 w-6 text-primary" />
            <span className="text-xl text-primary font-bold">MedDoc</span>
          </div>
        </div>
        <div className="flex-1 space-y-2 p-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
          ))}
        </div>
      </aside>

      <header className="flex h-16 items-center border-b border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/75 backdrop-blur-md px-6 lg:hidden">
        <div className="flex items-center gap-2 font-bold">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-xl text-primary font-bold">MedDoc</span>
        </div>
      </header>
    </>
  );
}
