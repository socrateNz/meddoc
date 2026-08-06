"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { decryptField, decryptJson } from "@/lib/offline-crypto";

export interface OfflinePatientRow {
  id: string;
  status?: string;
  dependencyLevel: number;
  dateOfBirth: string;
  pathologies: string[];
  user: { firstName: string; lastName: string; email: string };
}

// Lit la liste des patients depuis le storage local (RxDB/IndexedDB), déchiffrés à la volée —
// utilisé comme repli quand le réseau n'est pas disponible (cf. patient-table.tsx). Démarre
// aussi la réplication pull en arrière-plan tant que le composant appelant est monté, pour que
// le cache local reste à jour dès qu'une connexion est disponible.
export function useOfflinePatients(organizationId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["offlinePatients", organizationId];

  useEffect(() => {
    if (!enabled || !organizationId) return;

    let cancelled = false;
    let replicationState: { cancel: () => Promise<void> } | undefined;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const { getOfflineDb, startPatientsReplication } = await import("@/lib/offline-db");
      const db = await getOfflineDb(organizationId);
      if (cancelled) return;

      replicationState = startPatientsReplication(db);
      const subscription = db.patients.$.subscribe(() => {
        queryClient.invalidateQueries({ queryKey });
      });
      unsubscribe = () => subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      replicationState?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, organizationId]);

  return useQuery<OfflinePatientRow[]>({
    queryKey,
    enabled: enabled && !!organizationId,
    staleTime: 0,
    queryFn: async () => {
      const { getOfflineDb } = await import("@/lib/offline-db");
      const db = await getOfflineDb(organizationId!);
      const docs = await db.patients.find().exec();

      return Promise.all(
        docs
          .filter((d) => !d._deleted)
          .map(async (d) => ({
            id: d.id,
            status: d.status,
            dependencyLevel: d.dependencyLevel,
            dateOfBirth: await decryptField(d.dateOfBirthEnc),
            pathologies: await decryptJson<string[]>(d.pathologiesEnc),
            user: {
              firstName: await decryptField(d.firstNameEnc),
              lastName: await decryptField(d.lastNameEnc),
              email: await decryptField(d.emailEnc),
            },
          }))
      );
    },
  });
}
