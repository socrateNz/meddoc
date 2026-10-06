import { describe, it, expect, vi, beforeEach } from "vitest";

// File de remise et historique : filtre, tri et pagination exécutés par MongoDB (commandes brutes).
// Ce fichier vérifie la requête construite et l'assemblage de la page, sans base réelle.

type Cmd = Record<string, any>;

const pharmacist = { id: "ph1", role: "PHARMACIST", organizationId: "org1", organization: { type: "CLINIC" } };
const holdingAdmin = { id: "adm1", role: "ADMIN", organizationId: "hold1", organization: { type: "HOLDING" } };

function setup(options: { user?: any; labRows?: any[]; invoiceIds?: string[]; total?: number; children?: { id: string }[]; invoices?: any[]; patientIds?: string[] }) {
  const commands: Cmd[] = [];
  const runCommandRaw = vi.fn(async (cmd: Cmd) => {
    commands.push(cmd);
    if (cmd.find === "LabOrder") return { cursor: { firstBatch: options.labRows ?? [] } };
    if (cmd.find === "PendingInvoice") return { cursor: { firstBatch: (options.invoiceIds ?? []).map((id) => ({ _id: { $oid: id } })) } };
    if (cmd.count === "PendingInvoice") return { n: options.total ?? (options.invoiceIds ?? []).length };
    return {};
  });
  const pendingInvoiceFindMany = vi.fn(async () => options.invoices ?? []);
  const patientFindMany = vi.fn(async () => (options.patientIds ?? []).map((id) => ({ id })));
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => options.user ?? pharmacist) }));
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      $runCommandRaw: runCommandRaw,
      organization: { findMany: vi.fn(async () => options.children ?? []) },
      pendingInvoice: { findMany: pendingInvoiceFindMany, count: vi.fn(async () => 0) },
      financialTransaction: { findMany: vi.fn(async () => []) },
      patient: { findMany: patientFindMany },
    },
  }));
  return { commands, runCommandRaw, pendingInvoiceFindMany };
}

beforeEach(() => {
  vi.resetModules();
});

describe("listPharmacyDispenseQueue — requête exécutée en base", () => {
  it("exclut les factures remises ou annulées, et ne retient que celles à médicament ou à consommable d'examen", async () => {
    const { commands } = setup({ invoiceIds: [] });
    const { listPharmacyDispenseQueue } = await import("./finance");

    await listPharmacyDispenseQueue("org1");

    const find = commands.find((c) => c.find === "PendingInvoice")!;
    expect(find.filter.status).toEqual({ $ne: "CANCELLED" });
    expect(find.filter.dispensedAt).toBeNull();
    expect(find.filter.$or).toContainEqual({ items: { $elemMatch: { type: "PHARMACY" } } });
    expect(find.sort).toEqual({ createdAt: -1 });
  });

  it("pagine par 20 : la page 2 saute les 20 premières factures et renvoie le total exact", async () => {
    const { commands } = setup({ invoiceIds: ["i21"], total: 21 });
    const { listPharmacyDispenseQueue } = await import("./finance");

    const res = await listPharmacyDispenseQueue("org1", { page: 2, pageSize: 500 });

    const find = commands.find((c) => c.find === "PendingInvoice")!;
    expect(find.skip).toBe(20);
    expect(find.limit).toBe(20);
    expect(res).toMatchObject({ success: true, total: 21, page: 2, pageSize: 20 });
  });

  it("inclut les factures portant un consommable d'examen (LabOrder.testDetails[].consumables)", async () => {
    const { commands } = setup({ labRows: [{ pendingInvoiceId: { $oid: "labInv" } }], invoiceIds: [] });
    const { listPharmacyDispenseQueue } = await import("./finance");

    await listPharmacyDispenseQueue("org1");

    const lab = commands.find((c) => c.find === "LabOrder")!;
    expect(lab.filter.testDetails).toEqual({ $elemMatch: { "consumables.0": { $exists: true } } });
    const find = commands.find((c) => c.find === "PendingInvoice")!;
    expect(find.filter.$or).toContainEqual({ _id: { $in: [{ $oid: "labInv" }] } });
  });

  it("une holding couvre ses cliniques : la requête porte sur la holding et ses enfants", async () => {
    const { commands } = setup({ user: holdingAdmin, children: [{ id: "clin1" }, { id: "clin2" }], invoiceIds: [] });
    const { listPharmacyDispenseQueue } = await import("./finance");

    await listPharmacyDispenseQueue();

    const find = commands.find((c) => c.find === "PendingInvoice")!;
    expect(find.filter.organizationId).toEqual({ $in: [{ $oid: "hold1" }, { $oid: "clin1" }, { $oid: "clin2" }] });
  });

  it("renvoie les factures dans l'ordre de la requête, même si Prisma les relit dans un autre ordre", async () => {
    const invoices = [
      { id: "b", items: [], labOrders: [], status: "PENDING", patient: null, createdAt: new Date() },
      { id: "a", items: [], labOrders: [], status: "PENDING", patient: null, createdAt: new Date() },
    ];
    setup({ invoiceIds: ["a", "b"], total: 2, invoices });
    const { listPharmacyDispenseQueue } = await import("./finance");

    const res = await listPharmacyDispenseQueue("org1");

    expect((res.data as any[]).map((inv) => inv.id)).toEqual(["a", "b"]);
  });
});

