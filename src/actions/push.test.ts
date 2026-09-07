import { describe, it, expect, vi, beforeEach } from "vitest";

const activeUser = { id: "user1", role: "CASHIER", organizationId: "org1" };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => activeUser) }));
});

describe("subscribeToPush", () => {
  it("crée un abonnement pour un nouvel endpoint", async () => {
    const upsert = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({ prisma: { pushSubscription: { upsert } } }));
    const { subscribeToPush } = await import("./push");

    const result = await subscribeToPush({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });

    expect(result.success).toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example.com/abc" },
      create: { endpoint: "https://push.example.com/abc", p256dh: "p256dh-key", auth: "auth-key", userId: "user1" },
      update: { p256dh: "p256dh-key", auth: "auth-key", userId: "user1" },
    });
  });

  it("réassigne un endpoint déjà existant (autre utilisateur sur le même appareil) au userId courant", async () => {
    const upsert = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({ prisma: { pushSubscription: { upsert } } }));
    const { subscribeToPush } = await import("./push");

    await subscribeToPush({
      endpoint: "https://push.example.com/shared-device",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ userId: "user1" }) })
    );
  });

  it("refuse un payload sans endpoint ni clés", async () => {
    vi.doMock("@/lib/db", () => ({ prisma: { pushSubscription: { upsert: vi.fn() } } }));
    const { subscribeToPush } = await import("./push");

    const result = await subscribeToPush({ endpoint: "", keys: { p256dh: "", auth: "" } } as any);

    expect(result.success).toBe(false);
  });

  it("refuse si non authentifié", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
    vi.doMock("@/lib/db", () => ({ prisma: { pushSubscription: { upsert: vi.fn() } } }));
    const { subscribeToPush } = await import("./push");

    const result = await subscribeToPush({ endpoint: "e", keys: { p256dh: "p", auth: "a" } });

    expect(result.success).toBe(false);
  });
});

describe("unsubscribeFromPush", () => {
  it("supprime l'abonnement scopé au userId courant", async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    vi.doMock("@/lib/db", () => ({ prisma: { pushSubscription: { deleteMany } } }));
    const { unsubscribeFromPush } = await import("./push");

    const result = await unsubscribeFromPush("https://push.example.com/abc");

    expect(result.success).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({ where: { endpoint: "https://push.example.com/abc", userId: "user1" } });
  });

  it("refuse si non authentifié", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
    vi.doMock("@/lib/db", () => ({ prisma: { pushSubscription: { deleteMany: vi.fn() } } }));
    const { unsubscribeFromPush } = await import("./push");

    const result = await unsubscribeFromPush("e");

    expect(result.success).toBe(false);
  });
});
