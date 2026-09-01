"use client";

import { useEffect, useState } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import {
  PharmacistPatientPreviewCard,
  FullPatientPreviewCard,
  type PharmacistPatientPreview,
  type FullPatientPreview,
} from "@/app/dashboard/patients/[id]/patient-detail-preview";

type Preview =
  | { kind: "pharmacist"; data: PharmacistPatientPreview }
  | { kind: "full"; data: FullPatientPreview };

export default function Loading() {
  // undefined = lecture du cache en cours, null = pas de cache disponible
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // patientId vient TOUJOURS de l'URL réellement affichée, jamais d'un indice stocké —
      // aucune fuite inter-patients n'est structurellement possible, quel que soit l'état du hint.
      // Même formule de clé de cache que la jumelle /dashboard/patients/[id] : même patient,
      // même verifyPatientAccess, cf. plan.
      const match = window.location.pathname.match(/^\/dashboard\/clinics\/[^/]+\/patients\/([^/]+)(?:\/|$)/);
      const patientId = match?.[1];
      if (!patientId) {
        if (!cancelled) setPreview(null);
        return;
      }

      const { getCachedView, getRouteHint } = await import("@/lib/view-cache");
      // Le hint ne sert qu'à choisir QUELLE FORME de prévisualisation afficher (pharmacien vs
      // vue clinique complète) — jamais quel patient (cf. patientId ci-dessus).
      const hint = await getRouteHint<{ isPharmacist?: boolean }>("patient-detail");
      const isPharmacist = hint?.isPharmacist === true;

      if (isPharmacist) {
        const cached = await getCachedView<PharmacistPatientPreview>(`patient-detail:${patientId}:pharmacist`);
        if (!cancelled) setPreview(cached ? { kind: "pharmacist", data: cached.data } : null);
      } else {
        const cached = await getCachedView<FullPatientPreview>(`patient-detail:${patientId}:full`);
        if (!cancelled) setPreview(cached ? { kind: "full", data: cached.data } : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!preview) return <PageLoading />;

  return preview.kind === "pharmacist" ? (
    <PharmacistPatientPreviewCard preview={preview.data} />
  ) : (
    <FullPatientPreviewCard preview={preview.data} />
  );
}
