import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { userId: string; action: string; key: string; requestHash: string; status: string; result: unknown };
type Where = { userId_action_key: { userId: string; action: string; key: string } };

// Reproduit le comportement utile de Prisma : contrainte d'unicité [userId, action, key] (P2002),
// P2025 à la suppression d'une ligne absente.
function fakeDb() {
  const rows = new Map<string, Row>();
  const id = (w: Where) => `${w.userId_action_key.userId}|${w.userId_action_key.action}|${w.userId_action_key.key}`;
  const prisma = {
    idempotencyRecord: {
      findUnique: vi.fn(async ({ where }: { where: Where }) => rows.get(id(where)) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const k = `${data.userId}|${data.action}|${data.key}`;
        if (rows.has(k)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        const row = { ...data, result: null };
        rows.set(k, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        const row = rows.get(id(where));
        if (!row) throw Object.assign(new Error("Record not found"), { code: "P2025" });
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: Where }) => {
        const k = id(where);
        if (!rows.has(k)) throw Object.assign(new Error("Record not found"), { code: "P2025" });
        const row = rows.get(k);
        rows.delete(k);
        return row;
      }),
    },
  };
  return { prisma, rows };
}

let currentUser: { id: string } | null = { id: "user1" };

async function load(db: ReturnType<typeof fakeDb>) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ prisma: db.prisma }));
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => currentUser) }));
  return import("./idempotency");
}

beforeEach(() => {
  currentUser = { id: "user1" };
});

describe("runIdempotent", () => {
  it("sans clé, exécute l'action directement sans rien mémoriser", async () => {
    const db = fakeDb();
    const { runIdempotent } = await load(db);
    const run = vi.fn(async () => ({ success: true, data: 1 }));

    const res = await runIdempotent("createX", undefined, { a: 1 }, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, data: 1 });
    expect(db.prisma.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it("une même clé déjà réussie renvoie le résultat mémorisé sans relancer l'action", async () => {
    const db = fakeDb();
    const { runIdempotent } = await load(db);
    const run = vi.fn(async () => ({ success: true, data: { id: "pay1" } }));

    const first = await runIdempotent("payX", "k1", { amount: 500 }, run);
    const second = await runIdempotent("payX", "k1", { amount: 500 }, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ success: true, data: { id: "pay1" } });
    expect(second).toEqual(first);
  });

  it("un échec métier supprime l'entrée : une nouvelle tentative avec la même clé s'exécute vraiment", async () => {
    const db = fakeDb();
    const { runIdempotent } = await load(db);
    const run = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: "Session fermée." })
      .mockResolvedValueOnce({ success: true, data: "ok" });

    const first = await runIdempotent("payX", "k1", { amount: 500 }, run);
    const second = await runIdempotent("payX", "k1", { amount: 500 }, run);

    expect(first.success).toBe(false);
    expect(second).toEqual({ success: true, data: "ok" });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("une exception de l'action supprime aussi l'entrée et remonte l'erreur", async () => {
    const db = fakeDb();
    const { runIdempotent } = await load(db);
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ success: true });

    await expect(runIdempotent("payX", "k1", {}, run)).rejects.toThrow("boom");
    await expect(runIdempotent("payX", "k1", {}, run)).resolves.toEqual({ success: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("refuse de réutiliser une clé avec d'autres données, sans relancer l'action", async () => {
    const db = fakeDb();
    const { runIdempotent } = await load(db);
    const run = vi.fn(async () => ({ success: true, data: "A" }));

    await runIdempotent("payX", "k1", { amount: 500 }, run);
    const res = await runIdempotent<{ success: boolean; error?: string }>("payX", "k1", { amount: 900 }, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/d'autres valeurs/);
  });

  it("refuse une requête identique pendant qu'une première est encore en cours", async () => {
    const db = fakeDb();
    const { runIdempotent } = await load(db);
    let release: (value: { success: boolean }) => void = () => undefined;
    const slow = vi.fn(() => new Promise<{ success: boolean }>((resolve) => (release = resolve)));

    const firstCall = runIdempotent("payX", "k1", { amount: 500 }, slow);
    const second = await runIdempotent<{ success: boolean; error?: string }>("payX", "k1", { amount: 500 }, slow);
    release({ success: true });
    const first = await firstCall;

    expect(slow).toHaveBeenCalledTimes(1);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/en cours/);
    expect(first).toEqual({ success: true });
  });

  it("une clé appartient à un utilisateur : un autre utilisateur ne récupère jamais son résultat", async () => {
    const db = fakeDb();
    const { runIdempotent } = await load(db);
    const run = vi.fn(async () => ({ success: true, data: "A" }));

    await runIdempotent("payX", "k1", { amount: 500 }, run);
    currentUser = { id: "user2" };
    await runIdempotent("payX", "k1", { amount: 500 }, run);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("une clé vide ou trop longue est refusée sans exécuter l'action", async () => {
    const db = fakeDb();
    const { runIdempotent, MAX_IDEMPOTENCY_KEY_LENGTH } = await load(db);
    const run = vi.fn(async () => ({ success: true }));

    const empty = await runIdempotent("payX", "", {}, run);
    const tooLong = await runIdempotent("payX", "x".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1), {}, run);

    expect(empty.success).toBe(false);
    expect(tooLong.success).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("sans session, laisse l'action refuser elle-même l'appel", async () => {
    const db = fakeDb();
    currentUser = null;
    const { runIdempotent } = await load(db);
    const run = vi.fn(async () => ({ success: false, error: "Non authentifié." }));

    const res = await runIdempotent("payX", "k1", {}, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: false, error: "Non authentifié." });
    expect(db.prisma.idempotencyRecord.create).not.toHaveBeenCalled();
  });
});
