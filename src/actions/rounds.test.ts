import { describe, it, expect, vi, beforeEach } from "vitest";

const coordinator = { id: "c1", role: "COORDINATOR", organizationId: "clin1", organization: { type: "CLINIC" } };
const medecin = { id: "m1", role: "MEDECIN", organizationId: "clin1", organization: { type: "CLINIC" } };

type Db = ReturnType<typeof makeDb>;

function makeDb(overrides: Record<string, any> = {}) {
  const db = {
    ward: { findFirst: vi.fn(async () => ({ id: "w1" })) },
    roundSession: {
      findUnique: vi.fn(async () => null as any),
      create: vi.fn(async () => ({ id: "s1" })),
      update: vi.fn(async () => ({})),
    },
    patient: {
      findMany: vi.fn(async () => [] as any[]),
    },
    roundEntry: {
      findUnique: vi.fn(async () => null as any),
      update: vi.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
    },
    user: { findMany: vi.fn(async () => []) },
    organization: { findFirst: vi.fn(async () => null) },
    ...overrides,
  };
  return db;
}

function setup(user: any, db: Db) {
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn(async () => {}) }));
  vi.doMock("@/lib/db", () => ({ prisma: db }));
}

beforeEach(() => {
  vi.resetModules();
});

describe("accès à la ronde", () => {
  it("refuse un rôle hors équipe médicale (ex. ADMIN) et ne lit rien", async () => {
    const db = makeDb();
    setup({ id: "a1", role: "ADMIN", organizationId: "clin1", organization: { type: "CLINIC" } }, db);
    const { startRound } = await import("./rounds");

    const res = await startRound("clin1", "w1", "2026-10-05");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/réservée à l'équipe médicale/);
    expect(db.roundSession.create).not.toHaveBeenCalled();
  });

  it("refuse une clinique hors du périmètre de l'utilisateur", async () => {
    const db = makeDb();
    setup(medecin, db);
    const { startRound } = await import("./rounds");

    const res = await startRound("autre-clinique", "w1", "2026-10-05");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ne fait pas partie de votre établissement/);
  });
});

describe("startRound", () => {
  it("crée une entrée par patient hospitalisé, dans l'ordre des chambres puis des lits", async () => {
    const patients = [
      { id: "p3", bed: { label: "A", room: { name: "Chambre 12" } } },
      { id: "p1", bed: { label: "2", room: { name: "Chambre 2" } } },
      { id: "p2", bed: { label: "1", room: { name: "Chambre 12" } } },
    ];
    const db = makeDb({ patient: { findMany: vi.fn(async () => patients) } });
    setup(coordinator, db);
    const { startRound } = await import("./rounds");

    const res = await startRound("clin1", "w1", "2026-10-05");

    expect(res).toMatchObject({ success: true, data: { created: true } });
    const entries = (db.roundSession.create.mock.calls[0] as any)[0].data.entries.create;
    expect(entries.map((e: any) => e.patientId)).toEqual(["p1", "p2", "p3"]);
    expect(entries.map((e: any) => e.position)).toEqual([1, 2, 3]);
    expect(entries[0].bedLabel).toBe("Chambre 2 · Lit 2");
  });

  it("enregistre les présents choisis avant le démarrage, sans retenir les personnes hors de la clinique", async () => {
    const db = makeDb({
      user: { findMany: vi.fn(async () => [{ id: "m2" }]) },
    });
    setup(coordinator, db);
    const { startRound } = await import("./rounds");

    await startRound("clin1", "w1", "2026-10-05", ["m2", "etranger"]);

    expect((db.roundSession.create.mock.calls[0] as any)[0].data.participantIds).toEqual(["m2"]);
    expect((db.user.findMany.mock.calls[0] as any)[0].where).toEqual({ id: { in: ["m2", "etranger"] }, organizationId: "clin1" });
  });

  it("met le démarrant parmi les présents quand aucun membre n'est choisi", async () => {
    const db = makeDb();
    setup(coordinator, db);
    const { startRound } = await import("./rounds");

    await startRound("clin1", "w1", "2026-10-05");

    expect((db.roundSession.create.mock.calls[0] as any)[0].data.participantIds).toEqual(["c1"]);
  });

  it("renvoie la ronde existante si elle est déjà démarrée (double clic)", async () => {
    const db = makeDb({ roundSession: { ...makeDb().roundSession, findUnique: vi.fn(async () => ({ id: "s9" })) } });
    setup(coordinator, db);
    const { startRound } = await import("./rounds");

    const res = await startRound("clin1", "w1", "2026-10-05");

    expect(res).toEqual({ success: true, data: { id: "s9", created: false } });
    expect(db.roundSession.create).not.toHaveBeenCalled();
  });

  it("rattrape la contrainte unique si une autre requête vient de créer la ronde", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "s7" });
    const db = makeDb({
      roundSession: {
        findUnique,
        create: vi.fn(async () => {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }),
        update: vi.fn(),
      },
    });
    setup(coordinator, db);
    const { startRound } = await import("./rounds");

    const res = await startRound("clin1", "w1", "2026-10-05");

    expect(res).toEqual({ success: true, data: { id: "s7", created: false } });
  });

  it("refuse une date de ronde mal formée", async () => {
    const db = makeDb();
    setup(coordinator, db);
    const { startRound } = await import("./rounds");

    const res = await startRound("clin1", "w1", "05/10/2026");

    expect(res.success).toBe(false);
    expect(db.roundSession.create).not.toHaveBeenCalled();
  });
});

