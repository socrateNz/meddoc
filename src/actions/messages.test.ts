import { describe, it, expect, vi, beforeEach } from "vitest";

const coordinatorOrg1 = { id: "coord1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
const holdingAdmin = { id: "admin1", role: "ADMIN", organizationId: "holding1", organization: { type: "HOLDING" } };

describe("sendMessage — autorisation réelle d'accès à la conversation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  });

  it("refuse d'écrire dans un canal d'un autre établissement", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "org-autre", participants: [] })) },
        message: { create },
      },
    }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "chan1", content: "Bonjour" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à votre établissement/);
    expect(create).not.toHaveBeenCalled();
  });

  it("accepte d'écrire dans un canal du propre établissement", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn(async ({ data }: any) => ({ id: "msg1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "org1", participants: [] })) },
        message: { create },
      },
    }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "chan1", content: "Bonjour" });

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("une holding peut écrire dans le canal de n'importe laquelle de ses cliniques filles", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => holdingAdmin) }));
    const create = vi.fn(async ({ data }: any) => ({ id: "msg1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "clinique-fille", participants: [] })) },
        message: { create },
      },
    }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "chan1", content: "Bonjour l'équipe" });

    expect(result.success).toBe(true);
  });

  it("refuse d'écrire dans un DM dont on n'est pas participant", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "DM", organizationId: null, participants: [{ userId: "autre1" }, { userId: "autre2" }] })) },
        message: { create },
      },
    }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "dm1", content: "Bonjour" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ne faites pas partie de cette conversation/);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse une conversation introuvable", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    vi.doMock("@/lib/db", () => ({ prisma: { conversation: { findUnique: vi.fn(async () => null) }, message: { create: vi.fn() } } }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "inconnu", content: "Bonjour" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/introuvable/);
  });
});

describe("sendMessage — partage d'un dossier patient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  });

  it("refuse le partage pour un rôle sans accès clinique (ex: PHARMACIST)", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ ...coordinatorOrg1, role: "PHARMACIST" })) }));
    const patientFindFirst = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "org1", participants: [] })) },
        patient: { findFirst: patientFindFirst },
        message: { create: vi.fn() },
      },
    }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "chan1", content: "", sharedPatientId: "patient1" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Non autorisé à partager/);
    expect(patientFindFirst).not.toHaveBeenCalled();
  });

  it("refuse de partager un patient d'un autre établissement", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "org1", participants: [] })) },
        patient: { findFirst: vi.fn(async () => null) }, // hors de la portée org1 : rien trouvé
        message: { create: vi.fn() },
      },
    }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "chan1", content: "", sharedPatientId: "patient-autre-org" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à votre établissement/);
  });

  it("accepte un message sans texte s'il porte un patient partagé valide", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn(async ({ data }: any) => ({ id: "msg1", ...data }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "org1", participants: [] })) },
        patient: { findFirst: vi.fn(async () => ({ id: "patient1" })) },
        message: { create },
      },
    }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "chan1", content: "", sharedPatientId: "patient1" });

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sharedPatientId: "patient1", content: "" }) }));
  });

  it("refuse un message totalement vide (ni texte, ni pièce jointe, ni patient)", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { conversation: { findUnique: vi.fn() }, message: { create } } }));
    const { sendMessage } = await import("./messages");

    const result = await sendMessage({ conversationId: "chan1", content: "   " });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ne peut pas être vide/);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("createConversation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  });

  it("refuse un destinataire hors de l'établissement", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const conversationCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        user: { findFirst: vi.fn(async () => null) },
        conversation: { findFirst: vi.fn(), create: conversationCreate },
      },
    }));
    const { createConversation } = await import("./messages");

    const result = await createConversation("user-autre-org");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'appartient pas à votre établissement/);
    expect(conversationCreate).not.toHaveBeenCalled();
  });

  it("réutilise un DM déjà existant plutôt que d'en recréer un", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const conversationCreate = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        user: { findFirst: vi.fn(async () => ({ id: "target1" })) },
        conversation: { findFirst: vi.fn(async () => ({ id: "dm-existant" })), create: conversationCreate },
      },
    }));
    const { createConversation } = await import("./messages");

    const result = await createConversation("target1");

    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe("dm-existant");
    expect(conversationCreate).not.toHaveBeenCalled();
  });
});

