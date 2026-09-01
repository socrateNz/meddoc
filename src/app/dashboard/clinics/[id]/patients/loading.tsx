"use client";

import { useEffect, useState } from "react";
import PatientsListPreview, { PatientsListPreviewData, PatientsListSkeleton } from "@/app/dashboard/patients/patients-list-preview";

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

  // Pas encore de cache pour cette clinique (première visite sur cet appareil) — le titre et le
  // sous-titre de la page ne dépendent d'aucune donnée : ils s'affichent tout de suite, seule la
  // liste des patients prend la forme d'un squelette pendant le chargement.
  if (!preview) {
    return (
      <div className="space-y-6" aria-hidden="true">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Patients</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Gérez la liste des patients, leurs statuts (actifs / clôturés) et leurs dossiers pour cette clinique.
            </p>
          </div>
        </div>

        <PatientsListSkeleton />
      </div>
    );
  }

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
