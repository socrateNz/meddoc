import Link from "next/link";
import { Lock } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/modules";

// Affiché à la place d'une page dont le module n'est pas inclus dans la licence (lien ancien,
// favori, adresse saisie à la main) — le menu ne le propose déjà plus.
export default function ModuleUnavailable({ module }: { module: ModuleKey }) {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="max-w-md text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Lock className="h-6 w-6 text-slate-500" />
        </div>
        <h1 className="text-xl font-bold">{MODULES[module].label} : module non inclus</h1>
        <p className="text-sm text-muted-foreground">
          Ce module ne fait pas partie de la licence de votre établissement. Pour l&apos;ajouter, contactez l&apos;équipe MedDoc.
        </p>
        <Link href="/dashboard" className="inline-block text-sm font-semibold text-blue-600 hover:underline">
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
