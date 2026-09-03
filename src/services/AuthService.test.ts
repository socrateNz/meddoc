import { describe, it, expect, vi, beforeEach } from "vitest";

// AuthService.login est le point d'entrée de toute l'authentification de l'app — jamais
// testé jusqu'ici. On mocke le repository (accès base) et bcrypt (comparaison lente et
// non déterministe à isoler) ; signJwt/signRefreshToken tournent en réel, JWT_SECRET/
// JWT_REFRESH_SECRET étant déjà stubés par vitest.setup.ts.

const baseUser = {
  id: "user1",
  email: "doc@example.com",
  passwordHash: "hashed",
  firstName: "Jean",
  lastName: "Dupont",
  role: "MEDECIN",
  avatarUrl: null,
  requiresPasswordChange: false,
  isActive: true,
  organizationId: "org1",
  organization: { type: "CLINIC", isActive: true, subscriptionStatus: "ACTIVE", licenseExpiresAt: null, parent: null },
};

beforeEach(() => {
  vi.resetModules();
});

function mockRepository(user: any) {
  vi.doMock("@/repositories/UserRepository", () => ({
    userRepository: { findByEmail: vi.fn(async () => user) },
  }));
}

describe("AuthService.login", () => {
  it("refuse un email inconnu", async () => {
    mockRepository(null);
    vi.doMock("bcrypt", () => ({ default: { compare: vi.fn() } }));
    const { AuthService } = await import("./AuthService");

    await expect(AuthService.login({ email: "nobody@example.com", password: "x" })).rejects.toThrow(
      "Identifiants invalides ou compte inactif"
    );
  });

  it("refuse un compte désactivé", async () => {
    mockRepository({ ...baseUser, isActive: false });
    vi.doMock("bcrypt", () => ({ default: { compare: vi.fn() } }));
    const { AuthService } = await import("./AuthService");

    await expect(AuthService.login({ email: baseUser.email, password: "x" })).rejects.toThrow(
      "Identifiants invalides ou compte inactif"
    );
  });

  it("refuse une clinique désactivée (suspendue par l'admin de la holding)", async () => {
    mockRepository({
      ...baseUser,
      organization: { ...baseUser.organization, isActive: false },
    });
    vi.doMock("bcrypt", () => ({ default: { compare: vi.fn() } }));
    const { AuthService } = await import("./AuthService");

    await expect(AuthService.login({ email: baseUser.email, password: "x" })).rejects.toThrow(
      "L'abonnement de votre organisation est inactif ou annulé."
    );
  });

  it("refuse une organisation dont la licence a expiré (héritée de la holding parente)", async () => {
    mockRepository({
      ...baseUser,
      organization: {
        type: "CLINIC",
        isActive: true,
        subscriptionStatus: "ACTIVE",
        licenseExpiresAt: null,
        // Une clinique hérite du statut de licence de sa holding parente, pas du sien propre.
        parent: { subscriptionStatus: "ACTIVE", licenseExpiresAt: new Date("2000-01-01") },
      },
    });
    vi.doMock("bcrypt", () => ({ default: { compare: vi.fn() } }));
    const { AuthService } = await import("./AuthService");

    await expect(AuthService.login({ email: baseUser.email, password: "x" })).rejects.toThrow(
      "La licence de votre organisation a expiré."
    );
  });

  it("refuse un mot de passe incorrect", async () => {
    mockRepository(baseUser);
    vi.doMock("bcrypt", () => ({ default: { compare: vi.fn(async () => false) } }));
    const { AuthService } = await import("./AuthService");

    await expect(AuthService.login({ email: baseUser.email, password: "wrong" })).rejects.toThrow("Identifiants invalides");
  });

  it("retourne les tokens et le profil pour des identifiants valides", async () => {
    mockRepository(baseUser);
    vi.doMock("bcrypt", () => ({ default: { compare: vi.fn(async () => true) } }));
    const { AuthService } = await import("./AuthService");

    const result = await AuthService.login({ email: baseUser.email, password: "correct" });

    expect(typeof result.token).toBe("string");
    expect(typeof result.refreshToken).toBe("string");
    expect(result.user).toEqual(
      expect.objectContaining({ id: "user1", email: baseUser.email, role: "MEDECIN", requiresPasswordChange: false })
    );
  });
});
