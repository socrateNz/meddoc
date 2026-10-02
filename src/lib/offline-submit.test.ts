import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("submitOrQueueOffline", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exécute l'action réelle quand le navigateur se déclare en ligne, sans jamais mettre en file", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const enqueueOfflineAction = vi.fn();
    vi.doMock("./offlineSync", () => ({ enqueueOfflineAction }));
    const { submitOrQueueOffline } = await import("./offline-submit");

    const action = vi.fn(async () => ({ success: true, data: { id: "v1" } }));
    const result = await submitOrQueueOffline({ action, queueType: "VITALS", payload: { patientId: "p1" }, label: "Constantes" });

    expect(result).toEqual({ queued: false, success: true, data: { id: "v1" }, error: undefined });
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it("transmet un refus MÉTIER tel quel (jamais mis en file — ce n'est pas un problème réseau)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const enqueueOfflineAction = vi.fn();
    vi.doMock("./offlineSync", () => ({ enqueueOfflineAction }));
    const { submitOrQueueOffline } = await import("./offline-submit");

    const action = vi.fn(async () => ({ success: false, error: "Stock insuffisant." }));
    const result = await submitOrQueueOffline({ action, queueType: "CAISSE_SALE", payload: { cashSessionId: "cs1", items: [] }, label: "Vente" });

    expect(result).toEqual({ queued: false, success: false, data: undefined, error: "Stock insuffisant." });
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it("met en file sans même tenter l'appel quand navigator.onLine vaut déjà false", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const enqueueOfflineAction = vi.fn(async () => {});
    vi.doMock("./offlineSync", () => ({ enqueueOfflineAction }));
    const { submitOrQueueOffline } = await import("./offline-submit");

    const action = vi.fn();
    const result = await submitOrQueueOffline({ action, queueType: "LAB_ORDER", payload: { patientId: "p1", tests: ["NFS"] }, label: "Demande" });

    expect(result).toEqual({ queued: true, success: true });
    expect(action).not.toHaveBeenCalled();
    expect(enqueueOfflineAction).toHaveBeenCalledWith("LAB_ORDER", { patientId: "p1", tests: ["NFS"] }, "Demande");
  });

  it("bascule en file quand l'appel réel échoue par une exception (connexion qui se déclarait active mais morte)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const enqueueOfflineAction = vi.fn(async () => {});
    vi.doMock("./offlineSync", () => ({ enqueueOfflineAction }));
    const { submitOrQueueOffline } = await import("./offline-submit");

    const action = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    const payload = { taskId: "t1", patientId: "p1", isCompleted: true };
    const result = await submitOrQueueOffline({ action, queueType: "TASK_TOGGLE", payload, label: "Tâche" });

    expect(result).toEqual({ queued: true, success: true });
    expect(enqueueOfflineAction).toHaveBeenCalledWith("TASK_TOGGLE", payload, "Tâche");
  });

  it("si la mise en file elle-même échoue (stockage local indisponible), renvoie un échec explicite plutôt que de perdre l'action", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const enqueueOfflineAction = vi.fn(async () => {
      throw new Error("IndexedDB non supporté");
    });
    vi.doMock("./offlineSync", () => ({ enqueueOfflineAction }));
    const { submitOrQueueOffline } = await import("./offline-submit");

    const result = await submitOrQueueOffline({ action: vi.fn(), queueType: "VITALS", payload: { patientId: "p1" }, label: "Constantes" });

    expect(result.queued).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/impossible d'enregistrer localement/);
  });
});
