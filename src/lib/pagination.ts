// Plafond unique pour toutes les lectures de liste (API, actions et synchronisation hors-ligne) : une
// requête ne renvoie jamais plus de MAX_PAGE_SIZE éléments, quelle que soit la demande du client.
export const MAX_PAGE_SIZE = 20;

// Normalise une demande de page venant de l'URL, d'un formulaire ou d'un appel d'action.
export function resolvePage(input?: { page?: number | string; pageSize?: number | string }) {
  const page = Math.max(1, Math.floor(Number(input?.page)) || 1);
  const requested = Math.floor(Number(input?.pageSize)) || MAX_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function parsePagination(searchParams: URLSearchParams) {
  return resolvePage({ page: searchParams.get("page") ?? undefined, pageSize: searchParams.get("pageSize") ?? undefined });
}

// Lit ?page=N depuis un searchParams Next.js (valeur simple ou tableau).
export function pageFromParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

// Forme commune des réponses paginées renvoyées par les actions serveur.
export interface PagedResult<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}
