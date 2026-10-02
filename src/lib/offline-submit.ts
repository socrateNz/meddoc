"use client";

// Utilitaire partagé par chaque formulaire capable de fonctionner hors-ligne (constantes,
// demandes labo, ventes en caisse, paiements) : tente TOUJOURS l'action serveur réelle
// d'abord, et ne bascule en file d'attente locale que si cet appel échoue pour une raison
// réseau — jamais sur un refus métier (validation, session de caisse fermée, patient sorti...),
// qui doit rester une vraie erreur à corriger tout de suite, pas une mise en attente qui la
// masquerait pendant des heures.
//
// Deux façons de détecter "pas de réseau" : navigator.onLine en amont (évite d'attendre un
// timeout quand on sait déjà, avec certitude, qu'il n'y a aucune connexion), et un try/catch
// autour de l'appel réel (capture aussi le cas plus insidieux d'une connexion qui se déclare
// active mais ne mène nulle part — cf. useIsOffline.ts pour la même limite assumée).

import { enqueueOfflineAction, type OfflineActionType, type OfflineActionPayloadMap } from "./offlineSync";

export interface SubmitOrQueueResult<T> {
  // true si l'action a été mise en file (pas encore exécutée sur le serveur) plutôt qu'exécutée.
  queued: boolean;
  success: boolean;
  data?: T;
  error?: string;
}

export async function submitOrQueueOffline<T, K extends OfflineActionType>(options: {
  action: () => Promise<{ success: boolean; data?: T; error?: string }>;
  queueType: K;
  payload: OfflineActionPayloadMap[K];
  label: string;
}): Promise<SubmitOrQueueResult<T>> {
  const goOffline = async (): Promise<SubmitOrQueueResult<T>> => {
    try {
      await enqueueOfflineAction(options.queueType, options.payload, options.label);
      return { queued: true, success: true };
    } catch {
      // Le navigateur ne supporte pas IndexedDB, ou le stockage local est plein/bloqué (mode
      // navigation privée stricte...) : on ne peut alors ni envoyer, ni mettre en attente.
      return { queued: false, success: false, error: "Hors-ligne et impossible d'enregistrer localement sur cet appareil." };
    }
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return goOffline();
  }

  try {
    const res = await options.action();
    return { queued: false, success: res.success, data: res.data, error: res.error };
  } catch {
    // L'appel a échoué avant même d'atteindre le serveur (fetch impossible) : jamais une erreur
    // métier, celles-ci reviennent toujours sous la forme { success: false, error } ci-dessus.
    return goOffline();
  }
}
