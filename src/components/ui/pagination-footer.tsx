"use client";

import { Button } from "@/components/ui/button";

// Pagination pour les listes chargées à la demande côté client (react-query + server action) :
// la page courante vit dans l'état du composant parent. Pour les pages serveur, utiliser
// PaginationNav (liens ?page=N), qui ne nécessite aucun état.
interface PaginationFooterProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  itemLabel?: string;
}

export function PaginationFooter({ page, pageSize, total, onPageChange, loading = false, itemLabel = "élément" }: PaginationFooterProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
      <span className="text-xs text-slate-500">
        {from}–{to} sur {total} {itemLabel}{total > 1 ? "s" : ""}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Précédent
          </Button>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
