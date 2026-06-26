import { getClinics } from "@/actions/organizations";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Building2, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ClinicsPage() {
  const user = await getCurrentUser();

  // Protect the route: Only Holding Admins
  if (!user || user.role !== "ADMIN" || user.organization?.type !== "HOLDING") {
    redirect("/dashboard");
  }

  const { clinics, error } = await getClinics();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Cliniques affiliées</h1>
          <p className="text-muted-foreground mt-1">
            Gérez les établissements de votre holding et supervisez leurs activités.
          </p>
        </div>
        <Link href="/dashboard/clinics/new">
          <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-[1.02]">
            <Plus className="h-4 w-4 mr-2" />
            Ajouter une clinique
          </Button>
        </Link>
      </div>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-800/50">
          <p className="font-medium">Une erreur est survenue</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : clinics?.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="h-20 w-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4 border border-blue-100 dark:border-blue-800/50 shadow-inner">
            <Building2 className="h-10 w-10 text-blue-500 dark:text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">Aucune clinique</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
            Votre holding ne gère encore aucun établissement. Commencez par ajouter votre première clinique pour structurer votre organisation.
          </p>
          <Link href="/dashboard/clinics/new">
            <Button variant="outline" className="border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une première clinique
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clinics?.map((clinic) => (
            <Card key={clinic.id} className="overflow-hidden border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300 group hover:border-blue-200 dark:hover:border-blue-800/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
              <CardHeader className="pb-4 relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="flex justify-between items-start">
                  <div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shadow-sm border border-blue-100/50 dark:border-blue-800/50">
                    <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50">
                    Active
                  </span>
                </div>
                <CardTitle className="text-xl mt-4 line-clamp-1">{clinic.name}</CardTitle>
                <CardDescription>Ajoutée le {new Date(clinic.createdAt).toLocaleDateString('fr-FR')}</CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                      <Users className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Personnel</span>
                    </div>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {(clinic as any)._count?.users || 0}
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                      <FileText className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Patients</span>
                    </div>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {(clinic as any)._count?.patients || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800/50 py-3">
                <Link href={`/dashboard/clinics/${clinic.id}`} className="w-full">
                  <Button variant="ghost" size="sm" className="w-full text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 group-hover:translate-x-1 transition-transform">
                    Gérer la clinique →
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
