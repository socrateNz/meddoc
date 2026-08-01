import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Les tâches planifiées (rappels de rendez-vous, agenda du jour) sont
// déclenchées par un cron externe via src/app/api/cron/scheduler/route.ts,
// pas depuis ce module — voir src/lib/scheduler.ts pour le détail.
