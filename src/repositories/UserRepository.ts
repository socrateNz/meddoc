import { BaseRepository } from "./BaseRepository";
import { Role } from "@prisma/client";

export class UserRepository extends BaseRepository {
  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: Role;
    phone?: string;
  }) {
    return this.db.user.create({
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async findAll() {
    return this.db.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string) {
    return this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.db.user.findUnique({
      where: { email },
      include: { 
        organization: {
          include: { parent: true }
        } 
      },
    });
  }

  async deactivate(id: string) {
    return this.db.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

export const userRepository = new UserRepository();
