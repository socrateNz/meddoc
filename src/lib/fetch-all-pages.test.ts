import { describe, it, expect, vi } from "vitest";
import { fetchAllPages } from "./fetch-all-pages";

// Données factices : 45 éléments, pages de 20 (3 requêtes : 20 + 20 + 5).
const DATA = Array.from({ length: 45 }, (_, i) => i + 1);

function pager(total: number, pageSize: number) {
  return vi.fn(async (page: number) => {
    const start = (page - 1) * pageSize;
    return { data: DATA.slice(start, start + pageSize), total, pageSize };
  });
}

describe("fetchAllPages", () => {
  it("enchaîne les pages jusqu'au total annoncé, chaque requête restant à 20 au plus", async () => {
    const fetchPage = pager(45, 20);

    const all = await fetchAllPages(fetchPage);

    expect(all).toEqual(DATA);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it("s'arrête dès qu'une page est vide, même si le total annoncé est plus grand (protection contre une boucle)", async () => {
    const fetchPage = vi.fn(async () => ({ data: [], total: 999, pageSize: 20 }));

    const all = await fetchAllPages(fetchPage);

    expect(all).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("ne fait qu'une requête quand tout tient dans une page", async () => {
    const fetchPage = vi.fn(async () => ({ data: [1, 2, 3], total: 3, pageSize: 20 }));

    const all = await fetchAllPages(fetchPage);

    expect(all).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
