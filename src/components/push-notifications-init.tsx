"use client";

import { useEffect } from "react";
import { getPushStatus, subscribeAndPersist } from "@/lib/push-client";

// Monté une seule fois dans le layout du dashboard (pas le layout racine, pour ne jamais
// solliciter un visiteur non connecté sur les pages publiques). Demande automatiquement la
// permission navigateur à la connexion — décision actée avec le client, cf. plan Web Push :
// "default" (jamais demandé) déclenche la demande, "granted" ré-assure juste l'abonnement
// (idempotent, gère aussi le cas d'un autre utilisateur sur ce même appareil), "denied" n'est
// jamais re-sollicité (impossible de re-demander une permission refusée de toute façon).
export default function PushNotificationsInit() {
  useEffect(() => {
    (async () => {
      const status = getPushStatus();
      if (status === "unsupported" || status === "denied") return;

      if (status === "granted") {
        await subscribeAndPersist();
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await subscribeAndPersist();
      }
    })();
  }, []);

  return null;
}
