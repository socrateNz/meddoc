"use client";

import { useSyncExternalStore } from "react";

// Détection partagée "hors-ligne" — même mécanisme que celui déjà utilisé par
// patient-table.tsx (navigator.onLine + évènements online/offline), factorisé ici pour que
// chaque nouveau formulaire capable de fonctionner hors-ligne (constantes, demandes labo,
// ventes en caisse...) parte de la même définition plutôt que de la redupliquer.
//
// useSyncExternalStore plutôt qu'un useState+useEffect : navigator.onLine n'existe pas côté
// serveur (SSR) — l'effet+setState équivalent appellerait setState de façon synchrone dans le
// corps de l'effet (anti-pattern signalé par react-hooks/set-state-in-effect) juste pour
// contourner ce problème. useSyncExternalStore est le mécanisme que React prévoit précisément
// pour ce cas : un instantané serveur fixe (ici "en ligne", le comportement par défaut avant
// hydratation) et un instantané client qui se resynchronise automatiquement à chaque évènement.
//
// Limite assumée (déjà celle de patient-table.tsx) : navigator.onLine ne reflète que la
// connexion au réseau local (WiFi/Ethernet), pas un accès réel à internet. Les formulaires qui
// écrivent des données s'en protègent eux-mêmes en tentant l'appel réel et en basculant en file
// d'attente seulement s'il échoue (cf. src/lib/offline-submit.ts) ; cette détection ne sert donc
// qu'à éviter l'attente d'un timeout quand on sait déjà, avec certitude, qu'il n'y a aucun réseau.
function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return !navigator.onLine;
}

function getServerSnapshot() {
  return false; // pas de navigator côté serveur : on suppose "en ligne" jusqu'à l'hydratation.
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
