import { userRepository } from "@/repositories/UserRepository";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

export class UserService {
  static async createUser(data: any) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return userRepository.create({
      email: data.email,
      passwordHash: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role as Role,
      phone: data.phone,
    });
  }

  static async getUsers() {
    return userRepository.findAll();
  }

  static async getUserById(id: string) {
    return userRepository.findById(id);
  }

  static async deactivateUser(id: string) {
    return userRepository.deactivate(id);
  }
}
