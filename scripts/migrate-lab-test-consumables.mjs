import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// LabTest.pharmacyItemId (obligatoire, un seul produit = l'examen lui-même) est fusionné dans
// consumables (recette à plusieurs produits) : neutre en prix ET en comportement — l'ancien
// prix facturé (pharmacyItem.unitPrice, résolu dynamiquement à chaque commande) et l'ancien
// décompte (1 unité par réalisation) sont tous deux reproduits par une entrée
// { pharmacyItemId, name, quantity: 1 } avec basePrice: 0.
const res = await prisma.$runCommandRaw({
  find: "LabTest",
  filter: { pharmacyItemId: { $ne: null } },
  batchSize: 10000,
});
const tests = res.cursor?.firstBatch || [];
console.log(`${tests.length} LabTest à migrer.`);

let migrated = 0;
for (const test of tests) {
  const pharmacyItemId = test.pharmacyItemId.$oid || String(test.pharmacyItemId);
  const testId = test._id.$oid || String(test._id);
  const product = await prisma.pharmacyItem.findUnique({ where: { id: pharmacyItemId } });
  if (!product) {
    console.warn(`  ! ${test.name} (${testId}): produit lié ${pharmacyItemId} introuvable, ignoré.`);
    continue;
  }
  const existingConsumables = Array.isArray(test.consumables) ? test.consumables : [];
  await prisma.labTest.update({
    where: { id: testId },
    data: {
      basePrice: 0,
      consumables: [
        { pharmacyItemId, name: product.name, quantity: 1 },
        ...existingConsumables,
      ],
    },
  });
  migrated++;
}
console.log(`Migré: ${migrated}/${tests.length}`);
await prisma.$disconnect();
