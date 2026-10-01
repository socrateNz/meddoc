import { describe, it, expect, vi, beforeEach } from "vitest";
import { isOrgInScope, orgScopeWhere, presenceStatus, PRESENCE_ONLINE_MS, PRESENCE_RECENT_MS } from "./messages-data";

describe("presenceStatus", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("hors ligne si jamais vu", () => {
    expect(presenceStatus(null, now)).toBe("offline");
    expect(presenceStatus(undefined, now)).toBe("offline");
  });

  it("en ligne sous le seuil (2 min), y compris pile dessus", () => {
    expect(presenceStatus(new Date(now.getTime() - 10_000), now)).toBe("online");
    expect(presenceStatus(new Date(now.getTime() - PRESENCE_ONLINE_MS), now)).toBe("online");
  });

  it("vu récemment entre 2 et 15 min", () => {
    expect(presenceStatus(new Date(now.getTime() - PRESENCE_ONLINE_MS - 1), now)).toBe("recent");
    expect(presenceStatus(new Date(now.getTime() - PRESENCE_RECENT_MS), now)).toBe("recent");
  });

  it("hors ligne au-delà de 15 min", () => {
    expect(presenceStatus(new Date(now.getTime() - PRESENCE_RECENT_MS - 1), now)).toBe("offline");
  });

  it("une horloge client légèrement en avance (lastActiveAt dans le futur) reste 'en ligne', jamais pire", () => {
    expect(presenceStatus(new Date(now.getTime() + 5_000), now)).toBe("online");
  });
});

describe("orgScopeWhere / isOrgInScope", () => {
  it("une clinique ne voit que sa propre organisation", () => {
    const user = { organizationId: "org1", organization: { type: "CLINIC" } };
    expect(orgScopeWhere(user)).toEqual({ organizationId: "org1" });
    expect(isOrgInScope(user, "org1")).toBe(true);
    expect(isOrgInScope(user, "org2")).toBe(false);
  });

  it("une holding voit sa propre organisation et ses cliniques filles (OR)", () => {
    const user = { organizationId: "holding1", organization: { type: "HOLDING" } };
    expect(orgScopeWhere(user)).toEqual({
      OR: [{ organizationId: "holding1" }, { organization: { parentId: "holding1" } }],
    });
    // isOrgInScope seule ne peut pas vérifier le lien de parenté réel (ça se résout en base, via
    // orgScopeWhere) — elle fait confiance à l'appelant pour une holding, jamais pour une clinique.
    expect(isOrgInScope(user, "n'importe quelle clinique")).toBe(true);
  });

  it("aucune organisation : aucune portée", () => {
    const user = { organizationId: null };
    expect(orgScopeWhere(user)).toBeNull();
    expect(isOrgInScope(user, "org1")).toBe(false);
  });

  it("isOrgInScope refuse une cible vide", () => {
    expect(isOrgInScope({ organizationId: "org1", organization: { type: "CLINIC" } }, null)).toBe(false);
    expect(isOrgInScope({ organizationId: "org1", organization: { type: "CLINIC" } }, undefined)).toBe(false);
  });
});

