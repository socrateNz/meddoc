import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIntegrationKey } from "@/lib/integration-keys";

const state = vi.hoisted(() => ({
  client: null as Record<string, unknown> | null,
  report: { imported: 1, updated: 0, issues: [] as string[], rejectedOrders: 0 },
  audit: vi.fn(),
  importer: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { integrationClient: { findUnique: async () => state.client, update: async () => ({}) } },
}));
vi.mock("@/lib/hl7-import", () => ({ importOruResults: async (...args: unknown[]) => (state.importer(...args), state.report) }));
vi.mock("@/middlewares/auditLogger", () => ({ logAuditAction: state.audit }));
vi.mock("@/middlewares/rateLimiter", () => ({ rateLimitOrResponse: async () => null }));

import { POST } from "./route";

const { key } = generateIntegrationKey();
const ORU = "MSH|^~\\&|BC5150|LABO|MEDDOC|CLINIQUE|20261013091500||ORU^R01|MSG1|P|2.5\rPID|1||IPP-2026-000042\rOBR|1|LAB-A8B9C0D1\rOBX|1|NM|HGB^Hémoglobine||6.2|g/dL||L|||F";
const post = (body: string, headers: Record<string, string> = { Authorization: `Bearer ${key}` }) => POST(new Request("http://localhost/api/hl7/oru", { method: "POST", body, headers }));
const msa = async (res: Response) => (await res.text()).split("\r").find((s) => s.startsWith("MSA")) ?? "";

beforeEach(() => {
  state.client = { id: "ic1", organizationId: "org1", name: "BC5150", createdById: "coord1", scopes: ["hl7:lab"], isActive: true, revokedAt: null, lastUsedAt: new Date() };
  state.report = { imported: 1, updated: 0, issues: [], rejectedOrders: 0 };
  state.audit.mockClear();
  state.importer.mockClear();
});

describe("POST /api/hl7/oru", () => {
  it("importe et acquitte AA, avec trace d'audit", async () => {
    const res = await post(ORU);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("hl7-v2");
    expect(await msa(res)).toMatch(/^MSA\|AA\|MSG1\|1 résultat/);
    expect(state.importer).toHaveBeenCalledWith(expect.objectContaining({ controlId: "MSG1" }), expect.objectContaining({ organizationId: "org1" }));
    expect(state.audit).toHaveBeenCalledWith("coord1", "HL7_ORU_IMPORT", "IntegrationClient", "ic1", expect.objectContaining({ imported: 1 }));
  });

  it("acquitte AE quand une demande est rejetée", async () => {
    state.report = { imported: 0, updated: 0, issues: ["LAB-X : introuvable"], rejectedOrders: 1 };
    expect(await msa(await post(ORU))).toMatch(/^MSA\|AE\|MSG1\|.*introuvable/);
  });

  it("refuse sans clé, avec une clé révoquée ou sans la portée hl7:lab", async () => {
    expect((await post(ORU, {})).status).toBe(401);
    state.client = { ...state.client, revokedAt: new Date() };
    expect((await post(ORU)).status).toBe(401);
    state.client = { ...state.client, revokedAt: null, scopes: ["fhir:read"] };
    const res = await post(ORU);
    expect(res.status).toBe(403);
    expect(await msa(res)).toMatch(/^MSA\|AR\|/);
    expect(state.importer).not.toHaveBeenCalled();
  });

  it("rejette AR un message illisible", async () => {
    const res = await post("ceci n'est pas du HL7");
    expect(res.status).toBe(400);
    expect(await msa(res)).toMatch(/^MSA\|AR\|\|.*MSH/);
  });
});
