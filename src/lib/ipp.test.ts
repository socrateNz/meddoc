import { describe, it, expect, vi, beforeEach } from "vitest";

describe("nextIpp", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("incrémente atomiquement le compteur de l'année (findAndModify avec upsert) et formate l'IPP", async () => {
    const runCommandRaw = vi.fn(async () => ({ value: { key: "ipp-2026", value: 1248 } }));
    vi.doMock("@/lib/db", () => ({ prisma: { $runCommandRaw: runCommandRaw } }));
    const { nextIpp } = await import("./ipp");

    expect(await nextIpp(new Date("2026-10-12T10:00:00.000Z"))).toBe("IPP-2026-001248");
    expect(runCommandRaw).toHaveBeenCalledWith({
      findAndModify: "Counter",
      query: { key: "ipp-2026" },
      update: { $inc: { value: 1 } },
      upsert: true,
      new: true,
    });
  });

  it("change de compteur avec l'année civile", async () => {
    const runCommandRaw = vi.fn(async () => ({ value: { value: 1 } }));
    vi.doMock("@/lib/db", () => ({ prisma: { $runCommandRaw: runCommandRaw } }));
    const { nextIpp } = await import("./ipp");

    expect(await nextIpp(new Date("2027-01-01T00:00:00.000Z"))).toBe("IPP-2027-000001");
    expect(runCommandRaw).toHaveBeenCalledWith(expect.objectContaining({ query: { key: "ipp-2027" } }));
  });

  it("refuse une réponse invalide plutôt que d'attribuer un IPP douteux", async () => {
    vi.doMock("@/lib/db", () => ({ prisma: { $runCommandRaw: vi.fn(async () => ({ value: null })) } }));
    const { nextIpp } = await import("./ipp");

    await expect(nextIpp()).rejects.toThrow("Impossible d'attribuer un numéro de dossier (IPP).");
  });
});