describe("visites", () => {
  const openEntry = (sessionStatus = "OPEN") => ({
    id: "e1",
    session: { id: "s1", organizationId: "clin1", status: sessionStatus },
  });

  it("enregistre la visite, avec la décision et la conduite à tenir", async () => {
    const db = makeDb({ roundEntry: { ...makeDb().roundEntry, findUnique: vi.fn(async () => openEntry()) } });
    setup(medecin, db);
    const { recordRoundVisit } = await import("./rounds");

    const res = await recordRoundVisit("e1", { observations: "  Apyrexie, bon état général  ", decision: "CONTINUE", plan: "Bilan demain" });

    expect(res.success).toBe(true);
    const data = (db.roundEntry.update.mock.calls[0] as any)[0].data;
    expect(data).toMatchObject({ status: "VISITED", observations: "Apyrexie, bon état général", decision: "CONTINUE", plan: "Bilan demain", visitedById: "m1" });
  });

  it("refuse une décision inconnue", async () => {
    const db = makeDb({ roundEntry: { ...makeDb().roundEntry, findUnique: vi.fn(async () => openEntry()) } });
    setup(medecin, db);
    const { recordRoundVisit } = await import("./rounds");

    const res = await recordRoundVisit("e1", { decision: "N_IMPORTE_QUOI" });

    expect(res.success).toBe(false);
    expect(db.roundEntry.update).not.toHaveBeenCalled();
  });

  it("refuse toute visite sur une ronde clôturée", async () => {
    const db = makeDb({ roundEntry: { ...makeDb().roundEntry, findUnique: vi.fn(async () => openEntry("CLOSED")) } });
    setup(medecin, db);
    const { recordRoundVisit } = await import("./rounds");

    const res = await recordRoundVisit("e1", { observations: "x" });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/clôturée/);
    expect(db.roundEntry.update).not.toHaveBeenCalled();
  });

  it("exige un motif pour passer un patient", async () => {
    const db = makeDb({ roundEntry: { ...makeDb().roundEntry, findUnique: vi.fn(async () => openEntry()) } });
    setup(medecin, db);
    const { skipRoundEntry } = await import("./rounds");

    const res = await skipRoundEntry("e1", "   ");

    expect(res.success).toBe(false);
    expect(db.roundEntry.update).not.toHaveBeenCalled();
  });
});