describe("listPharmacyDispenseHistory — recherche en base", () => {
  it("cherche par référence (6 derniers caractères de l'identifiant) ou par nom de patient", async () => {
    const { commands } = setup({ invoiceIds: [], patientIds: ["pat1"] });
    const { listPharmacyDispenseHistory } = await import("./finance");

    await listPharmacyDispenseHistory("org1", { search: "ab12" });

    const find = commands.find((c) => c.find === "PendingInvoice")!;
    const expr = find.filter.$or[0].$expr;
    expect(expr.$regexMatch.regex).toBe("ab12");
    expect(expr.$regexMatch.input).toEqual({ $substrCP: [{ $toString: "$_id" }, 18, 6] });
    expect(find.filter.$or[1]).toEqual({ patientId: { $in: [{ $oid: "pat1" }] } });
  });

  it("échappe les caractères spéciaux de la recherche", async () => {
    const { commands } = setup({ invoiceIds: [] });
    const { listPharmacyDispenseHistory } = await import("./finance");

    await listPharmacyDispenseHistory("org1", { search: "a.b*" });

    const find = commands.find((c) => c.find === "PendingInvoice")!;
    expect(find.filter.$or[0].$expr.$regexMatch.regex).toBe("a\\.b\\*");
  });

  it("trie les tickets par date de remise, les plus récents d'abord", async () => {
    const { commands } = setup({ invoiceIds: [] });
    const { listPharmacyDispenseHistory } = await import("./finance");

    await listPharmacyDispenseHistory("org1", { page: 1 });

    expect(commands.find((c) => c.find === "PendingInvoice")!.sort).toEqual({ dispensedAt: -1 });
  });
});

describe("listPendingInvoices — pagination et totaux du bandeau", () => {
  it("renvoie une page de 20 et des totaux calculés sur toutes les factures en attente", async () => {
    const all = [
      { id: "f1", status: "PENDING", items: [{ amount: 1000 }] },
      { id: "f2", status: "PARTIAL", items: [{ amount: 3000 }] },
    ];
    const pendingInvoiceFindMany = vi.fn(async (args: any) => (args.skip === undefined ? all : []));
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "c1", role: "CASHIER", organizationId: "org1", organization: { type: "CLINIC" } })) }));
    vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: { findMany: pendingInvoiceFindMany, count: vi.fn(async () => 42) },
        financialTransaction: { findMany: vi.fn(async () => [{ pendingInvoiceId: "f2", amount: 500 }]) },
      },
    }));
    const { listPendingInvoices } = await import("./finance");

    const res = await listPendingInvoices("org1", { page: 1, pageSize: 500 });

    expect(res).toMatchObject({ success: true, total: 42, page: 1, pageSize: 20 });
    expect(res.summary).toEqual({ totalValue: 4000, totalPaid: 500, partialCount: 1 });
    const pageCall = pendingInvoiceFindMany.mock.calls.find((c) => (c[0] as any).skip !== undefined);
    expect((pageCall![0] as any).take).toBe(20);
  });
});
