import { describe, it, expect } from "vitest";
import { publicOrigin } from "./request-origin";

describe("publicOrigin", () => {
  it("reconstruit le domaine public derrière Nginx", () => {
    const req = new Request("http://127.0.0.1:3000/api/fhir/metadata", { headers: { host: "meddoc.tacynt.com", "x-forwarded-proto": "https" } });
    expect(publicOrigin(req)).toBe("https://meddoc.tacynt.com");
  });

  it("ignore X-Forwarded-Host, falsifiable par le client", () => {
    const req = new Request("http://127.0.0.1:3000/x", { headers: { host: "meddoc.tacynt.com", "x-forwarded-host": "pirate.example", "x-forwarded-proto": "https" } });
    expect(publicOrigin(req)).toBe("https://meddoc.tacynt.com");
  });

  it("refuse un protocole fantaisiste et retombe sur l'URL de la requête sans Host", () => {
    const req = new Request("http://127.0.0.1:3000/x", { headers: { host: "meddoc.tacynt.com", "x-forwarded-proto": "javascript" } });
    expect(publicOrigin(req)).toBe("http://meddoc.tacynt.com");
    expect(publicOrigin(new Request("http://localhost:3000/x"))).toBe("http://localhost:3000");
  });
});
