"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPendingTaskUpdatesCount,
  syncPendingOfflineTasks,
} from "@/lib/offlineSync";
import { toast } from "sonner";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingTaskUpdatesCount();
    setPendingCount(count);
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    toast.info("Synchronisation des données hors-ligne en cours...");

    const { synced, errors } = await syncPendingOfflineTasks();

    setIsSyncing(false);
    await refreshPendingCount();

    if (synced > 0) {
      toast.success(
        `${synced} modification${synced > 1 ? "s" : ""} synchronisée${synced > 1 ? "s" : ""} avec le serveur.`
      );
    }
    if (errors > 0) {
      toast.error(
        `${errors} erreur${errors > 1 ? "s" : ""} lors de la synchronisation.`
      );
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);
    refreshPendingCount();

    const handleOnline = async () => {
      setIsOnline(true);
      toast.success("Connexion rétablie.");
      // Synchronisation automatique au retour du réseau
      const count = await getPendingTaskUpdatesCount();
      if (count > 0) {
        triggerSync();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Vous êtes hors-ligne. Passer en mode déconnecté.");
    };

    const handleQueueChange = () => {
      refreshPendingCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-queue-changed", handleQueueChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-queue-changed", handleQueueChange);
    };
  }, [refreshPendingCount, triggerSync]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    triggerSync,
    refreshPendingCount,
  };
}
