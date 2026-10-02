// File d'attente hors-ligne GÉNÉRIQUE — avant cette réécriture, ce fichier ne savait mettre en
// attente qu'un seul type d'action (cocher une tâche de soins). Étendue ici à toutes les actions
// qui doivent continuer à fonctionner sans réseau : constantes, demandes d'analyse, ventes en
// caisse, paiements de facture. cf. le fil de conversation avec l'utilisateur — "ventes en
// caisse" et "remise de médicaments" sont les opérations qui comptent le plus pour lui dans le
// contexte camerounais (coupures réseau fréquentes).
//
// Correctif important par rapport à l'ancienne version : un échec de synchronisation (conflit —
// session de caisse refermée entretemps, patient sorti, etc.) gardait quand même l'action en
// mémoire le temps de l'appel, puis `store.clear()` était appelé SANS CONDITION juste après avoir
// tout tenté — une action en échec disparaissait donc silencieusement, sans jamais être
// retentée ni visible nulle part. Chaque action reste maintenant dans la file jusqu'à un succès
// explicite ; un échec y reste avec son message d'erreur, affiché par OfflineBanner.

import type { recordVitalSign } from "@/actions/vitals";
import type { createLabOrder } from "@/actions/lab";
import type { createCaisseSale, payPendingInvoice } from "@/actions/finance";

export type OfflineActionType = "TASK_TOGGLE" | "VITALS" | "LAB_ORDER" | "CAISSE_SALE" | "CAISSE_PAY";

// Payload de chaque type dérivé directement de la signature de la Server Action qu'il rejouera
// (cf. dispatch ci-dessous) plutôt que redéfini à la main — une divergence de forme se voit alors
// à la compilation plutôt qu'au premier échec de synchronisation en production.
export interface OfflineActionPayloadMap {
  TASK_TOGGLE: { taskId: string; patientId: string; isCompleted: boolean };
  VITALS: Parameters<typeof recordVitalSign>[0];
  LAB_ORDER: Parameters<typeof createLabOrder>[0];
  CAISSE_SALE: Parameters<typeof createCaisseSale>[0];
  CAISSE_PAY: {
    pendingInvoiceId: Parameters<typeof payPendingInvoice>[0];
    cashSessionId: Parameters<typeof payPendingInvoice>[1];
    amount: Parameters<typeof payPendingInvoice>[2];
    items: Parameters<typeof payPendingInvoice>[3];
  };
}

export type PendingOfflineAction = {
  [K in OfflineActionType]: {
    id: number;
    type: K;
    payload: OfflineActionPayloadMap[K];
    // Résumé lisible par un humain (nom du patient, etc.) — affiché tel quel dans la file, pour ne
    // jamais devoir redécoder `payload` juste pour savoir de quoi il s'agit.
    label: string;
    createdAt: number;
    attempts: number;
    // Rempli uniquement après un échec de synchronisation ; absent tant que l'action n'a encore
    // jamais été tentée ou qu'elle a fini par réussir (auquel cas elle est retirée de la file).
    lastError?: string;
  };
}[OfflineActionType];

const DB_NAME = "MedDocOfflineDB";
const DB_VERSION = 2;
const STORE_PENDING_ACTIONS = "pendingActions";
// Stores de la v1 — migrés puis supprimés au premier chargement après mise à jour (cf.
// onupgradeneeded) pour ne perdre aucune tâche de soins déjà en attente sur un appareil.
const STORE_PENDING_UPDATES_LEGACY = "pendingTaskUpdates";
const STORE_CACHED_TASKS_LEGACY = "careTasksCache";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Vérifie indexedDB lui-même, pas la présence de `window` : c'est la seule API dont cette
    // fonction a réellement besoin (et c'est ce que fake-indexeddb polyfille pour les tests —
    // cf. offlineSync.test.ts — sans fournir tout un faux `window`).
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non supporté"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction!;

      if (!db.objectStoreNames.contains(STORE_PENDING_ACTIONS)) {
        const store = db.createObjectStore(STORE_PENDING_ACTIONS, { keyPath: "id", autoIncrement: true });
        store.createIndex("type", "type");
      }

      if (db.objectStoreNames.contains(STORE_PENDING_UPDATES_LEGACY)) {
        const legacyStore = tx.objectStore(STORE_PENDING_UPDATES_LEGACY);
        const newStore = tx.objectStore(STORE_PENDING_ACTIONS);
        legacyStore.openCursor().onsuccess = (cursorEvent) => {
          const cursor = (cursorEvent.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor) {
            const old = cursor.value as { taskId: string; patientId: string; isCompleted: boolean; timestamp: number };
            newStore.add({
              type: "TASK_TOGGLE",
              payload: { taskId: old.taskId, patientId: old.patientId, isCompleted: old.isCompleted },
              label: "Tâche de soins",
              createdAt: old.timestamp || Date.now(),
              attempts: 0,
            });
            cursor.continue();
          } else {
            db.deleteObjectStore(STORE_PENDING_UPDATES_LEGACY);
          }
        };
      }
      if (db.objectStoreNames.contains(STORE_CACHED_TASKS_LEGACY)) {
        db.deleteObjectStore(STORE_CACHED_TASKS_LEGACY); // jamais utilisé, cf. historique du fichier
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Ouvre une connexion, exécute `fn`, puis la referme systématiquement — une connexion IndexedDB
// laissée ouverte bloque toute future ouverture à une version supérieure (onupgradeneeded reste
// en attente, cf. onblocked) : chaque fonction ci-dessous n'a besoin de sa connexion que le temps
// d'une seule transaction, jamais plus.
async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

function notifyQueueChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  }
}

