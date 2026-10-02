"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface OfflineLabTestRow {
  id: string;
  name: string;
  department: string | null;
  // Nommé totalPrice pour rester un remplacement direct du catalogue en ligne dans
  // new-lab-order-dialog.tsx (qui affiche/additionne t.totalPrice) — en réalité basePrice répliqué
  // tel quel, sans les consommables dont le coût dépend du stock pharmacie au moment réel.
  totalPrice: number;
}

// Même principe que useOfflinePatients : lit le catalogue d'examens depuis le storage local
// (RxDB/IndexedDB), utilisé comme repli quand le réseau n'est pas disponible (cf.
// new-lab-order-dialog.tsx). Pas de déchiffrement nécessaire, ce n'est pas une donnée
// personnelle.
export function useOfflineLabTests(organizationId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["offlineLabTests", organizationId];

  useEffect(() => {
    if (!enabled || !organizationId) return;

    let cancelled = false;
    let replicationState: { cancel: () => Promise<void> } | undefined;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const { getOfflineDb, startLabTestsReplication } = await import("@/lib/offline-db");
      const db = await getOfflineDb(organizationId);
      if (cancelled) return;

      replicationState = startLabTestsReplication(db);
      const subscription = db.labTests.$.subscribe(() => {
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

  return useQuery<OfflineLabTestRow[]>({
    queryKey,
    enabled: enabled && !!organizationId,
    staleTime: 0,
    queryFn: async () => {
      const { getOfflineDb } = await import("@/lib/offline-db");
      const db = await getOfflineDb(organizationId!);
      const docs = await db.labTests.find().exec();
      return docs
        .filter((d) => !d._deleted)
        .map((d) => ({ id: d.id, name: d.name, department: d.department, totalPrice: d.basePrice }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    },
  });
}
