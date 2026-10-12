import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Facturation des nuitées (étape C de l'audit d'évolution) : chaque hospitalisation est désormais
// suivie par un séjour (HospitalStay) et ses périodes d'occupation de lit (BedStay), ouverts à
// l'affectation d'un lit. Les patients DÉJÀ hospitalisés au moment de la mise en service n'en ont
// pas : sans ce script, leur sortie ne facturerait aucune nuitée.
//
// L'application ne connaît pas leur date d'entrée réelle (elle n'était pas enregistrée) : leur
// séjour démarre à la date d'exécution du script. Un coordinateur peut ensuite corriger la date
// d'entrée réelle depuis le dossier du patient (carte « Hospitalisation en cours »), tant
// qu'aucune nuitée n'a été facturée.
//
// Tarif figé comme à l'application : celui de la chambre s'il est renseigné, sinon celui du
// service, sinon 0 — renseignez donc les tarifs (vue Chambres) AVANT de lancer ce script.
// Ré-exécutable sans risque : un patient qui a déjà un séjour ouvert est ignoré.
//
// Usage : node scripts/migrate-open-hospital-stays.mjs            (simulation, n'écrit rien)
//         node scripts/migrate-open-hospital-stays.mjs --apply    (création réelle)

const apply = process.argv.includes("--apply");
const now = new Date();

const hospitalized = await prisma.patient.findMany({
  where: { bedId: { not: null } },
  select: {
    id: true,
    organizationId: true,
    bed: {
      select: {
        id: true,
        label: true,
        organizationId: true,
        room: { select: { name: true, nightlyRate: true } },
        ward: { select: { name: true, nightlyRate: true } },
      },
    },
  },
});
console.log(`${hospitalized.length} patient(s) actuellement dans un lit.`);

let created = 0;
let skipped = 0;
let withoutRate = 0;
for (const patient of hospitalized) {
  if (!patient.bed) continue;
  const existing = await prisma.hospitalStay.findFirst({ where: { patientId: patient.id, status: "OPEN" } });
  if (existing) {
    skipped++;
    continue;
  }
  const rate = patient.bed.room?.nightlyRate ?? patient.bed.ward?.nightlyRate ?? 0;
  if (rate === 0) withoutRate++;
  if (!apply) continue;

  const stay = await prisma.hospitalStay.create({
    data: { patientId: patient.id, organizationId: patient.bed.organizationId, admittedAt: now },
  });
  await prisma.bedStay.create({
    data: {
      hospitalStayId: stay.id,
      patientId: patient.id,
      bedId: patient.bed.id,
      bedLabel: patient.bed.label,
      roomName: patient.bed.room?.name ?? "",
      wardName: patient.bed.ward?.name ?? "",
      organizationId: patient.bed.organizationId,
      nightlyRate: rate,
      startedAt: now,
    },
  });
  created++;
}

console.log(`Déjà suivis (ignorés) : ${skipped}. Sans tarif (séjour à 0 FCFA) : ${withoutRate}.`);
if (apply) console.log(`Séjours créés : ${created}.`);
else console.log("Simulation uniquement — relancez avec --apply pour créer les séjours.");

await prisma.$disconnect();
