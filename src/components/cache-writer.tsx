"use client";

import { useEffect } from "react";

interface CacheWriterProps<T> {
  cacheKey: string;
  data: T;
  // Horodatage calculé côté serveur au rendu de la page (cf. `cachedAt` dans chaque page.tsx) —
  // change à chaque nouvelle navigation ou revalidation, ce qui suffit à déclencher une
  // ré-écriture du cache sans avoir à comparer/hasher le payload.
  updatedAt: string;
  // Omettre les deux pour sauter l'écriture du hint (routes dont l'id de portée vient déjà
  // entièrement de l'URL, cf. plan — pas besoin d'indice pour ces routes-là).
  routeFamily?: string;
  contextHint?: Record<string, string | boolean | undefined>;
}

export default function CacheWriter<T>({ cacheKey, data, updatedAt, routeFamily, contextHint }: CacheWriterProps<T>) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { setCachedView, setRouteHint } = await import("@/lib/view-cache");
      if (cancelled) return;
      await setCachedView(cacheKey, data, updatedAt);
      if (routeFamily && contextHint) await setRouteHint(routeFamily, contextHint);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, updatedAt]);

  return null;
}
