import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Polyfill IndexedDB pour l'environnement de test "node" (vitest.config.ts) — ce module n'existe
// nulle part autrement dans ce projet, tout le reste des tests mocke Prisma, jamais le navigateur.
import "fake-indexeddb/auto";
import { indexedDB as fakeIndexedDB, IDBKeyRange as fakeIDBKeyRange } from "fake-indexeddb";

const DB_NAME = "MedDocOfflineDB";

function resetFakeIndexedDb() {
  // fake-indexeddb garde son contenu en mémoire d'un test à l'autre (pas de rechargement de
  // page entre deux `it()`) — on repart d'une base vide à chaque test pour qu'ils restent
  // indépendants les uns des autres.
  const globalForIndexedDb = globalThis as unknown as { indexedDB: typeof fakeIndexedDB; IDBKeyRange: typeof fakeIDBKeyRange };
  globalForIndexedDb.indexedDB = fakeIndexedDB;
  globalForIndexedDb.IDBKeyRange = fakeIDBKeyRange;
}

async function deleteDb() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("offlineSync — file d'attente générique", () => {
  beforeEach(async () => {
    vi.resetModules();
    resetFakeIndexedDb();
    await deleteDb();
  });

  afterEach(async () => {
    await deleteDb();
  });

  it("met en file puis retrouve une action, avec le bon compteur", async () => {
    const { enqueueOfflineAction, getPendingActions, getPendingActionsCount } = await import("./offlineSync");

    await enqueueOfflineAction("VITALS", { patientId: "p1", temperature: 38 }, "Constantes — Jean Dupont");

    expect(await getPendingActionsCount()).toBe(1);
    const pending = await getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      type: "VITALS",
      payload: { patientId: "p1", temperature: 38 },
      label: "Constantes — Jean Dupont",
      attempts: 0,
    });
    expect(pending[0].lastError).toBeUndefined();
  });

  it("conserve l'ordre d'arrivée entre plusieurs actions", async () => {
    const { enqueueOfflineAction, getPendingActions } = await import("./offlineSync");

    await enqueueOfflineAction("VITALS", { patientId: "p1" }, "Premier");
    await enqueueOfflineAction("LAB_ORDER", { patientId: "p1", tests: ["NFS"] }, "Deuxième");
    await enqueueOfflineAction("CAISSE_SALE", { cashSessionId: "cs1", items: [] }, "Troisième");

    const pending = await getPendingActions();
    expect(pending.map((a) => a.label)).toEqual(["Premier", "Deuxième", "Troisième"]);
  });

  describe("syncPendingActions", () => {
    it("retire une action de la file dès qu'elle est synchronisée avec succès", async () => {
      const recordVitalSign = vi.fn(async () => ({ success: true, data: { id: "v1" } }));
      vi.doMock("@/actions/vitals", () => ({ recordVitalSign }));

      const { enqueueOfflineAction, getPendingActionsCount, syncPendingActions } = await import("./offlineSync");
      await enqueueOfflineAction("VITALS", { patientId: "p1" }, "Constantes");

      const result = await syncPendingActions();

      expect(result).toEqual({ synced: 1, failed: 0 });
      expect(recordVitalSign).toHaveBeenCalledWith({ patientId: "p1" });
      expect(await getPendingActionsCount()).toBe(0);
    });

    // Régression : l'ancienne version appelait store.clear() sans condition après avoir tout
    // tenté, donc une action en échec de synchronisation disparaissait silencieusement — jamais
    // retentée, jamais visible nulle part (cf. commentaire en tête de offlineSync.ts).
    it("garde en file une action dont la synchronisation échoue, avec le message d'erreur (jamais perdue en silence)", async () => {
      const createCaisseSale = vi.fn(async () => ({ success: false, error: "Aucune session de caisse ouverte." }));
      vi.doMock("@/actions/finance", () => ({ createCaisseSale }));

      const { enqueueOfflineAction, getPendingActions, syncPendingActions } = await import("./offlineSync");
      await enqueueOfflineAction("CAISSE_SALE", { cashSessionId: "s1", items: [] }, "Vente — client comptant");

      const result = await syncPendingActions();

      expect(result).toEqual({ synced: 0, failed: 1 });
      const pending = await getPendingActions();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ lastError: "Aucune session de caisse ouverte.", attempts: 1 });
    });

    it("garde en file une action qui lève une exception réseau, sans faire planter les autres", async () => {
      const toggleTaskStatus = vi.fn(async () => {
        throw new Error("Failed to fetch");
      });
      const recordVitalSign = vi.fn(async () => ({ success: true, data: { id: "v1" } }));
      vi.doMock("@/actions/careplans", () => ({ toggleTaskStatus }));
      vi.doMock("@/actions/vitals", () => ({ recordVitalSign }));

      const { enqueueOfflineAction, getPendingActions, syncPendingActions } = await import("./offlineSync");
      await enqueueOfflineAction("TASK_TOGGLE", { taskId: "t1", patientId: "p1", isCompleted: true }, "Tâche");
      await enqueueOfflineAction("VITALS", { patientId: "p1" }, "Constantes");

      const result = await syncPendingActions();

      expect(result).toEqual({ synced: 1, failed: 1 });
      const pending = await getPendingActions();
      expect(pending).toHaveLength(1);
      expect(pending[0].type).toBe("TASK_TOGGLE");
      expect(pending[0].lastError).toBe("Failed to fetch");
    });

    it("rejoue dans l'ordre d'arrivée, une action à la fois (jamais en parallèle)", async () => {
      const order: string[] = [];
      const recordVitalSign = vi.fn(async () => {
        order.push("start-1");
        await new Promise((r) => setTimeout(r, 10));
        order.push("end-1");
        return { success: true, data: {} };
      });
      const createLabOrder = vi.fn(async () => {
        order.push("start-2");
        order.push("end-2");
        return { success: true, data: {} };
      });
      vi.doMock("@/actions/vitals", () => ({ recordVitalSign }));
      vi.doMock("@/actions/lab", () => ({ createLabOrder }));

      const { enqueueOfflineAction, syncPendingActions } = await import("./offlineSync");
      await enqueueOfflineAction("VITALS", { patientId: "p1" }, "Premier");
      await enqueueOfflineAction("LAB_ORDER", { patientId: "p1", tests: ["NFS"] }, "Deuxième");

      await syncPendingActions();

      // Si les deux partaient en parallèle, "start-2" apparaîtrait avant "end-1" (le premier
      // appel est volontairement ralenti de 10ms) — l'ordre strict confirme un traitement
      // séquentiel.
      expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    });
  });

  it("discardPendingAction retire une action sans jamais tenter de la synchroniser", async () => {
    const createCaisseSale = vi.fn();
    vi.doMock("@/actions/finance", () => ({ createCaisseSale }));

    const { enqueueOfflineAction, getPendingActions, discardPendingAction, getPendingActionsCount } = await import("./offlineSync");
    await enqueueOfflineAction("CAISSE_SALE", { cashSessionId: "cs1", items: [] }, "Vente");
    const [action] = await getPendingActions();

    await discardPendingAction(action.id);

    expect(await getPendingActionsCount()).toBe(0);
    expect(createCaisseSale).not.toHaveBeenCalled();
  });

  it("migre les tâches de soins en attente de l'ancien format (v1) vers la file générique, sans rien perdre", async () => {
    // Simule un appareil qui avait déjà des tâches en attente avant la mise à jour de l'app :
    // on crée nous-mêmes la base en version 1 avec l'ancien store, comme le faisait l'ancien
    // offlineSync.ts.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("pendingTaskUpdates", { keyPath: "id", autoIncrement: true });
        req.result.createObjectStore("careTasksCache", { keyPath: "taskId" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("pendingTaskUpdates", "readwrite");
        tx.objectStore("pendingTaskUpdates").add({ taskId: "t1", patientId: "p1", isCompleted: true, timestamp: 1700000000000 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const { getPendingActions } = await import("./offlineSync");
    const pending = await getPendingActions();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      type: "TASK_TOGGLE",
      payload: { taskId: "t1", patientId: "p1", isCompleted: true },
      createdAt: 1700000000000,
    });

    // L'ancien store ne doit plus exister après la migration (plus de double comptage possible).
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(db.objectStoreNames.contains("pendingTaskUpdates")).toBe(false);
    expect(db.objectStoreNames.contains("pendingActions")).toBe(true);
    db.close();
  });
});
