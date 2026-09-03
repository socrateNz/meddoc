import { userRepository } from "@/repositories/UserRepository";
import { signJwt, signRefreshToken } from "@/lib/auth";
// bcrypt (binding natif), pas bcryptjs (réimplémentation JS pure, nettement plus lente pour
// compare() — les deux produisent/lisent le même format de hash, donc compatible avec les
// mots de passe déjà hashés). bcrypt est déjà une dépendance du projet, utilisée ailleurs pour
// le hachage (ex. src/actions/super-admin.ts) — on aligne la vérification sur la même lib.
import bcrypt from "bcrypt";
import { LoginInput } from "@/validators/auth";
import { AuthResponse } from "@/types/auth";

export class AuthService {
  static async login(data: LoginInput): Promise<AuthResponse> {
    const user = await userRepository.findByEmail(data.email);

    if (!user || !user.isActive) {
      throw new Error("Identifiants invalides ou compte inactif");
    }

    if (user.organization) {
      // Organization.isActive n'est bascule que pour une CLINIC (cf. setClinicActive) — un ADMIN
      // de holding peut suspendre une clinique sans toucher au statut d'abonnement de la holding
      // elle-même. Avant cette vérification, ce champ n'était jamais lu au login : une clinique
      // suspendue restait accessible à tout son personnel.
      if (!user.organization.isActive) {
        throw new Error("L'abonnement de votre organisation est inactif ou annulé.");
      }

      const holding = user.organization.type === "HOLDING" ? user.organization : user.organization.parent;
      if (holding) {
        if (holding.subscriptionStatus === "INACTIVE" || holding.subscriptionStatus === "CANCELLED") {
          throw new Error("L'abonnement de votre organisation est inactif ou annulé.");
        }
        if (holding.licenseExpiresAt && new Date(holding.licenseExpiresAt) < new Date()) {
          throw new Error("La licence de votre organisation a expiré.");
        }
      }
    }

    const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error("Identifiants invalides");
    }

    // Access token (15 minutes)
    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationType: user.organization?.type,
    }, { expiresIn: "15m" });

    // Refresh token (7 days)
    const refreshToken = signRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationType: user.organization?.type,
    }, { expiresIn: "7d" });

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        requiresPasswordChange: user.requiresPasswordChange,
        organizationId: user.organizationId,
      },
    };
  }
}
