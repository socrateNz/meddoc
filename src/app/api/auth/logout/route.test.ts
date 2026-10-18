import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/auth/logout", () => {
  it("redirige vers /login en relatif (jamais vers l'adresse interne du serveur) et efface les cookies", async () => {
    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/login");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/token=;/);
    expect(cookies).toMatch(/refreshToken=;/);
  });
});
