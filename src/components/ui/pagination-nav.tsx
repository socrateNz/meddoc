import Link from "next/link";

// Pagination pilotée par l'URL (?page=N) pour les pages serveur : pas d'état client, chaque page
// charge uniquement son lot de MAX_PAGE_SIZE éléments. Les autres paramètres (recherche, filtres)
// sont conservés dans les liens.
interface PaginationNavProps {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
  query?: Record<string, string | undefined>;
  itemLabel?: string;
  // Nom du paramètre d'URL de la page ("page" par défaut ; ex. "rxPage" si deux listes coexistent).
  pageParam?: string;
}

// Copie des paramètres d'URL à conserver lors du changement de page (filtres, période...).
export function keepQuery(params: Record<string, string | string[] | undefined>, omit: string[] = ["page"]) {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (omit.includes(key)) continue;
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

function buildHref(pathname: string, query: Record<string, string | undefined>, page: number, pageParam: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set(pageParam, String(page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

const buttonBase =
  "inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium transition-colors";
const buttonEnabled = "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800";
const buttonDisabled = "pointer-events-none opacity-40 text-slate-400";

export function PaginationNav({ page, pageSize, total, pathname, query = {}, itemLabel = "élément", pageParam = "page" }: PaginationNavProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const plural = total > 1 ? "s" : "";

  return (
    <nav aria-label="Pagination" className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
      <span className="text-xs text-slate-500">
        {from}–{to} sur {total} {itemLabel}{plural}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={buildHref(pathname, query, page - 1, pageParam)} className={`${buttonBase} ${buttonEnabled}`} rel="prev">
              Précédent
            </Link>
          ) : (
            <span aria-disabled="true" className={`${buttonBase} ${buttonDisabled}`}>
              Précédent
            </span>
          )}
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildHref(pathname, query, page + 1, pageParam)} className={`${buttonBase} ${buttonEnabled}`} rel="next">
              Suivant
            </Link>
          ) : (
            <span aria-disabled="true" className={`${buttonBase} ${buttonDisabled}`}>
              Suivant
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
