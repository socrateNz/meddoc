import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // Le hash du mot de passe ne sort JAMAIS de la base par défaut : de nombreuses requêtes
    // chargent l'utilisateur complet (`include: { user: true }`, patient comme personnel) puis le
    // transmettent à un composant client ou à une réponse d'API — sans cette exclusion globale,
    // chacune envoyait les hash au navigateur. Seuls la connexion (UserRepository.findByEmail)
    // et le changement de mot de passe (users.ts) le redemandent explicitement.
    omit: { user: { passwordHash: true } },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Les tâches planifiées (rappels de rendez-vous, agenda du jour) sont
// déclenchées par un cron externe via src/app/api/cron/scheduler/route.ts,
// pas depuis ce module — voir src/lib/scheduler.ts pour le détail.
