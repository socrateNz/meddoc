// Export complet à partir d'une action paginée : chaque requête reste bornée à une page (20 au
// plus), c'est l'enchaînement des pages qui reconstitue tout le jeu de données. Réservé aux
// téléchargements ponctuels (rapport Z, export CSV), jamais à l'affichage d'une liste.
export interface PageResponse<T> {
  data: T[];
  total: number;
  pageSize: number;
}

export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PageResponse<T>>,
  maxPages = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page);
    all.push(...res.data);
    if (res.data.length === 0 || all.length >= res.total) break;
  }
  return all;
}
