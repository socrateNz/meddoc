import { describe, it, expect, vi, beforeEach } from "vitest";

// Le hash du mot de passe ne doit jamais sortir de la base par défaut (fuite constatée : des
// requêtes `include: { user: true }` le transmettaient au navigateur).
describe("client Prisma", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  it("exclut globalement passwordHash de toutes les requêtes sur User", async () => {
    const options: unknown[] = [];
    vi.doMock("@prisma/client", () => ({
      PrismaClient: class {
        constructor(opts: unknown) {
          options.push(opts);
        }
      },
    }));
    await import("./db");

    expect(options[0]).toMatchObject({ omit: { user: { passwordHash: true } } });
  });
});

describe("UserRepository.findByEmail", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redemande explicitement le hash, nécessaire à la vérification du mot de passe à la connexion", async () => {
    const findUnique = vi.fn(async () => null);
    vi.doMock("@/lib/db", () => ({ prisma: { user: { findUnique } } }));
    const { UserRepository } = await import("@/repositories/UserRepository");

    await new UserRepository().findByEmail("awa@gmail.com");

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "awa@gmail.com" }, omit: { passwordHash: false } }));
  });
});