describe("fetchMessagingPageData", () => {
  const currentUser = { id: "me", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };

  beforeEach(() => {
    vi.resetModules();
  });

  function mockDb(overrides: Partial<Record<"conversationFindMany" | "messageFindMany" | "userFindMany", any>> = {}) {
    const conversationFindMany = overrides.conversationFindMany ?? vi.fn(async ({ where }: any) => (where.type === "CHANNEL" ? [] : []));
    const messageFindMany = overrides.messageFindMany ?? vi.fn(async () => []);
    const userFindMany = overrides.userFindMany ?? vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findMany: conversationFindMany, createMany: vi.fn(async () => ({ count: 0 })) },
        message: { findMany: messageFindMany },
        user: { findMany: userFindMany },
      },
    }));
    return { conversationFindMany, messageFindMany, userFindMany };
  }

  it("ne lit ni canaux ni destinataires si les portées respectives sont absentes (aucun établissement)", async () => {
    const { conversationFindMany, userFindMany } = mockDb({
      conversationFindMany: vi.fn(async ({ where }: any) => (where.type === "DM" ? [] : [])),
    });
    const { fetchMessagingPageData } = await import("./messages-data");

    const result = await fetchMessagingPageData({
      currentUser,
      channelsOrganizationId: null,
      otherUsersWhere: null,
      activeConversationId: null,
    });

    expect(result.channels).toEqual([]);
    expect(result.otherUsers).toEqual([]);
    expect(userFindMany).not.toHaveBeenCalled();
    // Seul l'appel DM (type toujours interrogé) — pas d'appel CHANNEL puisque channelsOrganizationId est null.
    expect(conversationFindMany).toHaveBeenCalledTimes(1);
    expect(conversationFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { type: "DM", participants: { some: { userId: "me" } } } }));
  });

  it("interroge les canaux avec channelsOrganizationId et les destinataires avec otherUsersWhere, indépendamment l'un de l'autre", async () => {
    const conversationFindMany = vi.fn(async ({ where }: any) => (where.type === "CHANNEL" ? [{ id: "chan1" }] : []));
    const userFindMany = vi.fn(async () => [{ id: "u1" }]);
    mockDb({ conversationFindMany, userFindMany });
    const { fetchMessagingPageData } = await import("./messages-data");

    // Cas holding sur /dashboard/messages : otherUsersWhere plus large (OR) que channelsOrganizationId.
    const result = await fetchMessagingPageData({
      currentUser,
      channelsOrganizationId: "clinicA",
      otherUsersWhere: { OR: [{ organizationId: "holding1" }, { organization: { parentId: "holding1" } }] },
      activeConversationId: null,
    });

    expect(result.channels).toEqual([{ id: "chan1" }]);
    expect(result.otherUsers).toEqual([{ id: "u1" }]);
    expect(conversationFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "clinicA", type: "CHANNEL" } }));
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { not: "me" }, isActive: true, OR: [{ organizationId: "holding1" }, { organization: { parentId: "holding1" } }] } })
    );
  });

  it("charge les messages (remis en ordre chronologique) d'une conversation active connue (canal ou DM)", async () => {
    const conversationFindMany = vi.fn(async ({ where }: any) => (where.type === "CHANNEL" ? [{ id: "chan1", type: "CHANNEL", title: "urgences" }] : []));
    const messageFindMany = vi.fn(async () => [{ id: "m2", createdAt: new Date(2) }, { id: "m1", createdAt: new Date(1) }]);
    mockDb({ conversationFindMany, messageFindMany });
    const { fetchMessagingPageData } = await import("./messages-data");

    const result = await fetchMessagingPageData({
      currentUser,
      channelsOrganizationId: "org1",
      otherUsersWhere: { organizationId: "org1" },
      activeConversationId: "chan1",
    });

    expect(result.activeConversation).toEqual({ id: "chan1", type: "CHANNEL", title: "urgences" });
    expect(result.messages.map((m: any) => m.id)).toEqual(["m1", "m2"]); // le plus ancien d'abord
  });

  it("une conversation active inconnue/inaccessible retombe sur 'aucune sélectionnée', sans erreur", async () => {
    mockDb(); // aucun canal, aucun DM connu
    const { fetchMessagingPageData } = await import("./messages-data");

    const result = await fetchMessagingPageData({
      currentUser,
      channelsOrganizationId: "org1",
      otherUsersWhere: { organizationId: "org1" },
      activeConversationId: "conversation-dun-autre-etablissement",
    });

    expect(result.activeConversation).toBeNull();
    expect(result.messages).toEqual([]);
  });
});

describe("ensureDefaultChannels", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("crée les 3 canaux par défaut quand aucun n'existe", async () => {
    const createMany = vi.fn(async () => ({ count: 3 }));
    vi.doMock("@/lib/db", () => ({
      prisma: { conversation: { findMany: vi.fn(async () => []), createMany } },
    }));
    const { ensureDefaultChannels } = await import("./messages-data");

    await ensureDefaultChannels("org1", "user1");

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { title: "urgences", type: "CHANNEL", organizationId: "org1", createdById: "user1" },
        { title: "garde-nuit", type: "CHANNEL", organizationId: "org1", createdById: "user1" },
        { title: "staff-médical", type: "CHANNEL", organizationId: "org1", createdById: "user1" },
      ],
    });
  });

  it("est idempotente : ne recrée jamais un canal déjà présent", async () => {
    const createMany = vi.fn(async () => ({ count: 0 }));
    vi.doMock("@/lib/db", () => ({
      prisma: { conversation: { findMany: vi.fn(async () => [{ title: "urgences" }]), createMany } },
    }));
    const { ensureDefaultChannels } = await import("./messages-data");

    await ensureDefaultChannels("org1", "user1");

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { title: "garde-nuit", type: "CHANNEL", organizationId: "org1", createdById: "user1" },
        { title: "staff-médical", type: "CHANNEL", organizationId: "org1", createdById: "user1" },
      ],
    });
  });

  it("ne fait aucun appel d'écriture si les 3 canaux existent déjà", async () => {
    const createMany = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: {
          findMany: vi.fn(async () => [{ title: "urgences" }, { title: "garde-nuit" }, { title: "staff-médical" }]),
          createMany,
        },
      },
    }));
    const { ensureDefaultChannels } = await import("./messages-data");

    await ensureDefaultChannels("org1", "user1");

    expect(createMany).not.toHaveBeenCalled();
  });
});
