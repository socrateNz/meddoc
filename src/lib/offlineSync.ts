import { toggleTaskStatus } from "@/actions/careplans";

export interface PendingTaskUpdate {
  id?: number;
  taskId: string;
  patientId: string;
  isCompleted: boolean;
  timestamp: number;
}

const DB_NAME = "MedDocOfflineDB";
const DB_VERSION = 1;
const STORE_PENDING_UPDATES = "pendingTaskUpdates";
const STORE_CACHED_TASKS = "careTasksCache";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB non supporté"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PENDING_UPDATES)) {
        db.createObjectStore(STORE_PENDING_UPDATES, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_CACHED_TASKS)) {
        db.createObjectStore(STORE_CACHED_TASKS, { keyPath: "taskId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function notifyQueueChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  }
}

/**
 * Enregistre une mise à jour de tâche effectuée hors-ligne
 */
export async function enqueueOfflineTaskToggle(
  taskId: string,
  patientId: string,
  isCompleted: boolean
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PENDING_UPDATES, "readwrite");
    const store = tx.objectStore(STORE_PENDING_UPDATES);

    const update: PendingTaskUpdate = {
      taskId,
      patientId,
      isCompleted,
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const req = store.add(update);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    notifyQueueChange();
  } catch (err) {
    console.error("[OfflineSync] Erreur sauvegarde locale:", err);
  }
}

/**
 * Récupère le nombre de modifications en attente dans la file
 */
export async function getPendingTaskUpdatesCount(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PENDING_UPDATES, "readonly");
    const store = tx.objectStore(STORE_PENDING_UPDATES);

    return new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return 0;
  }
}

/**
 * Récupère la liste de toutes les mises à jour en attente
 */
export async function getPendingTaskUpdates(): Promise<PendingTaskUpdate[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PENDING_UPDATES, "readonly");
    const store = tx.objectStore(STORE_PENDING_UPDATES);

    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as PendingTaskUpdate[]);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Synchronise toutes les tâches en attente avec le serveur
 */
export async function syncPendingOfflineTasks(): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  try {
    const pending = await getPendingTaskUpdates();
    if (pending.length === 0) return { synced: 0, errors: 0 };

    for (const item of pending) {
      try {
        const res = await toggleTaskStatus(item.taskId, item.patientId, item.isCompleted);
        if (res.success) {
          synced++;
        } else {
          errors++;
        }
      } catch (err) {
        errors++;
      }
    }

    // Effacer la file une fois traitée
    const db = await openDB();
    const tx = db.transaction(STORE_PENDING_UPDATES, "readwrite");
    const store = tx.objectStore(STORE_PENDING_UPDATES);

    await new Promise<void>((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    notifyQueueChange();
  } catch (err) {
    console.error("[OfflineSync] Erreur lors de la synchronisation:", err);
  }

  return { synced, errors };
}
