import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENTRY = { userId: "user1", title: "Alerte", message: "Un événement est survenu.", type: "STOCK_LOW" };

function mockWebPush(sendNotification: (...args: any[]) => Promise<any> = vi.fn(async () => ({}))) {
  const impl = { setVapidDetails: vi.fn(), sendNotification };
  vi.doMock("web-push", () => ({ default: impl, ...impl }));
  return impl;
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("sendPushToUsers", () => {
  it("n'appelle jamais webpush.sendNotification si les clés VAPID ne sont pas configurées", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;

    const { sendNotification } = mockWebPush();
    const userFindMany = vi.fn(async () => []);
    vi.doMock("./db", () => ({ prisma: { user: { findMany: userFindMany }, pushSubscription: { findMany: vi.fn() } } }));
    const { sendPushToUsers } = await import("./push");

    await sendPushToUsers([ENTRY]);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("n'envoie rien pour un type que le destinataire a rendu muet (mutedNotificationTypes)", async () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";

    const { sendNotification } = mockWebPush();
    const subFindMany = vi.fn(async () => []);
    vi.doMock("./db", () => ({
      prisma: {
        user: { findMany: vi.fn(async () => [{ id: "user1", mutedNotificationTypes: ["STOCK_LOW"] }]) },
        pushSubscription: { findMany: subFindMany },
      },
    }));
    const { sendPushToUsers } = await import("./push");

    await sendPushToUsers([ENTRY]);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(subFindMany).not.toHaveBeenCalled();
  });

  it("envoie à chaque abonnement d'un même utilisateur (multi-appareil)", async () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";

    const { sendNotification } = mockWebPush();
    vi.doMock("./db", () => ({
      prisma: {
        user: { findMany: vi.fn(async () => [{ id: "user1", mutedNotificationTypes: [] }]) },
        pushSubscription: {
          findMany: vi.fn(async () => [
            { id: "sub1", userId: "user1", endpoint: "https://push.example.com/device1", p256dh: "p1", auth: "a1" },
            { id: "sub2", userId: "user1", endpoint: "https://push.example.com/device2", p256dh: "p2", auth: "a2" },
          ]),
        },
      },
    }));
    const { sendPushToUsers } = await import("./push");

    await sendPushToUsers([ENTRY]);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/device1", keys: { p256dh: "p1", auth: "a1" } },
      JSON.stringify({ title: ENTRY.title, body: ENTRY.message })
    );
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/device2", keys: { p256dh: "p2", auth: "a2" } },
      JSON.stringify({ title: ENTRY.title, body: ENTRY.message })
    );
  });

  it("supprime la PushSubscription dont l'envoi échoue avec un statut 410 (abonnement expiré)", async () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";

    const sendNotification = vi.fn(async ({ endpoint }: any) => {
      if (endpoint === "https://push.example.com/dead") {
        const err: any = new Error("Gone");
        err.statusCode = 410;
        throw err;
      }
      return {};
    });
    mockWebPush(sendNotification);
    const deleteFn = vi.fn(async () => ({}));
    vi.doMock("./db", () => ({
      prisma: {
        user: { findMany: vi.fn(async () => [{ id: "user1", mutedNotificationTypes: [] }]) },
        pushSubscription: {
          findMany: vi.fn(async () => [
            { id: "dead-sub", userId: "user1", endpoint: "https://push.example.com/dead", p256dh: "p1", auth: "a1" },
            { id: "alive-sub", userId: "user1", endpoint: "https://push.example.com/alive", p256dh: "p2", auth: "a2" },
          ]),
          delete: deleteFn,
        },
      },
    }));
    const { sendPushToUsers } = await import("./push");

    await sendPushToUsers([ENTRY]);

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalledWith({ where: { id: "dead-sub" } });
  });

  it("ne supprime pas l'abonnement pour une erreur d'envoi qui n'est pas 404/410", async () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";

    const sendNotification = vi.fn(async () => {
      const err: any = new Error("Service temporairement indisponible");
      err.statusCode = 503;
      throw err;
    });
    mockWebPush(sendNotification);
    const deleteFn = vi.fn(async () => ({}));
    vi.doMock("./db", () => ({
      prisma: {
        user: { findMany: vi.fn(async () => [{ id: "user1", mutedNotificationTypes: [] }]) },
        pushSubscription: {
          findMany: vi.fn(async () => [
            { id: "sub1", userId: "user1", endpoint: "https://push.example.com/device1", p256dh: "p1", auth: "a1" },
          ]),
          delete: deleteFn,
        },
      },
    }));
    const { sendPushToUsers } = await import("./push");

    await sendPushToUsers([ENTRY]);

    expect(deleteFn).not.toHaveBeenCalled();
  });
});