describe("createChannel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  });

  it("refuse un rôle qui ne peut pas créer de canal", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ ...coordinatorOrg1, role: "CAREGIVER" })) }));
    const create = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { conversation: { findFirst: vi.fn(), create } } }));
    const { createChannel } = await import("./messages");

    const result = await createChannel({ name: "pédiatrie" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/coordinateur et l'administrateur/);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse un nom déjà pris pour cet établissement (insensible à la casse)", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: { conversation: { findFirst: vi.fn(async () => ({ id: "existing" })), create } },
    }));
    const { createChannel } = await import("./messages");

    const result = await createChannel({ name: "URGENCES" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/existe déjà/);
    expect(create).not.toHaveBeenCalled();
  });

  it("crée le canal dans le propre établissement du créateur", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn(async ({ data }: any) => ({ id: "chan-new", ...data }));
    vi.doMock("@/lib/db", () => ({ prisma: { conversation: { findFirst: vi.fn(async () => null), create } } }));
    const { createChannel } = await import("./messages");

    const result = await createChannel({ name: "pédiatrie" });

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith({ data: { title: "pédiatrie", type: "CHANNEL", organizationId: "org1", createdById: "coord1" } });
  });

  it("refuse de créer un canal pour un établissement hors de sa portée", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const create = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { conversation: { findFirst: vi.fn(), create } } }));
    const { createChannel } = await import("./messages");

    const result = await createChannel({ name: "pédiatrie", organizationId: "org-autre" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/n'est pas le vôtre/);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("searchPatientsForShare", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renvoie une liste vide (pas une erreur) pour un rôle sans accès clinique", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ ...coordinatorOrg1, role: "PHARMACIST" })) }));
    const findMany = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { patient: { findMany } } }));
    const { searchPatientsForShare } = await import("./messages");

    const result = await searchPatientsForShare("dupont");

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("borne la recherche à la portée établissement de l'appelant", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const findMany = vi.fn(async () => [{ id: "p1", dateOfBirth: new Date(), user: { firstName: "A", lastName: "B" } }]);
    vi.doMock("@/lib/db", () => ({ prisma: { patient: { findMany } } }));
    const { searchPatientsForShare } = await import("./messages");

    await searchPatientsForShare("dupont");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org1",
          user: { OR: [{ firstName: { contains: "dupont", mode: "insensitive" } }, { lastName: { contains: "dupont", mode: "insensitive" } }] },
        }),
      })
    );
  });
});

describe("heartbeat", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("met à jour lastActiveAt de l'utilisateur courant", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const update = vi.fn(async () => ({}));
    vi.doMock("@/lib/db", () => ({ prisma: { user: { update } } }));
    const { heartbeat } = await import("./messages");

    const result = await heartbeat();

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "coord1" } }));
  });

  it("ne fait aucune écriture si non authentifié", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
    const update = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { user: { update } } }));
    const { heartbeat } = await import("./messages");

    const result = await heartbeat();

    expect(result.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("getPresenceSnapshot", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("borne la lecture de présence à la portée établissement de l'appelant", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const findMany = vi.fn(async () => [{ id: "u1", lastActiveAt: new Date("2026-01-01T00:00:00Z") }]);
    vi.doMock("@/lib/db", () => ({ prisma: { user: { findMany } } }));
    const { getPresenceSnapshot } = await import("./messages");

    const result = await getPresenceSnapshot(["u1"]);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ u1: "2026-01-01T00:00:00.000Z" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["u1"] }, organizationId: "org1" } }));
  });

  it("ne fait aucun appel pour une liste vide", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const findMany = vi.fn();
    vi.doMock("@/lib/db", () => ({ prisma: { user: { findMany } } }));
    const { getPresenceSnapshot } = await import("./messages");

    const result = await getPresenceSnapshot([]);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("fetchRecentMessages", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("ne renvoie que les messages postérieurs à afterCreatedAt", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const findMany = vi.fn(async () => [{ id: "m2" }]);
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "org1", participants: [] })) },
        message: { findMany },
      },
    }));
    const { fetchRecentMessages } = await import("./messages");

    const result = await fetchRecentMessages("chan1", "2026-01-01T00:00:00.000Z");

    expect(result.success).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "chan1", createdAt: { gt: new Date("2026-01-01T00:00:00.000Z") } } })
    );
  });

  it("refuse le sondage sur une conversation hors de portée, mêmes règles que sendMessage", async () => {
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinatorOrg1) }));
    const findMany = vi.fn();
    vi.doMock("@/lib/db", () => ({
      prisma: {
        conversation: { findUnique: vi.fn(async () => ({ type: "CHANNEL", organizationId: "org-autre", participants: [] })) },
        message: { findMany },
      },
    }));
    const { fetchRecentMessages } = await import("./messages");

    const result = await fetchRecentMessages("chan1");

    expect(result.success).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });
});