describe("getRound — la ronde suit le service", () => {
  const session = (status: string) => ({
    id: "s1",
    organizationId: "clin1",
    status,
    day: "2026-10-05",
    participantIds: [],
    closedAt: null,
  });

  // Les lectures de la ronde : la liste complète (synchronisation) et la page demandée (skip défini).
  function roundDb(opts: { status: string; hospitalized: any[]; entries: any[] }) {
    const create = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const db = makeDb({
      roundSession: { findUnique: vi.fn(async () => session(opts.status)), create: vi.fn(), update: vi.fn() },
      patient: {
        findMany: vi.fn(async (args: any) => (args.where?.bed ? opts.hospitalized : [])),
      },
      roundEntry: {
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => opts.entries.length),
        groupBy: vi.fn(async () => []),
        findMany: vi.fn(async (args: any) => (args.skip !== undefined ? opts.entries : opts.entries)),
        create,
        updateMany,
      },
    });
    return { db, create, updateMany };
  }

  it("ajoute en fin de liste un patient admis après le démarrage", async () => {
    const hospitalized = [
      { id: "p1", bed: { label: "A", room: { name: "Chambre 1" } } },
      { id: "p9", bed: { label: "B", room: { name: "Chambre 2" } } },
    ];
    const entries = [{ id: "e1", patientId: "p1", position: 1, status: "PENDING" }];
    const { db, create } = roundDb({ status: "OPEN", hospitalized, entries });
    setup(medecin, db);
    const { getRound } = await import("./rounds");

    await getRound("clin1", "w1", "2026-10-05");

    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0] as any)[0].data).toMatchObject({ sessionId: "s1", patientId: "p9", position: 2, bedLabel: "Chambre 2 · Lit B" });
  });

  it("signale comme passé un patient encore à voir qui a quitté le service", async () => {
    const hospitalized = [{ id: "p1", bed: { label: "A", room: { name: "Chambre 1" } } }];
    const entries = [
      { id: "e1", patientId: "p1", position: 1, status: "PENDING" },
      { id: "e5", patientId: "p5", position: 2, status: "PENDING" },
      { id: "e6", patientId: "p6", position: 3, status: "VISITED" },
    ];
    const { db, updateMany } = roundDb({ status: "OPEN", hospitalized, entries });
    setup(medecin, db);
    const { getRound } = await import("./rounds");

    await getRound("clin1", "w1", "2026-10-05");

    expect(updateMany).toHaveBeenCalledTimes(1);
    const args = (updateMany.mock.calls[0] as any)[0];
    expect(args.where.id).toEqual({ in: ["e5"] });
    expect(args.data.status).toBe("SKIPPED");
  });

  it("ne modifie pas une ronde clôturée", async () => {
    const hospitalized = [{ id: "p9", bed: { label: "B", room: { name: "Chambre 2" } } }];
    const { db, create, updateMany } = roundDb({ status: "CLOSED", hospitalized, entries: [] });
    setup(medecin, db);
    const { getRound } = await import("./rounds");

    await getRound("clin1", "w1", "2026-10-05");

    expect(create).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("closeRound", () => {
  it("clôture la ronde et renvoie le nombre de patients non vus", async () => {
    const db = makeDb({
      roundSession: { ...makeDb().roundSession, findUnique: vi.fn(async () => ({ id: "s1", organizationId: "clin1", status: "OPEN" })) },
      roundEntry: { ...makeDb().roundEntry, count: vi.fn(async () => 3) },
    });
    setup(coordinator, db);
    const { closeRound } = await import("./rounds");

    const res = await closeRound("s1");

    expect(res).toEqual({ success: true, data: { pending: 3 } });
    expect((db.roundSession.update.mock.calls[0] as any)[0].data.status).toBe("CLOSED");
  });
});
