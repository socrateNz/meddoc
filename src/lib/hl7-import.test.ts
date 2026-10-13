import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseOruR01 } from "./hl7";

const ORDER_ID = "65f1a2b3c4d5e6f7a8b9c0d1";
const client = { id: "ic1", organizationId: "org1", name: "Automate BC-5150", createdById: "coord1", scopes: ["hl7:lab"] };

type Options = { order?: Record<string, unknown> | null; results?: Record<string, unknown>[]; catalog?: Record<string, unknown> | null };

function mockDb(options: Options = {}) {
  const order = options.order === undefined ? { id: ORDER_ID, organizationId: "org1", patientId: "p1", orderedById: "d1", status: "RECEIVED_AT_LAB", tests: ["Hémoglobine", "Glycémie"] } : options.order;
  const resultCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `r-${data.testName}`, validatedAt: null, ...data }));
  const resultUpdate = vi.fn(async () => ({}));
  const orderUpdate = vi.fn(async () => ({}));
  const emit = vi.fn();
  vi.doMock("@/lib/db", () => ({
    prisma: {
      labOrder: {
        findUnique: vi.fn(async () => order),
        findMany: vi.fn(async () => (order ? [order] : [])),
        update: orderUpdate,
      },
      patient: { findUnique: vi.fn(async () => ({ id: "p1", ipp: "IPP-2026-000042" })) },
      labResult: { findMany: vi.fn(async () => options.results ?? []), create: resultCreate, update: resultUpdate },
      labTest: { findFirst: vi.fn(async () => options.catalog ?? null) },
    },
  }));
  vi.doMock("@/lib/events", () => ({ appEvents: { emit } }));
  return { resultCreate, resultUpdate, orderUpdate, emit };
}

const message = (opts: { placer?: string; pid?: string; obx?: string[] } = {}) =>
  parseOruR01(
    [
      "MSH|^~\\&|BC5150|LABO|MEDDOC|CLINIQUE|20261013091500||ORU^R01|MSG1|P|2.5",
      `PID|1||${opts.pid ?? "IPP-2026-000042^^^MEDDOC^PI"}`,
      `OBR|1|${opts.placer ?? "LAB-A8B9C0D1"}||^NFS`,
      ...(opts.obx ?? ["OBX|1|NM|HGB^Hémoglobine||6.2|g/dL|12-16|LL|||F"]),
    ].join("\r")
  );

beforeEach(() => {
  vi.resetModules();
});

describe("importOruResults", () => {
  it("retrouve la demande par la référence du tube et importe un résultat non validé", async () => {
    const { resultCreate, orderUpdate } = mockDb();
    const { importOruResults } = await import("./hl7-import");

    const report = await importOruResults(message(), client);

    expect(report).toEqual({ imported: 1, updated: 0, issues: [], rejectedOrders: 0 });
    expect(resultCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ labOrderId: ORDER_ID, testName: "Hémoglobine", value: "6.2", isAbnormal: true, recordedById: "coord1", notes: expect.stringContaining("Automate BC-5150") }),
    });
    expect(resultCreate.mock.calls[0][0].data).not.toHaveProperty("validatedAt");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: ORDER_ID }, data: { status: "IN_ANALYSIS" } });
  });

  it("rejette tout si le patient du message n'est pas celui de la demande", async () => {
    const { resultCreate } = mockDb();
    const { importOruResults } = await import("./hl7-import");

    const report = await importOruResults(message({ pid: "IPP-2026-009999^^^MEDDOC^PI" }), client);

    expect(report.rejectedOrders).toBe(1);
    expect(report.issues[0]).toMatch(/patient du message différent/);
    expect(resultCreate).not.toHaveBeenCalled();
  });

  it("rejette une demande d'une autre clinique ou déjà validée", async () => {
    mockDb({ order: { id: ORDER_ID, organizationId: "org2", patientId: "p1", status: "RECEIVED_AT_LAB", tests: [] } });
    let { importOruResults } = await import("./hl7-import");
    expect((await importOruResults(message({ placer: ORDER_ID }), client)).issues[0]).toMatch(/introuvable/);

    vi.resetModules();
    mockDb({ order: { id: ORDER_ID, organizationId: "org1", patientId: "p1", status: "VALIDATED", tests: [] } });
    ({ importOruResults } = await import("./hl7-import"));
    expect((await importOruResults(message({ placer: ORDER_ID }), client)).issues[0]).toMatch(/déjà validée/);
  });

  it("ignore les analyses non demandées et les résultats préliminaires", async () => {
    const { resultCreate } = mockDb();
    const { importOruResults } = await import("./hl7-import");

    const report = await importOruResults(message({ obx: ["OBX|1|NM|K^Potassium||4.1|mmol/L||N|||F", "OBX|2|NM|GLY^Glycémie||1.05|g/L||N|||P"] }), client);

    expect(report.imported).toBe(0);
    expect(report.issues[0]).toMatch(/Potassium.*non demandée/);
    expect(resultCreate).not.toHaveBeenCalled();
  });

  it("corrige un résultat non validé (OBX-11 = C) mais jamais un résultat validé", async () => {
    const pending = mockDb({ results: [{ id: "r1", testName: "Hémoglobine", validatedAt: null }] });
    let { importOruResults } = await import("./hl7-import");
    expect((await importOruResults(message({ obx: ["OBX|1|NM|HGB^Hémoglobine||7.1|g/dL||L|||C"] }), client)).updated).toBe(1);
    expect(pending.resultUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ value: "7.1" }) });

    vi.resetModules();
    const locked = mockDb({ results: [{ id: "r1", testName: "Hémoglobine", validatedAt: new Date() }] });
    ({ importOruResults } = await import("./hl7-import"));
    const report = await importOruResults(message({ obx: ["OBX|1|NM|HGB^Hémoglobine||7.1|g/dL||L|||C"] }), client);
    expect(report.issues[0]).toMatch(/déjà validé/);
    expect(locked.resultUpdate).not.toHaveBeenCalled();
  });

  it("signale une valeur critique du catalogue", async () => {
    const { emit } = mockDb({ catalog: { criticalLow: 7, criticalHigh: 18 } });
    const { importOruResults } = await import("./hl7-import");

    await importOruResults(message(), client);

    expect(emit).toHaveBeenCalledWith("lab.result.critical", expect.objectContaining({ labOrderId: ORDER_ID, testName: "Hémoglobine", value: "6.2" }));
  });
});
