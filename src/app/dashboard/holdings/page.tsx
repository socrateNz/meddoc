import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getHoldings } from "@/actions/super-admin";
import NewHoldingDialog from "./new-holding-dialog";
import HoldingActionsMenu from "./holding-actions-menu";
import { Server, Building2, Users, Activity, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function HoldingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const { holdings } = await getHoldings();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-2 animate-fade-up">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl flex items-center gap-3">
            <Server className="h-8 w-8 text-primary" />
            Gestion des Holdings
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
            Vue d'ensemble de tous les locataires SaaS (Tenants) de la plateforme.
          </p>
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "100ms" } as React.CSSProperties}>
          <NewHoldingDialog />
        </div>
      </div>

      <div className="grid gap-4 animate-fade-up" style={{ animationDelay: "200ms" } as React.CSSProperties}>
        {holdings.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
            <Server className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">Aucune Holding</h3>
            <p className="text-sm text-slate-500 mt-1">Créez votre première holding pour commencer.</p>
          </div>
        ) : (
          holdings.map((holding) => (
            <div key={holding.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {holding.name}
                    <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider ${
                      holding.plan === "ENTERPRISE" ? "border-purple-500/30 text-purple-600 bg-purple-500/10" :
                      holding.plan === "PREMIUM" ? "border-blue-500/30 text-blue-600 bg-blue-500/10" :
                      "border-slate-500/30 text-slate-600 bg-slate-500/10"
                    }`}>
                      {holding.plan === "ENTERPRISE" && <Crown className="h-3 w-3 mr-1 inline" />}
                      {holding.plan}
                    </Badge>
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {holding._count.children} cliniques</span>
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {holding._count.users} utilisateurs</span>
                    <span className="flex items-center gap-1.5"><Activity className="h-4 w-4" /> {holding._count.patients} patients</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex flex-col sm:items-end gap-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Statut :</span>
                    <Badge variant={holding.subscriptionStatus === "ACTIVE" ? "default" : "secondary"} className="uppercase text-[10px] font-bold">
                      {holding.subscriptionStatus}
                    </Badge>
                  </div>
                  <span className="text-xs text-slate-400">Créé le {new Date(holding.createdAt).toLocaleDateString()}</span>
                  {holding.licenseExpiresAt ? (
                    <span className="text-xs text-amber-500 font-medium">Expire le {new Date(holding.licenseExpiresAt).toLocaleDateString()}</span>
                  ) : (
                    <span className="text-xs text-emerald-500 font-medium">Licence illimitée</span>
                  )}
                </div>
                <HoldingActionsMenu holding={holding} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
