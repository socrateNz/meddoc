import { describe, it, expect, vi, beforeEach } from "vitest";

type QueryArgs = { where: Record<string, unknown>; skip?: number; take?: number };

const coordinator = { id: "coord1", role: "COORDINATOR", organizationId: "org1", organization: { type: "CLINIC" } };

function mockDb() {
  const findMany = vi.fn(async (_args: QueryArgs) => [] as unknown[]);
  const count = vi.fn(async (_args: QueryArgs) => 0);
  vi.doMock("@/lib/db", () => ({
    prisma: {
      pendingInvoice: { findMany, count },
      financialTransaction: { findMany: vi.fn(async () => []) },
    },
  }));
  return { findMany, count };
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => coordinator) }));
});

describe("listCaisseHistoryInvoices — pagination côté serveur", () => {
  it("renvoie une page de 20 par défaut et le total réel de la base", async () => {
    const { findMany, count } = mockDb();
    count.mockResolvedValueOnce(1432);
    findMany.mockResolvedValueOnce([]);

    const { listCaisseHistoryInvoices } = await import("./finance");
    const res = await listCaisseHistoryInvoices("org1");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    expect(res).toMatchObject({ success: true, total: 1432, page: 1, pageSize: 20 });
  });

  it("calcule le décalage (skip) à partir du numéro de page", async () => {
    const { findMany } = mockDb();

    const { listCaisseHistoryInvoices } = await import("./finance");
    await listCaisseHistoryInvoices("org1", { page: 3 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
  });

  it("borne la taille de page à 20 maximum, quelle que soit la demande", async () => {
    const { findMany } = mockDb();

    const { listCaisseHistoryInvoices } = await import("./finance");
    const res = await listCaisseHistoryInvoices("org1", { pageSize: 500 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    expect(res).toMatchObject({ pageSize: 20 });
  });

  it("filtre par statut côté serveur, et n'ajoute aucun filtre pour 'ALL' (absence de statut)", async () => {
    const { findMany, count } = mockDb();

    const { listCaisseHistoryInvoices } = await import("./finance");
    await listCaisseHistoryInvoices("org1", { status: "PAID" });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: "PAID" });
    expect(count.mock.calls[0][0].where).toMatchObject({ status: "PAID" });

    await listCaisseHistoryInvoices("org1", {});
    expect(findMany.mock.calls[1][0].where).not.toHaveProperty("status");
  });

  it("ignore un statut inconnu plutôt que de l'envoyer à la base", async () => {
    const { findMany } = mockDb();

    const { listCaisseHistoryInvoices } = await import("./finance");
    await listCaisseHistoryInvoices("org1", { status: "N'IMPORTE_QUOI" });

    expect(findMany.mock.calls[0][0].where).not.toHaveProperty("status");
  });

  it("applique la recherche sur le nom, le téléphone et le client de passage, et non sur le seul lot chargé", async () => {
    const { findMany, count } = mockDb();

    const { listCaisseHistoryInvoices } = await import("./finance");
    await listCaisseHistoryInvoices("org1", { search: "  Mballa " });

    const where = findMany.mock.calls[0][0].where as { AND: Array<{ OR: unknown[] }> };
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { customPatientName: { contains: "Mballa", mode: "insensitive" } },
        { customPatientPhone: { contains: "Mballa" } },
      ])
    );
    expect(count.mock.calls[0][0].where).toEqual(where);
  });
});
