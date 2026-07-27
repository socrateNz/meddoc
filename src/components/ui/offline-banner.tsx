"use client";

import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";

export function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetworkStatus();

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 text-xs sm:text-sm text-amber-700 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2 transition-all">
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Mode Hors-Ligne actif</strong> &mdash; Les modifications sont enregistrées localement et seront synchronisées au retour de la connexion.
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Connexion active &mdash; <strong>{pendingCount}</strong> modification{pendingCount > 1 ? "s" : ""} en attente de synchronisation.
            </span>
          </>
        )}
      </div>

      {pendingCount > 0 && (
        <button
          onClick={triggerSync}
          disabled={isSyncing || !isOnline}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Synchronisation..." : "Synchroniser maintenant"}
        </button>
      )}
    </div>
  );
}
