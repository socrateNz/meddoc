"use client";

import { useEffect, useState } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import PatientsListPreview, { PatientsListPreviewData } from "./patients-list-preview";

export default function Loading() {
  // undefined = lecture du cache en cours, null = pas de cache disponible
  const [preview, setPreview] = useState<PatientsListPreviewData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getCachedView, getRouteHint } = await import("@/lib/view-cache");
      // Cette route n'a pas d'id dans son URL — l'organisation vient entièrement du hint, qui
      // ne sert ici qu'à reconstruire la même clé de cache que CacheWriter a écrite (jamais à
      // décider quel locataire afficher : il n'y a pas d'id de tenant dans l'URL de cette route).
      const hint = await getRouteHint<{ organizationId?: string }>("patients-list");
      if (!hint?.organizationId) {
        if (!cancelled) setPreview(null);
        return;
      }

      const cached = await getCachedView<PatientsListPreviewData>(`patients-list:${hint.organizationId}`);
      if (!cancelled) setPreview(cached?.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!preview) return <PageLoading />;

  return (
    <div className="space-y-6 pointer-events-none select-none" aria-hidden="true" inert>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Patients</h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Mise à jour…
          </span>
        </div>
      </div>

      <PatientsListPreview data={preview} />
    </div>
  );
}