// Enregistre une action à exécuter dès que le réseau revient — appelée par
// src/lib/offline-submit.ts, jamais directement par un composant (cf. ce fichier pour le
// pourquoi : on ne met en file que l'échec réel d'un appel déjà tenté, jamais une anticipation).
export async function enqueueOfflineAction<K extends OfflineActionType>(
  type: K,
  payload: OfflineActionPayloadMap[K],
  label: string
): Promise<void> {
  try {
    await withDb(async (db) => {
      const tx = db.transaction(STORE_PENDING_ACTIONS, "readwrite");
      const store = tx.objectStore(STORE_PENDING_ACTIONS);
      const action: Omit<PendingOfflineAction, "id"> = { type, payload, label, createdAt: Date.now(), attempts: 0 } as Omit<PendingOfflineAction, "id">;
      await new Promise<void>((resolve, reject) => {
        const req = store.add(action);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
    notifyQueueChange();
  } catch (err) {
    console.error("[OfflineSync] Erreur sauvegarde locale:", err);
    throw err; // l'appelant (offline-submit.ts) doit savoir si la mise en file a elle-même échoué
  }
}

export async function getPendingActions(): Promise<PendingOfflineAction[]> {
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(STORE_PENDING_ACTIONS, "readonly");
      const store = tx.objectStore(STORE_PENDING_ACTIONS);
      return await new Promise<PendingOfflineAction[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as PendingOfflineAction[]);
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    return [];
  }
}

export async function getPendingActionsCount(): Promise<number> {
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(STORE_PENDING_ACTIONS, "readonly");
      const store = tx.objectStore(STORE_PENDING_ACTIONS);
      return await new Promise<number>((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    return 0;
  }
}

async function removePendingAction(id: number): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(STORE_PENDING_ACTIONS, "readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = tx.objectStore(STORE_PENDING_ACTIONS).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

async function markPendingActionError(id: number, message: string): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(STORE_PENDING_ACTIONS, "readwrite");
    const store = tx.objectStore(STORE_PENDING_ACTIONS);
    const existing = await new Promise<PendingOfflineAction | undefined>((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!existing) return;
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ ...existing, lastError: message, attempts: (existing.attempts || 0) + 1 });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

// Retire une action de la file sans tenter de la synchroniser — réservé au coordinateur qui
// examine un conflit (cf. OfflineBanner) et décide qu'elle ne doit plus être rejouée (ex: vente
// de toute façon annulée entretemps par un autre moyen).
export async function discardPendingAction(id: number): Promise<void> {
  await removePendingAction(id);
  notifyQueueChange();
}

// Une entrée par type d'action, résolue paresseusement (import dynamique) pour ne jamais tirer
// les Server Actions correspondantes dans un bundle qui n'en a pas besoin.
async function dispatch(action: PendingOfflineAction): Promise<{ success: boolean; error?: string }> {
  switch (action.type) {
    case "TASK_TOGGLE": {
      const { toggleTaskStatus } = await import("@/actions/careplans");
      return toggleTaskStatus(action.payload.taskId, action.payload.patientId, action.payload.isCompleted);
    }
    case "VITALS": {
      const { recordVitalSign } = await import("@/actions/vitals");
      return recordVitalSign(action.payload);
    }
    case "LAB_ORDER": {
      const { createLabOrder } = await import("@/actions/lab");
      return createLabOrder(action.payload);
    }
    case "CAISSE_SALE": {
      const { createCaisseSale } = await import("@/actions/finance");
      return createCaisseSale(action.payload);
    }
    case "CAISSE_PAY": {
      const { payPendingInvoice } = await import("@/actions/finance");
      return payPendingInvoice(action.payload.pendingInvoiceId, action.payload.cashSessionId, action.payload.amount, action.payload.items);
    }
  }
}

// Rejoue la file dans l'ordre d'arrivée (jamais en parallèle : un paiement doit arriver après la
// vente qui l'a précédé si les deux sont en attente, et une connexion tout juste retrouvée tient
// mieux une requête à la fois qu'une rafale). Une action qui réussit est retirée ; une action qui
// échoue reste en file avec son erreur, retentée au prochain appel — jamais perdue en silence.
export async function syncPendingActions(): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;

  const pending = await getPendingActions();
  for (const action of pending) {
    try {
      const res = await dispatch(action);
      if (res.success) {
        await removePendingAction(action.id);
        synced++;
      } else {
        await markPendingActionError(action.id, res.error || "Erreur lors de la synchronisation.");
        failed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau — nouvelle tentative au prochain retour de connexion.";
      await markPendingActionError(action.id, message);
      failed++;
    }
  }

  notifyQueueChange();
  return { synced, failed };
}
