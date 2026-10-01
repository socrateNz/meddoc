"use client";

import { useEffect } from "react";
import { heartbeat } from "@/actions/messages";

// Battement de présence "en ligne" pour la messagerie (cf. indicateur de statut en direct des
// confrères) : monté une fois dans le layout dashboard (pas seulement sur la page Messages) pour
// qu'un utilisateur apparaisse "en ligne" tant qu'il utilise l'application, pas seulement quand il
// a la messagerie ouverte. Ne rend rien — un simple effet qui tourne en arrière-plan.
//
// Il n'y a pas d'infrastructure temps réel (WebSocket) dans cette appli, et ça ne serait de toute
// façon pas viable sur des fonctions Vercel sans état persistant entre requêtes : ce battement
// toutes les 45s (cf. PRESENCE_ONLINE_MS = 2 min dans messages-data.ts, qui tolère un battement
// manqué) est l'approche honnête — "en ligne" veut dire "vu il y a moins de 2 minutes", pas un push
// instantané.
const HEARTBEAT_INTERVAL_MS = 45_000;

export default function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    const beat = () => {
      // document.hidden : inutile d'envoyer un battement pour un onglet en arrière-plan qui ne
      // sera de toute façon pas celui que l'utilisateur regarde — économise des écritures Mongo
      // sans changer le statut perçu (le seuil de 2 min laisse largement le temps de revenir).
      if (cancelled || document.hidden) return;
      heartbeat().catch(() => {
        // Le statut de présence n'est qu'un confort d'interface — une erreur réseau ponctuelle ne
        // doit jamais remonter à l'utilisateur ni interrompre le battement suivant.
      });
    };

    beat();
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}
