import { describe, it, expect, vi, beforeEach } from "vitest";

type WhereArgs = { where: Record<string, unknown>; skip?: number; take?: number };

const clinicUser = { id: "u1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };
const holdingUser = { id: "h1", role: "ADMIN", organizationId: "hold1", organization: { type: "HOLDING" } };

function mockDb() {
  const findMany = vi.fn(async (_args: WhereArgs) => [] as unknown[]);
  const count = vi.fn(async (_args: WhereArgs) => 0);
  const organizationFindFirst = vi.fn(async () => null);
  vi.doMock("@/lib/db", () => ({
    prisma: { patient: { findMany, count }, organization: { findFirst: organizationFindFirst } },
  }));
  return { findMany, count, organizationFindFirst };
}

beforeEach(() => {
  vi.resetModules();
});

describe("listPatientsPage", () => {
  it("borne chaque page à 20 patients, même si on demande davantage", async () => {
    const { findMany } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    const { listPatientsPage } = await import("./patient-list");

    const res = await listPatientsPage({ pageSize: 500, page: 2 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(res).toMatchObject({ success: true, page: 2, pageSize: 20 });
  });

  it("restreint une clinique à son propre périmètre et refuse une clinique étrangère", async () => {
    const { findMany } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    const { listPatientsPage } = await import("./patient-list");

    const own = await listPatientsPage({ organizationId: "org1" });
    expect(own.success).toBe(true);
    expect(findMany.mock.calls[0][0].where).toEqual({ AND: [{ organizationId: "org1" }] });

    const foreign = await listPatientsPage({ organizationId: "org9" });
    expect(foreign.success).toBe(false);
  });

  it("applique le statut sortie comme côté client : sortie = statut DISCHARGED ou aucun plan actif parmi des plans", async () => {
    const { findMany } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    const { listPatientsPage } = await import("./patient-list");

    await listPatientsPage({ status: "DISCHARGED" });
    const clauses = (findMany.mock.calls[0][0].where as { AND: Array<Record<string, unknown>> }).AND;
    expect(clauses[1]).toEqual({
      OR: [
        { status: "DISCHARGED" },
        { AND: [{ carePlans: { some: {} } }, { carePlans: { none: { status: "ACTIVE" } } }] },
      ],
    });
  });

  it("traduit le niveau de dépendance GIR en bornes de niveau", async () => {
    const { findMany } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    const { listPatientsPage } = await import("./patient-list");

    await listPatientsPage({ dependency: "MODERATE" });
    const clauses = (findMany.mock.calls[0][0].where as { AND: Array<Record<string, unknown>> }).AND;
    expect(clauses).toContainEqual({ dependencyLevel: { gte: 3, lte: 4 } });
  });

  it("recherche nom, e-mail, téléphone et groupe sanguin sans sous-chaîne sur les pathologies", async () => {
    const { findMany } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => clinicUser) }));
    const { listPatientsPage } = await import("./patient-list");

    await listPatientsPage({ search: "  Mballa " });
    const clauses = (findMany.mock.calls[0][0].where as { AND: Array<{ OR?: unknown[] }> }).AND;
    const searchClause = clauses[clauses.length - 1];
    expect(searchClause.OR).toHaveLength(5);
    expect(searchClause.OR).toContainEqual({ user: { lastName: { contains: "Mballa", mode: "insensitive" } } });
  });

  it("compte le périmètre complet (sans filtre) pour les indicateurs, et la page pour la liste", async () => {
    const { count } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => holdingUser) }));
    const { listPatientsPage } = await import("./patient-list");

    count.mockResolvedValueOnce(42).mockResolvedValueOnce(30).mockResolvedValueOnce(12).mockResolvedValueOnce(9).mockResolvedValueOnce(5);
    const res = await listPatientsPage({ status: "ACTIVE" });

    expect(res).toMatchObject({ success: true, total: 42, counts: { active: 30, discharged: 12, allergies: 9, highDependency: 5 } });
  });
});
