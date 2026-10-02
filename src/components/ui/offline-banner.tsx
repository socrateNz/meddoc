"use client";

import { useState } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  TASK_TOGGLE: "Tâche de soins",
  VITALS: "Constantes",
  LAB_ORDER: "Demande d'analyse",
  CAISSE_SALE: "Vente en caisse",
  CAISSE_PAY: "Paiement de facture",
};

export function OfflineBanner() {
  const { isOnline, pendingCount, failedActions, isSyncing, triggerSync, discardAction } = useNetworkStatus();
  const [expanded, setExpanded] = useState(false);

  if (isOnline && pendingCount === 0) {
    return null;
  }

  const hasConflicts = failedActions.length > 0;

  return (
    <div
      className={`w-full border-b px-4 py-2.5 text-xs sm:text-sm flex flex-col gap-2 transition-all ${
        hasConflicts
          ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
          : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Mode Hors-Ligne actif</strong> &mdash; Les modifications sont enregistrées localement et seront synchronisées au retour de la connexion.
              </span>
            </>
          ) : hasConflicts ? (
            <>
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                <strong>{failedActions.length}</strong> action{failedActions.length > 1 ? "s" : ""} en attente n&apos;
                {failedActions.length > 1 ? "ont" : "a"} pas pu être synchronisée{failedActions.length > 1 ? "s" : ""} &mdash; à vérifier.
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

        <div className="flex items-center gap-2">
          {failedActions.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              {expanded ? "Masquer" : "Voir le détail"}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
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
      </div>

      {expanded && failedActions.length > 0 && (
        <ul className="space-y-1.5 pt-1 border-t border-current/20">
          {failedActions.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 bg-white/50 dark:bg-black/20 rounded-lg px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="font-semibold">
                  {ACTION_LABELS[a.type] || a.type} — {a.label}
                </p>
                <p className="text-[11px] opacity-90">{a.lastError}</p>
              </div>
              <button
                onClick={() => discardAction(a.id)}
                title="Retirer cette action de la file (elle ne sera plus retentée)"
                className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
