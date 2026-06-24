import { prisma } from "@/lib/db";

export class BaseRepository {
  protected get db() {
    return prisma;
  }
}
