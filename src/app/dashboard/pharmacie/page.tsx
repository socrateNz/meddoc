import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Package, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Pharmacie | MedDoc",
};

// Comme la caisse, la pharmacie est une opération physique par clinique (stock PharmacyItem et
// file d'attente de remise scopés organizationId) — pas d'équivalent "pharmacie agrégée toute la
// holding". Un ADMIN choisit ici la clinique dont il veut consulter le comptoir pharmacie.
export default async function HoldingPharmaciePage() {
  const activeUser = await getCurrentUser();
  if (!activeUser) redirect("/login");
  if (activeUser.organization?.type === "CLINIC") {
    redirect(`/dashboard/clinics/${activeUser.organizationId}/pharmacie`);
  }

  const clinics = await prisma.organization.findMany({
    where: { parentId: activeUser.organizationId, type: "CLINIC" },
    select: { id: true, name: true, _count: { select: { patients: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 animate-fade-up">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Pharmacie</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sélectionnez une clinique pour consulter sa file d&apos;attente et son stock pharmacie.
        </p>
      </div>

      {clinics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
          Aucune clinique affiliée à votre holding pour le moment.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clinics.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/clinics/${c.id}/pharmacie`}
              className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs p-5 flex items-center justify-between gap-3 hover:border-blue-500/40 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500">{c._count.patients} patient(s)</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
