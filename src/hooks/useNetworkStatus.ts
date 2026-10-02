"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPendingActions, syncPendingActions, discardPendingAction, type PendingOfflineAction } from "@/lib/offlineSync";
import { toast } from "sonner";

// cf. useIsOffline.ts pour le détail : useSyncExternalStore évite un setState synchrone dans un
// effet juste pour lire navigator.onLine au montage.
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const getOnlineSnapshot = () => navigator.onLine;
const getOnlineServerSnapshot = () => true;

// Même raisonnement que use-offline-lab-tests.ts : la file d'attente passe par react-query (plutôt
// qu'un useState chargé dans un effet) pour que le chargement initial et le rafraîchissement sur
// l'évènement "offline-queue-changed" passent par invalidateQueries au lieu d'un setState appelé
// directement dans le corps d'un effet (react-hooks/set-state-in-effect).
const PENDING_ACTIONS_QUERY_KEY = ["offlinePendingActions"];

export function useNetworkStatus() {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
  const queryClient = useQueryClient();
  const { data: pendingActions = [] } = useQuery<PendingOfflineAction[]>({
    queryKey: PENDING_ACTIONS_QUERY_KEY,
    queryFn: getPendingActions,
    staleTime: 0,
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshPending = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PENDING_ACTIONS_QUERY_KEY });
  }, [queryClient]);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    toast.info("Synchronisation des données hors-ligne en cours...");

    const { synced, failed } = await syncPendingActions();

    setIsSyncing(false);
    await refreshPending();

    if (synced > 0) {
      toast.success(
        `${synced} modification${synced > 1 ? "s" : ""} synchronisée${synced > 1 ? "s" : ""} avec le serveur.`
      );
    }
    if (failed > 0) {
      toast.error(
        `${failed} action${failed > 1 ? "s" : ""} n'${failed > 1 ? "ont" : "a"} pas pu être synchronisée${failed > 1 ? "s" : ""} — voir le détail ci-dessous.`
      );
    }
  }, [isSyncing, refreshPending]);

  const discardAction = useCallback(
    async (id: number) => {
      await discardPendingAction(id);
      await refreshPending();
    },
    [refreshPending]
  );

  // Le chargement initial passe par la queryFn de useQuery ci-dessus (pas par cet effet). Ici on
  // se contente de s'abonner à l'évènement émis ailleurs dans l'appli dès qu'une action est
  // ajoutée/retirée de la file (cf. notifyQueueChange, src/lib/offlineSync.ts) : le handler
  // n'appelle invalidateQueries que lorsque l'évènement se déclenche, jamais pendant l'exécution
  // synchrone du corps de l'effet.
  useEffect(() => {
    const handleQueueChange = () => {
      refreshPending();
    };
    window.addEventListener("offline-queue-changed", handleQueueChange);
    return () => window.removeEventListener("offline-queue-changed", handleQueueChange);
  }, [refreshPending]);

  // Effets de bord (toasts, synchro automatique) réagissant aux VRAIS évènements du navigateur —
  // distinct de la lecture de isOnline elle-même (useSyncExternalStore ci-dessus), pour ne
  // déclencher ni toast ni synchro au simple montage du composant.
  useEffect(() => {
    const handleOnline = async () => {
      toast.success("Connexion rétablie.");
      const pending = await getPendingActions();
      if (pending.length > 0) {
        triggerSync();
      }
    };
    const handleOffline = () => {
      toast.warning("Vous êtes hors-ligne. Passer en mode déconnecté.");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [triggerSync]);

  const failedActions = pendingActions.filter((a) => a.lastError);

  return {
    isOnline,
    pendingCount: pendingActions.length,
    pendingActions,
    failedActions,
    isSyncing,
    triggerSync,
    discardAction,
    refreshPendingCount: refreshPending,
  };
}
