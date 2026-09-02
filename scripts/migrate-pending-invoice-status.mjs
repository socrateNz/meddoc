import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const res = await prisma.$runCommandRaw({
  update: "PendingInvoice",
  updates: [
    {
      q: { status: "FINALIZED" },
      u: [
        {
          $set: {
            status: "PAID",
            paidAt: { $ifNull: ["$finalizedAt", "$$NOW"] },
          },
        },
      ],
      multi: true,
    },
  ],
});
console.log(JSON.stringify(res));
await prisma.$disconnect();
