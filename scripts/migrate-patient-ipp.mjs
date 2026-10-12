import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Patient.ipp (Identifiant Permanent du Patient, ex. IPP-2026-001248) est attribué à chaque
// nouveau patient depuis l'étape B de l'audit d'évolution (cf. src/lib/ipp.ts). Les dossiers
// existants n'en ont pas : ce script leur en attribue un, dans l'ordre de création, avec l'année
// de création du dossier et le MÊME compteur que l'application (collection Counter, clé
// "ipp-<année>") — les numéros attribués ensuite par l'application ne peuvent donc jamais entrer
// en collision avec ceux-ci.
//
// À lancer AVANT `npx prisma db push` : l'index unique sur Patient.ipp ne peut pas être créé tant
// que des dossiers n'ont pas d'IPP (MongoDB indexe un champ absent comme null, donc en doublon).
// Ré-exécutable sans risque : seuls les patients encore sans IPP sont traités.
//
// Usage : node scripts/migrate-patient-ipp.mjs            (simulation, n'écrit rien)
//         node scripts/migrate-patient-ipp.mjs --apply    (attribution réelle)

const apply = process.argv.includes("--apply");

function formatIpp(year, sequence) {
  return `IPP-${year}-${String(sequence).padStart(6, "0")}`;
}

async function nextSequenceValue(key) {
  const res = await prisma.$runCommandRaw({
    findAndModify: "Counter",
    query: { key },
    update: { $inc: { value: 1 } },
    upsert: true,
    new: true,
  });
  const value = Number(res?.value?.value);
  if (!Number.isInteger(value) || value < 1) throw new Error(`Compteur ${key} invalide.`);
  return value;
}

const patients = await prisma.patient.findMany({
  where: { OR: [{ ipp: null }, { ipp: { isSet: false } }] },
  select: { id: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});
console.log(`${patients.length} patient(s) sans IPP.`);

if (!apply) {
  const byYear = {};
  for (const p of patients) {
    const year = p.createdAt.getUTCFullYear();
    byYear[year] = (byYear[year] || 0) + 1;
  }
  console.log("Répartition par année de création :", byYear);
  console.log("Simulation uniquement — relancez avec --apply pour attribuer les IPP.");
} else {
  let done = 0;
  for (const p of patients) {
    const year = p.createdAt.getUTCFullYear();
    const ipp = formatIpp(year, await nextSequenceValue(`ipp-${year}`));
    // Conditionné à l'absence d'IPP : une exécution concurrente ne peut pas en attribuer deux.
    const res = await prisma.patient.updateMany({
      where: { id: p.id, OR: [{ ipp: null }, { ipp: { isSet: false } }] },
      data: { ipp },
    });
    done += res.count;
  }
  console.log(`IPP attribués : ${done}.`);
}

await prisma.$disconnect();
