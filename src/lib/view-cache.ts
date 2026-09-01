"use client";

// Cache local générique "dernière vue affichée" — sert à peindre instantanément un aperçu des
// données déjà vues pendant qu'une navigation vers une page force-dynamic recharge la version
// fraîche côté serveur (cf. src/components/cache-writer.tsx pour l'écriture, et les loading.tsx
// des routes concernées pour la lecture). Indépendant du mécanisme RxDB de src/lib/offline-db.ts
// (qui gère un vrai mode hors-ligne navigable/recherchable pour les patients) : ici, on ne fait
// que rejouer le dernier payload connu, jamais d'écriture ni de réplication en direct.
//
// Deux object stores dans une base IndexedDB dédiée :
// - "views"  : payload chiffré (AES-GCM via src/lib/offline-crypto.ts — même mécanisme que le
//   reste du stockage local, clé non extractible, jamais de texte en clair sur disque).
// - "hints"  : petits indices non chiffrés (ex: organizationId, role) utilisés uniquement par un
//   loading.tsx pour savoir QUELLE FORME de prévisualisation afficher — jamais pour décider QUEL
//   LOCATAIRE afficher (l'identifiant de clinique/patient vient toujours de l'URL réelle, jamais
//   d'un hint, pour qu'aucune fuite inter-établissements ne soit structurellement possible).

import { encryptField, decryptField } from "@/lib/offline-crypto";

const DB_NAME = "meddoc-view-cache";
const DB_VERSION = 1;
const VIEWS_STORE = "views";
const HINTS_STORE = "hints";
const MAX_PAYLOAD_CHARS = 500_000; // garde-fou ~500 Ko : on saute l'écriture plutôt que de planter

export interface CachedView<T> {
  data: T;
  updatedAt: string;
}

function openViewCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VIEWS_STORE)) db.createObjectStore(VIEWS_STORE);
      if (!db.objectStoreNames.contains(HINTS_STORE)) db.createObjectStore(HINTS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Best-effort partout : un échec de lecture/écriture du cache ne doit jamais remonter à
// l'utilisateur ni bloquer la page réelle — c'est un pur bonus de confort visuel.

export async function getCachedView<T>(cacheKey: string): Promise<CachedView<T> | null> {
  try {
    const db = await openViewCacheDb();
    const rec = await new Promise<{ dataEnc: string; updatedAt: string } | undefined>((resolve, reject) => {
      const tx = db.transaction(VIEWS_STORE, "readonly");
      const req = tx.objectStore(VIEWS_STORE).get(cacheKey);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!rec) return null;
    const data = JSON.parse(await decryptField(rec.dataEnc)) as T;
    return { data, updatedAt: rec.updatedAt };
  } catch {
    return null;
  }
}

export async function setCachedView<T>(cacheKey: string, data: T, updatedAt: string): Promise<void> {
  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > MAX_PAYLOAD_CHARS) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[view-cache] payload trop volumineux pour "${cacheKey}" (${serialized.length} caractères) — écriture ignorée.`);
      }
      return;
    }
    const dataEnc = await encryptField(serialized);
    const db = await openViewCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VIEWS_STORE, "readwrite");
      tx.objectStore(VIEWS_STORE).put({ dataEnc, updatedAt }, cacheKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // écriture best-effort — jamais bloquant
  }
}

export async function getRouteHint<T extends Record<string, string | boolean | undefined>>(
  routeFamily: string
): Promise<T | null> {
  try {
    const db = await openViewCacheDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(HINTS_STORE, "readonly");
      const req = tx.objectStore(HINTS_STORE).get(routeFamily);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setRouteHint(routeFamily: string, hint: Record<string, string | boolean | undefined>): Promise<void> {
  try {
    const db = await openViewCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HINTS_STORE, "readwrite");
      tx.objectStore(HINTS_STORE).put(hint, routeFamily);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // écriture best-effort — jamais bloquant
  }
}
