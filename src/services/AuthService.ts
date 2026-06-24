import { userRepository } from "@/repositories/UserRepository";
import { signJwt, signRefreshToken } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { LoginInput } from "@/validators/auth";
import { AuthResponse } from "@/types/auth";

export class AuthService {
  static async login(data: LoginInput): Promise<AuthResponse> {
    const user = await userRepository.findByEmail(data.email);

    if (!user || !user.isActive) {
      throw new Error("Identifiants invalides ou compte inactif");
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
    }, { expiresIn: "15m" });

    // Refresh token (7 days)
    const refreshToken = signRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
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
      },
    };
  }
}
