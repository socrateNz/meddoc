import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  auth: { user: { id: "u1", role: "MEDECIN" } } as Record<string, unknown>,
  file: null as Record<string, unknown> | null,
  access: true,
  audit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireApiUser: async () => state.auth }));
vi.mock("@/lib/auth", () => ({ verifyPatientAccess: async () => state.access }));
vi.mock("@/middlewares/rateLimiter", () => ({ rateLimitOrResponse: async () => null }));
vi.mock("@/middlewares/auditLogger", () => ({ logAuditAction: state.audit }));
vi.mock("@/lib/medical-files-server", () => ({ temporaryFileLink: () => "https://api.cloudinary.com/signed-link" }));
vi.mock("@/lib/db", () => ({ prisma: { medicalFile: { findUnique: async () => state.file } } }));

import { GET } from "./route";

const ID = "65f1a2b3c4d5e6f7a8b9c0d1";
const call = (id = ID) => GET(new Request(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.auth = { user: { id: "u1", role: "MEDECIN" } };
  state.file = { id: ID, patientId: "p1", publicId: "meddoc/org1/p1/abc", format: "pdf", resourceType: "image", deletedAt: null };
  state.access = true;
  state.audit.mockClear();
});

describe("GET /api/files/[id]", () => {
  it("trace la consultation puis redirige vers un lien temporaire non mis en cache", async () => {
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://api.cloudinary.com/signed-link");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(state.audit).toHaveBeenCalledWith("u1", "VIEW_MEDICAL_FILE", "MedicalFile", ID, { patientId: "p1" });
  });

  it("refuse un patient hors périmètre, sans trace de consultation", async () => {
    state.access = false;
    expect((await call()).status).toBe(403);
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("répond 404 pour un document retiré ou un identifiant invalide", async () => {
    state.file = { ...state.file, deletedAt: new Date() };
    expect((await call()).status).toBe(404);
    expect((await call("../etc")).status).toBe(404);
  });

  it("laisse requireApiUser répondre sans session", async () => {
    state.auth = { response: new Response(null, { status: 401 }) };
    expect((await call()).status).toBe(401);
  });
});
