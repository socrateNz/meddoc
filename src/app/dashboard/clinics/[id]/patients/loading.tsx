"use client";

import { useEffect, useState } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import PatientsListPreview, { PatientsListPreviewData } from "@/app/dashboard/patients/patients-list-preview";

export default function Loading() {
  // undefined = lecture du cache en cours, null = pas de cache disponible
  const [preview, setPreview] = useState<PatientsListPreviewData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // clinicId vient TOUJOURS de l'URL réellement affichée, jamais d'un indice stocké — aucune
      // fuite inter-cliniques n'est structurellement possible. Ancré en fin de segment pour ne
      // jamais matcher la route imbriquée /clinics/[id]/patients/[patientId] qui a son propre
      // loading.tsx.
      const match = window.location.pathname.match(/^\/dashboard\/clinics\/([^/]+)\/patients\/?$/);
      const clinicId = match?.[1];
      if (!clinicId) {
        if (!cancelled) setPreview(null);
        return;
      }

      const { getCachedView } = await import("@/lib/view-cache");
      const cached = await getCachedView<PatientsListPreviewData>(`patients-list:${clinicId}`);
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
