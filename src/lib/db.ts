import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  schedulerStarted?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Start background scheduler on startup (server-side only)
if (typeof window === "undefined" && !globalForPrisma.schedulerStarted) {
  globalForPrisma.schedulerStarted = true;
  import("./scheduler").then(({ startScheduler }) => {
    startScheduler();
  }).catch(err => {
    console.error("Failed to start background scheduler:", err);
  });
}
