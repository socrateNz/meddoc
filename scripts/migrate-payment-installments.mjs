import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 1) Reporte l'ancien lien 1:1 (PendingInvoice.financialTransactionId) sur le nouveau
//    FinancialTransaction.pendingInvoiceId avant que le champ legacy ne disparaisse du schéma —
//    préserve l'historique de règlement des tickets déjà payés.
const res = await prisma.$runCommandRaw({
  find: "PendingInvoice",
  filter: { financialTransactionId: { $ne: null } },
  projection: { financialTransactionId: 1 },
  batchSize: 10000,
});
const docs = res.cursor?.firstBatch || [];
console.log(`Found ${docs.length} PendingInvoice documents with a legacy financialTransactionId.`);

const updates = docs.map((doc) => ({
  q: { _id: { $oid: doc.financialTransactionId.$oid } },
  u: { $set: { pendingInvoiceId: { $oid: doc._id.$oid } } },
}));

if (updates.length > 0) {
  const updateRes = await prisma.$runCommandRaw({
    update: "FinancialTransaction",
    updates,
  });
  console.log("Backfilled FinancialTransaction.pendingInvoiceId:", JSON.stringify(updateRes));
}

// 2) DISPENSED -> PAID : la remise pharmacie est désormais suivie uniquement via dispensedAt
//    (déjà correctement renseigné sur ces lignes), plus via status.
const res2 = await prisma.$runCommandRaw({
  update: "PendingInvoice",
  updates: [{ q: { status: "DISPENSED" }, u: { $set: { status: "PAID" } }, multi: true }],
});
console.log("DISPENSED -> PAID:", JSON.stringify(res2));

await prisma.$disconnect();
