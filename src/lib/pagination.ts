// Plafond unique pour toutes les lectures de liste (API et synchronisation hors-ligne) : une
// requête ne renvoie jamais plus de MAX_PAGE_SIZE éléments, quelle que soit la demande du client.
export const MAX_PAGE_SIZE = 20;

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const requested = Number(searchParams.get("pageSize")) || MAX_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
