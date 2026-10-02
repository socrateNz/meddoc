"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface OfflinePharmacyItemRow {
  id: string;
  name: string;
  dosage: string | null;
  unitPrice: number;
  stockQuantity: number;
  saleBlockedAt: string | null;
  saleBlockedReason: string | null;
}

// Même principe que useOfflinePatients : lit le catalogue pharmacie depuis le storage local
// (RxDB/IndexedDB), utilisé comme repli quand le réseau n'est pas disponible (cf.
// caisse-cart-dialog.tsx). Pas de déchiffrement nécessaire. stockQuantity n'est qu'un dernier
// instantané connu — un conflit de stock réel ne se révèle qu'à la synchronisation (cf.
// src/lib/offlineSync.ts).
export function useOfflinePharmacyItems(organizationId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["offlinePharmacyItems", organizationId];

  useEffect(() => {
    if (!enabled || !organizationId) return;

    let cancelled = false;
    let replicationState: { cancel: () => Promise<void> } | undefined;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const { getOfflineDb, startPharmacyItemsReplication } = await import("@/lib/offline-db");
      const db = await getOfflineDb(organizationId);
      if (cancelled) return;

      replicationState = startPharmacyItemsReplication(db);
      const subscription = db.pharmacyItems.$.subscribe(() => {
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

  return useQuery<OfflinePharmacyItemRow[]>({
    queryKey,
    enabled: enabled && !!organizationId,
    staleTime: 0,
    queryFn: async () => {
      const { getOfflineDb } = await import("@/lib/offline-db");
      const db = await getOfflineDb(organizationId!);
      const docs = await db.pharmacyItems.find().exec();
      return docs
        .filter((d) => !d._deleted)
        .map((d) => ({
          id: d.id,
          name: d.name,
          dosage: d.dosage,
          unitPrice: d.unitPrice,
          stockQuantity: d.stockQuantity,
          saleBlockedAt: d.saleBlockedAt,
          saleBlockedReason: d.saleBlockedReason,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    },
  });
}
