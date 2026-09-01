import { cn } from "@/lib/utils";

// Bloc de squelette générique — pulse discret, utilisé pour représenter une zone dont le
// contenu réel dépend d'une donnée pas encore chargée (cf. les loading.tsx du dashboard :
// le contenu statique d'une page — titre, libellés, icônes — s'affiche immédiatement, et
// seules les zones dépendantes de données prennent la forme d'un squelette pendant le
// chargement, au lieu d'un loader plein écran qui masque tout).
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800/80", className)}
      {...props}
    />
  );
}
