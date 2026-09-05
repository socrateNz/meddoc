import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// CashRegister.hasOpenSession est un nouveau verrou (défaut false) posé par openRegisterSession
// pour empêcher deux ouvertures concurrentes de la même caisse. Sans cette migration, une caisse
// ayant déjà une session OPEN aujourd'hui lirait hasOpenSession=false (valeur par défaut) et
// pourrait être "rouverte" par erreur.
const openSessions = await prisma.cashSession.findMany({
  where: { status: "OPEN" },
  select: { registerId: true },
  distinct: ["registerId"],
});
console.log(`${openSessions.length} caisse(s) actuellement ouverte(s) à synchroniser.`);

if (openSessions.length > 0) {
  const res = await prisma.cashRegister.updateMany({
    where: { id: { in: openSessions.map((s) => s.registerId) } },
    data: { hasOpenSession: true },
  });
  console.log("Mis à jour:", res.count);
}

await prisma.$disconnect();
