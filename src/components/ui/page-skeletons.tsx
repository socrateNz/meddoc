import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Squelettes de mise en page partagés par les loading.tsx du dashboard. Même principe que
// dashboard/loading.tsx : le titre et la description statiques de la page s'affichent tout de
// suite, seules les zones dépendantes de données prennent la forme d'un squelette. Chaque
// squelette reproduit la grille réelle de la page (mêmes breakpoints), pour éviter tout saut de
// mise en page à l'arrivée des données.

export function LoadingRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-6", className)}>
      <span className="sr-only">Chargement…</span>
      {children}
    </div>
  );
}

export function PageHeaderSkeleton({
  title,
  description,
  actionCount = 0,
}: {
  title?: string;
  description?: string;
  actionCount?: number;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-2">
        {title ? (
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        ) : (
          <Skeleton className="h-9 w-56 max-w-full" aria-hidden="true" />
        )}
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : (
          <Skeleton className="h-4 w-80 max-w-full" aria-hidden="true" />
        )}
      </div>
      {actionCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: actionCount }, (_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-xl" aria-hidden="true" />
          ))}
        </div>
      )}
    </div>
  );
}

export function CardGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
          <Skeleton className="h-3 w-24" aria-hidden="true" />
          <Skeleton className="h-8 w-16" aria-hidden="true" />
          <Skeleton className="h-3 w-32" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-4 rounded-xl border bg-card p-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3 max-w-sm" aria-hidden="true" />
            <Skeleton className="h-3 w-full" aria-hidden="true" />
            <Skeleton className="h-3 w-1/2" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Tableau : en colonnes sur md+, en lignes empilées sur mobile (un tableau à N colonnes déborde
// sur un téléphone). Même découpage que les pages réelles qui s'affichent en cartes sur mobile.
export function TableSkeleton({ rows = 8, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="hidden md:block">
        <div className="grid gap-4 border-b bg-muted/30 px-4 py-3" style={gridStyle}>
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-3 w-20" aria-hidden="true" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="grid gap-4 border-b px-4 py-4 last:border-0" style={gridStyle}>
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton key={c} className="h-4 w-full max-w-40" aria-hidden="true" />
            ))}
          </div>
        ))}
      </div>
      <div className="divide-y md:hidden">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" aria-hidden="true" />
            <Skeleton className="h-3 w-1/2" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Formulaire : champs empilés, une colonne sur mobile, deux sur sm+ pour les champs courts.
export function FormSkeleton({ fields = 6, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn("space-y-6 rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" aria-hidden="true" />
            <Skeleton className="h-10 w-full rounded-xl" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Skeleton className="h-9 w-24 rounded-xl" aria-hidden="true" />
        <Skeleton className="h-9 w-32 rounded-xl" aria-hidden="true" />
      </div>
    </div>
  );
}

// Texte long (documentation, contenus) : paragraphes de longueurs variées.
export function TextSkeleton({ paragraphs = 4, className }: { paragraphs?: number; className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      {Array.from({ length: paragraphs }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-48 max-w-full" aria-hidden="true" />
          <Skeleton className="h-3 w-full" aria-hidden="true" />
          <Skeleton className="h-3 w-full" aria-hidden="true" />
          <Skeleton className="h-3 w-3/4" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
