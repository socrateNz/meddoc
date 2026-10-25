import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

// Données de démonstration d'une clinique (vidéo d'utilisation, présentation, formation) : le
// personnel de démonstration, une vingtaine de patients et l'activité des 30 derniers jours dans
// tous les modules — accueil, urgences, consultations, hospitalisation, rondes, maternité,
// laboratoire, imagerie, bloc, banque de sang, caisse, pharmacie, planning, messagerie.
// Toutes les dates sont relatives au jour du lancement : le relancer le matin d'une présentation.
//
// La clinique est désignée par l'e-mail de son coordinateur. Rien d'existant n'est modifié :
// - les comptes du personnel de démonstration (…@meddoc.demo) sont créés ou mis à jour (mot de
//   passe), jamais supprimés — ils signent des écritures qui doivent rester lisibles ;
// - tout ce que le script crée est noté dans la collection DemoSeed ; --remplacer supprime d'abord
//   le jeu précédent ET tout ce qui a été fait ensuite avec les patients ou les comptes de
//   démonstration (une vidéo enregistrée la veille, par exemple), puis recrée un jeu neuf.
//
// Usage (sur le serveur, dans le dossier de l'application) :
//   MOT_DE_PASSE_DEMO="$(cat ~/.secrets/meddoc-demo-password)" \
//     node --env-file=<fichier .env> scripts/seed-demo-clinique.mjs <e-mail du coordinateur> [--remplacer]

const DEMO_DOMAIN = "meddoc.demo";
const DAY_MS = 24 * 60 * 60 * 1000;
// Cliniques au Cameroun : UTC+1 toute l'année (cf. src/lib/clinic-day.ts).
const CLINIC_OFFSET_MS = 60 * 60 * 1000;

const args = process.argv.slice(2);
const coordinatorEmail = args.find((a) => !a.startsWith("--"))?.toLowerCase();
const replace = args.includes("--remplacer");
const password = process.env.MOT_DE_PASSE_DEMO ?? "";

// ---------------------------------------------------------------------------------------------
// Dates (heure de la clinique)
// ---------------------------------------------------------------------------------------------

const NOW = new Date();
const todayKey = new Date(NOW.getTime() + CLINIC_OFFSET_MS).toISOString().slice(0, 10);

function dayKey(offset) {
  const [y, m, d] = todayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

// Jour relatif à aujourd'hui (0 = aujourd'hui, -1 = hier) et heure locale « HH:MM » → instant UTC.
function at(offset, time) {
  const [y, m, d] = dayKey(offset).split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - CLINIC_OFFSET_MS);
}

function minutesAgo(n) {
  return new Date(NOW.getTime() - n * 60 * 1000);
}

function yearsAgo(years, month = 6, day = 15) {
  return new Date(Date.UTC(NOW.getUTCFullYear() - years, month - 1, day));
}

// Générateur pseudo-aléatoire déterministe : le même jeu à chaque lancement.
let seedState = 20261022;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

// ---------------------------------------------------------------------------------------------
// Journal de ce qui est créé (collection DemoSeed, hors schéma Prisma)
// ---------------------------------------------------------------------------------------------

const created = {};
function track(model, doc) {
  (created[model] ??= []).push(doc.id);
  return doc;
}

async function readManifest(organizationId) {
  const res = await prisma.$runCommandRaw({ find: "DemoSeed", filter: { organizationId } });
  return res?.cursor?.firstBatch?.[0] ?? null;
}

async function writeManifest(organizationId) {
  await prisma.$runCommandRaw({ delete: "DemoSeed", deletes: [{ q: { organizationId }, limit: 0 }] });
  await prisma.$runCommandRaw({
    insert: "DemoSeed",
    documents: [{ organizationId, createdAt: { $date: NOW.toISOString() }, ids: created }],
  });
}

// ---------------------------------------------------------------------------------------------
// Suppression du jeu précédent
// ---------------------------------------------------------------------------------------------

async function removePreviousDemo(clinicId, staffIds) {
  const manifest = await readManifest(clinicId);
  const ids = (model) => manifest?.ids?.[model] ?? [];

  const patientUsers = await prisma.user.findMany({
    where: { organizationId: clinicId, role: "PATIENT", id: { in: ids("PatientUser") } },
    select: { id: true },
  });
  // Patients créés à la main par les comptes de démonstration (vidéos, essais).
  const createdByDemo = await prisma.auditLog.findMany({
    where: { action: "CREATE_PATIENT", entityType: "Patient", userId: { in: staffIds } },
    select: { entityId: true },
  });
  const patients = await prisma.patient.findMany({
    where: {
      OR: [
        { id: { in: ids("Patient") } },
        { userId: { in: patientUsers.map((u) => u.id) } },
        { organizationId: clinicId, id: { in: createdByDemo.map((l) => l.entityId) } },
      ],
    },
    select: { id: true, userId: true, bedId: true },
  });
  const P = patients.map((p) => p.id);
  const S = staffIds;
  const byPatient = { patientId: { in: P } };

  const sessions = await prisma.cashSession.findMany({
    where: { organizationId: clinicId, OR: [{ id: { in: ids("CashSession") } }, { openedById: { in: S } }] },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  const invoices = await prisma.pendingInvoice.findMany({
    where: { organizationId: clinicId, OR: [{ patientId: { in: P } }, { createdById: { in: S } }, { cashSessionId: { in: sessionIds } }] },
    select: { id: true },
  });
  const invoiceIds = invoices.map((i) => i.id);

  await prisma.message.updateMany({ where: { sharedPatientId: { in: P } }, data: { sharedPatientId: null } });
  await prisma.roundEntry.deleteMany({ where: byPatient });
  await prisma.roundSession.deleteMany({ where: { organizationId: clinicId, OR: [{ id: { in: ids("RoundSession") } }, { startedById: { in: S } }] } });

  const plans = await prisma.carePlan.findMany({ where: byPatient, select: { id: true } });
  const planIds = plans.map((p) => p.id);
  await prisma.careTask.deleteMany({ where: { carePlanId: { in: planIds } } });
  await prisma.medication.deleteMany({ where: { carePlanId: { in: planIds } } });
  await prisma.carePlan.deleteMany({ where: { id: { in: planIds } } });

  await prisma.aIConversation.deleteMany({ where: byPatient });
  await prisma.aIAnalysis.deleteMany({ where: byPatient });
  await prisma.incident.deleteMany({ where: byPatient });
  await prisma.contract.deleteMany({ where: byPatient });
  await prisma.consultationDraft.deleteMany({ where: byPatient });

  const labOrders = await prisma.labOrder.findMany({ where: byPatient, select: { id: true } });
  await prisma.labResult.deleteMany({ where: { labOrderId: { in: labOrders.map((o) => o.id) } } });
  await prisma.labOrder.deleteMany({ where: { id: { in: labOrders.map((o) => o.id) } } });
  await prisma.prescription.updateMany({ where: byPatient, data: { renewedFromId: null } });
  await prisma.prescription.deleteMany({ where: byPatient });

  await prisma.financialTransaction.deleteMany({
    where: {
      OR: [
        { patientId: { in: P } },
        { pendingInvoiceId: { in: invoiceIds } },
        { cashSessionId: { in: sessionIds } },
        { organizationId: clinicId, recordedById: { in: S } },
        { id: { in: ids("FinancialTransaction") } },
      ],
    },
  });
  await prisma.pendingInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.cashRegister.updateMany({ where: { organizationId: clinicId }, data: { hasOpenSession: false } });
  // Une session encore ouverte par un autre compte garde son verrou.
  const stillOpen = await prisma.cashSession.findMany({ where: { organizationId: clinicId, status: "OPEN" }, select: { registerId: true } });
  if (stillOpen.length) {
    await prisma.cashRegister.updateMany({ where: { id: { in: stillOpen.map((s) => s.registerId) } }, data: { hasOpenSession: true } });
  }
  await prisma.cashRegister.deleteMany({ where: { id: { in: ids("CashRegister") } } });

  await prisma.vitalSign.deleteMany({ where: byPatient });
  await prisma.medicalRecord.deleteMany({ where: byPatient });
  await prisma.appointment.deleteMany({ where: byPatient });
  await prisma.pregnancy.deleteMany({ where: byPatient });

  const family = await prisma.familyMember.findMany({ where: byPatient, select: { userId: true } });
  await prisma.familyMember.deleteMany({ where: byPatient });

  await prisma.hospitalStay.deleteMany({ where: byPatient });
  await prisma.bedStay.deleteMany({ where: byPatient });
  await prisma.visit.deleteMany({ where: byPatient });
  await prisma.emergencyTriage.deleteMany({ where: byPatient });
  await prisma.medicalFile.deleteMany({ where: byPatient });
  await prisma.radiologyOrder.deleteMany({ where: byPatient });
  await prisma.surgeryCase.deleteMany({ where: { OR: [byPatient, { organizationId: clinicId, surgeonId: { in: S } }] } });
  await prisma.transfusion.deleteMany({ where: { OR: [byPatient, { organizationId: clinicId, requestedById: { in: S } }] } });
  await prisma.bloodUnit.deleteMany({ where: { organizationId: clinicId, OR: [{ id: { in: ids("BloodUnit") } }, { receivedById: { in: S } }] } });

  const heldBeds = patients.map((p) => p.bedId).filter(Boolean);
  await prisma.bed.updateMany({ where: { id: { in: heldBeds } }, data: { status: "AVAILABLE" } });
  await prisma.patient.updateMany({ where: { id: { in: P } }, data: { bedId: null } });
  await prisma.patient.deleteMany({ where: { id: { in: P } } });

  // Comptes famille/patient : leurs notifications, messages et jetons d'abord.
  const accountIds = [...patients.map((p) => p.userId), ...family.map((f) => f.userId)];
  await prisma.notification.deleteMany({ where: { userId: { in: accountIds } } });
  await prisma.conversationParticipant.deleteMany({ where: { userId: { in: accountIds } } });
  await prisma.message.deleteMany({ where: { senderId: { in: accountIds } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: accountIds } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: accountIds } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: accountIds } } });
  await prisma.user.deleteMany({ where: { id: { in: accountIds } } });

  // Activité du personnel de démonstration hors patients.
  await prisma.shift.deleteMany({ where: { OR: [{ userId: { in: S } }, { id: { in: ids("Shift") } }] } });
  await prisma.calendarEvent.deleteMany({ where: { OR: [{ userId: { in: S } }, { id: { in: ids("CalendarEvent") } }] } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: S } }, { id: { in: ids("Notification") } }] } });
  await prisma.prescriptionTemplate.deleteMany({ where: { OR: [{ createdById: { in: S } }, { id: { in: ids("PrescriptionTemplate") } }] } });

  const channelIds = ids("Conversation");
  await prisma.message.deleteMany({ where: { OR: [{ conversationId: { in: channelIds } }, { senderId: { in: S } }] } });
  await prisma.conversationParticipant.deleteMany({ where: { OR: [{ conversationId: { in: channelIds } }, { userId: { in: S } }] } });
  await prisma.conversation.deleteMany({ where: { id: { in: channelIds } } });

  // Pharmacie : lots, ajustements, inventaires et commandes des produits de démonstration.
  const itemIds = ids("PharmacyItem");
  const orders = await prisma.purchaseOrder.findMany({
    where: { organizationId: clinicId, OR: [{ createdById: { in: S } }, { supplierId: { in: ids("Supplier") } }] },
    select: { id: true },
  });
  await prisma.purchaseOrderLine.deleteMany({ where: { OR: [{ purchaseOrderId: { in: orders.map((o) => o.id) } }, { pharmacyItemId: { in: itemIds } }] } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await prisma.supplier.deleteMany({ where: { id: { in: ids("Supplier") } } });
  const counts = await prisma.inventoryCount.findMany({ where: { organizationId: clinicId, startedById: { in: S } }, select: { id: true } });
  await prisma.inventoryCountLine.deleteMany({ where: { OR: [{ inventoryCountId: { in: counts.map((c) => c.id) } }, { pharmacyItemId: { in: itemIds } }] } });
  await prisma.inventoryCount.deleteMany({ where: { id: { in: counts.map((c) => c.id) } } });
  await prisma.stockAdjustment.deleteMany({ where: { pharmacyItemId: { in: itemIds } } });
  const lots = await prisma.stockPurchase.findMany({ where: { OR: [{ pharmacyItemId: { in: itemIds } }, { organizationId: clinicId, purchasedById: { in: S } }] }, select: { id: true } });
  await prisma.financialTransaction.deleteMany({ where: { stockPurchaseId: { in: lots.map((l) => l.id) } } });
  await prisma.financialTransaction.updateMany({ where: { pharmacyItemId: { in: itemIds } }, data: { pharmacyItemId: null } });
  await prisma.stockPurchase.deleteMany({ where: { id: { in: lots.map((l) => l.id) } } });
  await prisma.prescriptionItem.updateMany({ where: { pharmacyItemId: { in: itemIds } }, data: { pharmacyItemId: null } });
  await prisma.pharmacyItem.deleteMany({ where: { id: { in: itemIds } } });

  await prisma.labTest.deleteMany({ where: { id: { in: ids("LabTest") } } });
  await prisma.radiologyExam.deleteMany({ where: { id: { in: ids("RadiologyExam") } } });
  await prisma.operatingRoom.deleteMany({ where: { id: { in: ids("OperatingRoom") } } });

  // Lits, chambres et services créés par le script, s'ils sont redevenus libres.
  await prisma.bed.deleteMany({ where: { id: { in: ids("Bed") }, status: "AVAILABLE" } });
  for (const roomId of ids("Room")) {
    if ((await prisma.bed.count({ where: { roomId } })) === 0) await prisma.room.deleteMany({ where: { id: roomId } });
  }
  for (const wardId of ids("Ward")) {
    if ((await prisma.room.count({ where: { wardId } })) === 0) await prisma.ward.deleteMany({ where: { id: wardId } });
  }

  await prisma.$runCommandRaw({ delete: "DemoSeed", deletes: [{ q: { organizationId: clinicId }, limit: 0 }] });
  console.log(`Jeu précédent supprimé : ${P.length} patients, ${invoiceIds.length} factures, ${sessionIds.length} sessions de caisse.`);
}

// ---------------------------------------------------------------------------------------------
// Référentiels de démonstration
// ---------------------------------------------------------------------------------------------

const STAFF = [
  { key: "medecin", email: `dr.mbarga@${DEMO_DOMAIN}`, firstName: "Paul", lastName: "Mbarga", role: "MEDECIN", specialties: ["Médecine générale", "Médecine interne"], licenseNumber: "ONMC-12458" },
  { key: "gyneco", email: `dr.ngobassa@${DEMO_DOMAIN}`, firstName: "Hélène", lastName: "Ngo Bassa", role: "MEDECIN", specialties: ["Gynécologie-obstétrique"], licenseNumber: "ONMC-10933" },
  { key: "chirurgien", email: `dr.fotso@${DEMO_DOMAIN}`, firstName: "Armand", lastName: "Fotso", role: "MEDECIN", specialties: ["Chirurgie générale"], licenseNumber: "ONMC-09871" },
  { key: "anesthesiste", email: `dr.etoundi@${DEMO_DOMAIN}`, firstName: "Brigitte", lastName: "Etoundi", role: "MEDECIN", specialties: ["Anesthésie-réanimation"], licenseNumber: "ONMC-11302" },
  { key: "infirmier1", email: `inf.ndzana@${DEMO_DOMAIN}`, firstName: "Cyrille", lastName: "Ndzana", role: "CAREGIVER", specialties: ["Soins infirmiers", "Urgences"] },
  { key: "infirmier2", email: `inf.abena@${DEMO_DOMAIN}`, firstName: "Marie", lastName: "Abena", role: "CAREGIVER", specialties: ["Soins infirmiers", "Bloc opératoire"] },
  { key: "sagefemme", email: `sf.tchoumi@${DEMO_DOMAIN}`, firstName: "Odile", lastName: "Tchoumi", role: "CAREGIVER", specialties: ["Maïeutique"] },
  { key: "laborantin", email: `lab.nkeng@${DEMO_DOMAIN}`, firstName: "Serge", lastName: "Nkeng", role: "CAREGIVER", specialties: ["Biologie médicale"] },
  { key: "pharmacien", email: `pharma.kouam@${DEMO_DOMAIN}`, firstName: "Estelle", lastName: "Kouam", role: "PHARMACIST" },
  { key: "caissier", email: `caisse.manga@${DEMO_DOMAIN}`, firstName: "Rodrigue", lastName: "Manga", role: "CASHIER" },
];

const PATIENTS = [
  { k: "atangana", firstName: "Jean-Claude", lastName: "Atangana", sex: "M", age: 58, blood: "O+", address: "Bastos, Yaoundé", phone: "677112233", pathologies: ["Hypertension artérielle", "Diabète de type 2"], allergies: ["Pénicilline"] },
  { k: "fouda", firstName: "Thérèse", lastName: "Fouda", sex: "F", age: 34, blood: "A+", address: "Mvog-Ada, Yaoundé", phone: "699223344", pathologies: [], allergies: [] },
  { k: "nana", firstName: "Bertrand", lastName: "Nana", sex: "M", age: 45, blood: "B+", address: "Biyem-Assi, Yaoundé", phone: "675334455", pathologies: ["Ulcère gastrique"], allergies: [] },
  { k: "eyenga", firstName: "Pauline", lastName: "Eyenga", sex: "F", age: 27, blood: "O-", address: "Nkolbisson, Yaoundé", phone: "690445566", pathologies: [], allergies: ["Sulfamides"] },
  { k: "tchakounte", firstName: "Gaston", lastName: "Tchakounté", sex: "M", age: 67, blood: "A-", address: "Essos, Yaoundé", phone: "677556677", pathologies: ["Insuffisance cardiaque", "Hypertension artérielle"], allergies: [] },
  { k: "ngono", firstName: "Agnès", lastName: "Ngono", sex: "F", age: 31, blood: "AB+", address: "Mendong, Yaoundé", phone: "699667788", pathologies: [], allergies: [] },
  { k: "biya", firstName: "Samuel", lastName: "Ewane", sex: "M", age: 8, blood: "O+", address: "Emana, Yaoundé", phone: "675778899", pathologies: ["Drépanocytose"], allergies: [] },
  { k: "mvondo", firstName: "Christine", lastName: "Mvondo", sex: "F", age: 52, blood: "B-", address: "Ekounou, Yaoundé", phone: "690889900", pathologies: ["Asthme"], allergies: ["Aspirine"] },
  { k: "kamdem", firstName: "Hervé", lastName: "Kamdem", sex: "M", age: 39, blood: "O+", address: "Omnisport, Yaoundé", phone: "677990011", pathologies: [], allergies: [] },
  { k: "owona", firstName: "Sandrine", lastName: "Owona", sex: "F", age: 29, blood: "A+", address: "Mimboman, Yaoundé", phone: "699001122", pathologies: [], allergies: [] },
  { k: "djomo", firstName: "Lucien", lastName: "Djomo", sex: "M", age: 72, blood: "O+", address: "Nlongkak, Yaoundé", phone: "675112200", pathologies: ["Hypertrophie bénigne de la prostate", "Diabète de type 2"], allergies: [] },
  { k: "essomba", firstName: "Rachel", lastName: "Essomba", sex: "F", age: 24, blood: "O+", address: "Ngoa-Ekellé, Yaoundé", phone: "690220011", pathologies: [], allergies: [] },
  { k: "mballa", firstName: "Didier", lastName: "Mballa", sex: "M", age: 41, blood: "A+", address: "Etoudi, Yaoundé", phone: "677330022", pathologies: [], allergies: [] },
  { k: "abega", firstName: "Félicité", lastName: "Abega", sex: "F", age: 36, blood: "B+", address: "Odza, Yaoundé", phone: "699440033", pathologies: ["Anémie ferriprive"], allergies: [] },
  { k: "ngando", firstName: "Patrick", lastName: "Ngando", sex: "M", age: 19, blood: "O-", address: "Ahala, Yaoundé", phone: "675550044", pathologies: [], allergies: [] },
  { k: "zang", firstName: "Joséphine", lastName: "Zang", sex: "F", age: 63, blood: "A+", address: "Obili, Yaoundé", phone: "690660055", pathologies: ["Arthrose", "Hypertension artérielle"], allergies: [] },
  { k: "manga", firstName: "Éric", lastName: "Mengue", sex: "M", age: 50, blood: "AB-", address: "Mvan, Yaoundé", phone: "677770066", pathologies: ["Hépatite B chronique"], allergies: [] },
  { k: "bella", firstName: "Nadège", lastName: "Bella", sex: "F", age: 33, blood: "O+", address: "Messa, Yaoundé", phone: "699880077", pathologies: [], allergies: [] },
  { k: "toko", firstName: "Alain", lastName: "Toko", sex: "M", age: 55, blood: "B+", address: "Tsinga, Yaoundé", phone: "675990088", pathologies: ["Goutte"], allergies: ["Ibuprofène"] },
  { k: "onana", firstName: "Mireille", lastName: "Onana", sex: "F", age: 5, blood: "A+", address: "Elig-Edzoa, Yaoundé", phone: "690100099", pathologies: [], allergies: [] },
  { k: "ekani", firstName: "Grégoire", lastName: "Ekani", sex: "M", age: 47, blood: "O+", address: "Nsimeyong, Yaoundé", phone: "677210010", pathologies: [], allergies: [] },
  { k: "ndongo", firstName: "Viviane", lastName: "Ndongo", sex: "F", age: 30, blood: "B+", address: "Simbock, Yaoundé", phone: "699320020", pathologies: [], allergies: [] },
];

const PHARMACY = [
  { k: "paracetamol", name: "Paracétamol", dosage: "500 mg, comprimé", unitPrice: 50, cost: 25, stock: 1800, reorder: 300, category: "MEDICATION", expiryDays: 540 },
  { k: "amoxicilline", name: "Amoxicilline", dosage: "500 mg, gélule", unitPrice: 100, cost: 55, stock: 650, reorder: 150, category: "MEDICATION", expiryDays: 420 },
  { k: "artemether", name: "Artéméther-Luméfantrine", dosage: "20/120 mg, boîte de 24", unitPrice: 2500, cost: 1500, stock: 85, reorder: 30, category: "MEDICATION", expiryDays: 300 },
  { k: "artesunate", name: "Artésunate injectable", dosage: "60 mg, flacon", unitPrice: 3500, cost: 2200, stock: 40, reorder: 20, category: "MEDICATION", expiryDays: 45 },
  { k: "metformine", name: "Metformine", dosage: "850 mg, comprimé", unitPrice: 75, cost: 35, stock: 900, reorder: 200, category: "MEDICATION", expiryDays: 600 },
  { k: "amlodipine", name: "Amlodipine", dosage: "5 mg, comprimé", unitPrice: 100, cost: 45, stock: 700, reorder: 150, category: "MEDICATION", expiryDays: 480 },
  { k: "omeprazole", name: "Oméprazole", dosage: "20 mg, gélule", unitPrice: 100, cost: 40, stock: 120, reorder: 150, category: "MEDICATION", expiryDays: 365 },
  { k: "ceftriaxone", name: "Ceftriaxone", dosage: "1 g, flacon injectable", unitPrice: 1500, cost: 800, stock: 160, reorder: 40, category: "MEDICATION", expiryDays: 390 },
  { k: "metronidazole", name: "Métronidazole", dosage: "500 mg, comprimé", unitPrice: 50, cost: 20, stock: 500, reorder: 100, category: "MEDICATION", expiryDays: 30 },
  { k: "fer", name: "Fer + acide folique", dosage: "comprimé", unitPrice: 50, cost: 20, stock: 800, reorder: 200, category: "MEDICATION", expiryDays: 700 },
  { k: "salbutamol", name: "Salbutamol", dosage: "100 µg, aérosol", unitPrice: 3000, cost: 1800, stock: 8, reorder: 10, category: "MEDICATION", expiryDays: 500 },
  { k: "oxytocine", name: "Oxytocine", dosage: "10 UI, ampoule", unitPrice: 800, cost: 400, stock: 60, reorder: 20, category: "MEDICATION", expiryDays: 200 },
  { k: "tramadol", name: "Tramadol", dosage: "50 mg, gélule", unitPrice: 150, cost: 70, stock: 300, reorder: 80, category: "MEDICATION", expiryDays: 450 },
  { k: "diclofenac", name: "Diclofénac", dosage: "75 mg, ampoule", unitPrice: 300, cost: 120, stock: 220, reorder: 50, category: "MEDICATION", expiryDays: 380 },
  { k: "sro", name: "Sels de réhydratation orale", dosage: "sachet", unitPrice: 150, cost: 60, stock: 400, reorder: 100, category: "MEDICATION", expiryDays: 640 },
  { k: "ringer", name: "Ringer lactate", dosage: "500 ml, poche", unitPrice: 1000, cost: 550, stock: 140, reorder: 40, category: "MEDICATION", expiryDays: 520 },
  { k: "glucose", name: "Sérum glucosé 5 %", dosage: "500 ml, poche", unitPrice: 900, cost: 500, stock: 110, reorder: 40, category: "MEDICATION", expiryDays: 520 },
  { k: "gants", name: "Gants d'examen", dosage: "boîte de 100", unitPrice: 4000, cost: 2500, stock: 35, reorder: 10, category: "CONSUMABLE", expiryDays: 900 },
  { k: "seringue", name: "Seringue 5 ml", dosage: "unité", unitPrice: 100, cost: 40, stock: 1500, reorder: 300, category: "CONSUMABLE", expiryDays: 1000 },
  { k: "catheter", name: "Cathéter IV 20G", dosage: "unité", unitPrice: 500, cost: 220, stock: 260, reorder: 60, category: "CONSUMABLE", expiryDays: 800 },
  { k: "perfuseur", name: "Perfuseur", dosage: "unité", unitPrice: 400, cost: 180, stock: 240, reorder: 60, category: "CONSUMABLE", expiryDays: 800 },
  { k: "compresses", name: "Compresses stériles", dosage: "paquet de 10", unitPrice: 600, cost: 250, stock: 18, reorder: 30, category: "CONSUMABLE", expiryDays: 700 },
  { k: "tdr", name: "Test de diagnostic rapide paludisme", dosage: "unité", unitPrice: 1000, cost: 450, stock: 150, reorder: 50, category: "CONSUMABLE", expiryDays: 25 },
  { k: "tensiometre", name: "Tensiomètre électronique", dosage: "appareil", unitPrice: 25000, cost: 16000, stock: 4, reorder: 1, category: "EQUIPMENT", expiryDays: null },
];

const LAB_TESTS = [
  { k: "nfs", name: "NFS (numération formule sanguine)", department: "Hématologie", price: 5000, cost: 1800, minutes: 60 },
  { k: "hb", name: "Hémoglobine", department: "Hématologie", price: 2000, cost: 600, minutes: 30, low: 7, high: 20 },
  { k: "ge", name: "Goutte épaisse", department: "Parasitologie", price: 2500, cost: 700, minutes: 45 },
  { k: "glycemie", name: "Glycémie à jeun", department: "Biochimie", price: 2000, cost: 500, minutes: 30, low: 0.5, high: 4 },
  { k: "creatinine", name: "Créatininémie", department: "Biochimie", price: 3500, cost: 1100, minutes: 60, high: 60 },
  { k: "uree", name: "Urée", department: "Biochimie", price: 3000, cost: 900, minutes: 60 },
  { k: "transaminases", name: "Transaminases (ASAT/ALAT)", department: "Biochimie", price: 6000, cost: 2000, minutes: 90 },
  { k: "crp", name: "CRP", department: "Immunologie", price: 4500, cost: 1500, minutes: 45 },
  { k: "groupage", name: "Groupage sanguin ABO-Rhésus", department: "Immuno-hématologie", price: 3000, cost: 800, minutes: 30 },
  { k: "widal", name: "Sérodiagnostic de Widal", department: "Sérologie", price: 4000, cost: 1200, minutes: 60 },
  { k: "ecbu", name: "ECBU", department: "Bactériologie", price: 6500, cost: 2200, minutes: 2880 },
  { k: "kaliemie", name: "Kaliémie", department: "Biochimie", price: 3500, cost: 1000, minutes: 45, low: 2.5, high: 6.5 },
];

const RADIOLOGY_EXAMS = [
  { k: "thorax", name: "Radiographie du thorax (face)", modality: "XRAY", price: 12000 },
  { k: "genou", name: "Radiographie du genou", modality: "XRAY", price: 10000 },
  { k: "echo_abdo", name: "Échographie abdomino-pelvienne", modality: "ULTRASOUND", price: 15000 },
  { k: "echo_obst", name: "Échographie obstétricale", modality: "ULTRASOUND", price: 15000 },
  { k: "ecg", name: "Électrocardiogramme (ECG)", modality: "ECG", price: 8000 },
  { k: "scanner", name: "Scanner cérébral sans injection", modality: "CT", price: 60000 },
];

// ---------------------------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------------------------

async function main() {
  if (!coordinatorEmail) throw new Error("Indiquez l'e-mail du coordinateur de la clinique.");
  if (password.length < 12) throw new Error("MOT_DE_PASSE_DEMO absent ou trop court (12 caractères minimum).");

  const coordinator = await prisma.user.findUnique({ where: { email: coordinatorEmail }, include: { organization: true, coordinatorProfile: true } });
  if (!coordinator || coordinator.role !== "COORDINATOR") throw new Error(`Aucun coordinateur avec l'e-mail ${coordinatorEmail}.`);
  const clinic = coordinator.organization;
  if (!clinic || clinic.type !== "CLINIC") throw new Error("Ce coordinateur n'est rattaché à aucune clinique.");
  const clinicId = clinic.id;
  console.log(`Clinique : ${clinic.name} (${clinicId})`);

  if (clinic.parentId) {
    const holding = await prisma.organization.findUnique({ where: { id: clinic.parentId }, select: { name: true, disabledModules: true } });
    if (holding?.disabledModules?.length) {
      console.log(`Attention : modules désactivés pour la holding « ${holding.name} » : ${holding.disabledModules.join(", ")}. Leurs écrans resteront masqués.`);
    }
  }

  // --- Personnel de démonstration -----------------------------------------------------------
  const passwordHash = await bcrypt.hash(password, 10);
  const staff = {};
  for (const s of STAFF) {
    const existing = await prisma.user.findUnique({ where: { email: s.email }, include: { caregiverProfile: true } });
    if (existing && existing.organizationId !== clinicId) {
      throw new Error(`${s.email} appartient déjà à une autre clinique : ce script ne le déplacera pas.`);
    }
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, isActive: true, requiresPasswordChange: false }, include: { caregiverProfile: true } })
      : await prisma.user.create({
          data: {
            email: s.email,
            passwordHash,
            firstName: s.firstName,
            lastName: s.lastName,
            role: s.role,
            phone: `6${between(70, 99)}${between(100000, 999999)}`,
            organizationId: clinicId,
            ...(s.role === "MEDECIN" || s.role === "CAREGIVER"
              ? { caregiverProfile: { create: { specialties: s.specialties ?? [], certifications: [], licenseNumber: s.licenseNumber ?? null } } }
              : {}),
          },
          include: { caregiverProfile: true },
        });
    staff[s.key] = user;
  }
  const staffIds = Object.values(staff).map((u) => u.id);

  const previous = await readManifest(clinicId);
  if (previous && !replace) {
    throw new Error("Un jeu de démonstration existe déjà dans cette clinique. Relancez avec --remplacer pour le recréer.");
  }
  if (replace) await removePreviousDemo(clinicId, staffIds);

  const coord = coordinator;
  const doc = staff.medecin;
  const gyn = staff.gyneco;
  const surgeon = staff.chirurgien;
  const anesth = staff.anesthesiste;
  const nurse1 = staff.infirmier1;
  const nurse2 = staff.infirmier2;
  const midwife = staff.sagefemme;
  const labTech = staff.laborantin;
  const pharmacist = staff.pharmacien;
  const cashier = staff.caissier;
  let coordProfile = coordinator.coordinatorProfile;
  if (!coordProfile) coordProfile = await prisma.medicalCoordinator.create({ data: { userId: coordinator.id } });

  // --- Patients -------------------------------------------------------------------------------
  const patients = {};
  for (const p of PATIENTS) {
    const year = NOW.getUTCFullYear();
    const seq = await nextSequenceValue(`ipp-${year}`);
    const ipp = `IPP-${year}-${String(seq).padStart(6, "0")}`;
    const user = track("PatientUser", await prisma.user.create({
      data: {
        email: `${ipp.toLowerCase()}@patients.${DEMO_DOMAIN}`,
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
        firstName: p.firstName,
        lastName: p.lastName,
        role: "PATIENT",
        phone: p.phone,
        organizationId: clinicId,
        isActive: false,
      },
    }));
    patients[p.k] = track("Patient", await prisma.patient.create({
      data: {
        ipp,
        userId: user.id,
        dateOfBirth: yearsAgo(p.age, between(1, 12), between(1, 28)),
        sex: p.sex,
        bloodType: p.blood,
        address: p.address,
        emergencyContact: `Famille ${p.lastName} — 6${between(70, 99)}${between(100000, 999999)}`,
        dependencyLevel: p.age > 65 ? 2 : 1,
        pathologies: p.pathologies,
        allergies: p.allergies,
        organizationId: clinicId,
        status: "ADMITTED",
        createdAt: new Date(NOW.getTime() - between(20, 120) * DAY_MS),
      },
    }));
    patients[p.k].info = p;
  }
  const P = patients;
  const patientName = (k) => `${P[k].info.firstName} ${P[k].info.lastName}`;

  // Compte du portail patient et compte famille (parcours « Espace usagers »).
  await prisma.user.update({
    where: { id: P.zang.userId },
    data: { email: `patiente.zang@${DEMO_DOMAIN}`, passwordHash, isActive: true },
  });
  const familyUser = track("PatientUser", await prisma.user.create({
    data: { email: `famille.tchakounte@${DEMO_DOMAIN}`, passwordHash, firstName: "Brice", lastName: "Tchakounté", role: "FAMILY", phone: "699550101", organizationId: clinicId },
  }));
  await prisma.familyMember.create({ data: { userId: familyUser.id, patientId: P.tchakounte.id, relationship: "Fils" } });

  // --- Catalogues -----------------------------------------------------------------------------
  const pharmacy = {};
  for (const item of PHARMACY) {
    const expiry = item.expiryDays ? new Date(NOW.getTime() + item.expiryDays * DAY_MS) : null;
    const pi = track("PharmacyItem", await prisma.pharmacyItem.create({
      data: {
        name: item.name,
        dosage: item.dosage,
        category: item.category,
        stockQuantity: item.stock,
        reorderLevel: item.reorder,
        unitPrice: item.unitPrice,
        batchNumber: `LOT-${between(10000, 99999)}`,
        expiryDate: expiry,
        supplier: "CENAME",
        location: item.category === "MEDICATION" ? `Rayon ${pick(["A", "B", "C"])}${between(1, 6)}` : "Réserve",
        organizationId: clinicId,
        createdAt: new Date(NOW.getTime() - 60 * DAY_MS),
      },
    }));
    // Un lot d'achat valorisé par produit, dont le reste correspond au stock actuel.
    const bought = Math.round(item.stock * 1.4) + 10;
    const purchasedAt = new Date(NOW.getTime() - between(25, 45) * DAY_MS);
    const lot = track("StockPurchase", await prisma.stockPurchase.create({
      data: {
        pharmacyItemId: pi.id,
        quantity: bought,
        remainingQuantity: item.stock,
        purchasePrice: item.cost,
        totalCost: bought * item.cost,
        stockBefore: 0,
        stockAfter: bought,
        supplier: "CENAME",
        batchNumber: pi.batchNumber,
        expiryDate: expiry,
        invoiceRef: `FAC-CENAME-${between(1000, 9999)}`,
        purchasedById: pharmacist.id,
        organizationId: clinicId,
        createdAt: purchasedAt,
      },
    }));
    track("FinancialTransaction", await prisma.financialTransaction.create({
      data: {
        type: "EXPENSE",
        category: "PHARMACY_PURCHASE",
        amount: bought * item.cost,
        description: `Achat de stock : ${item.name} (${bought} unités)`,
        pharmacyItemId: pi.id,
        quantity: bought,
        recordedById: pharmacist.id,
        organizationId: clinicId,
        stockPurchaseId: lot.id,
        createdAt: purchasedAt,
      },
    }));
    pharmacy[item.k] = pi;
  }

  const suppliers = [];
  for (const s of [
    { name: "CENAME", contactName: "Service commercial", phone: "222230011", email: "commandes@cename.demo", address: "Yaoundé" },
    { name: "Laborex Cameroun", contactName: "M. Tchinda", phone: "233421100", email: "ventes@laborex.demo", address: "Douala" },
    { name: "Ubipharm", contactName: "Mme Ekotto", phone: "233435566", email: "contact@ubipharm.demo", address: "Douala" },
  ]) {
    suppliers.push(track("Supplier", await prisma.supplier.create({ data: { ...s, organizationId: clinicId } })));
  }
  track("PurchaseOrder", await prisma.purchaseOrder.create({
    data: {
      supplierId: suppliers[1].id,
      status: "SENT",
      reference: `BC-${dayKey(-2).replaceAll("-", "")}-01`,
      expectedDate: at(3, "10:00"),
      notes: "Réapprovisionnement des produits sous le seuil d'alerte.",
      organizationId: clinicId,
      createdById: pharmacist.id,
      sentAt: at(-2, "11:00"),
      createdAt: at(-2, "10:30"),
      lines: {
        create: [
          { pharmacyItemId: pharmacy.salbutamol.id, quantityOrdered: 30, unitCost: 1800 },
          { pharmacyItemId: pharmacy.omeprazole.id, quantityOrdered: 400, unitCost: 40 },
          { pharmacyItemId: pharmacy.compresses.id, quantityOrdered: 100, unitCost: 250 },
        ],
      },
    },
  }));

  const labTests = {};
  for (const t of LAB_TESTS) {
    labTests[t.k] = track("LabTest", await prisma.labTest.create({
      data: {
        name: t.name,
        department: t.department,
        durationMinutes: t.minutes,
        criticalLow: t.low ?? null,
        criticalHigh: t.high ?? null,
        basePrice: t.price,
        baseCost: t.cost,
        organizationId: clinicId,
      },
    }));
  }

  const radiology = {};
  for (const e of RADIOLOGY_EXAMS) {
    radiology[e.k] = track("RadiologyExam", await prisma.radiologyExam.create({
      data: { organizationId: clinicId, name: e.name, modality: e.modality, basePrice: e.price },
    }));
  }

  // --- Services, chambres et lits -------------------------------------------------------------
  const WARDS = [
    { code: "MEDECINE", name: "Médecine générale", rate: 15000, rooms: [["Chambre 101", 2], ["Chambre 102", 2], ["Chambre 103 (VIP)", 1, 35000]] },
    { code: "CHIRURGIE", name: "Chirurgie", rate: 20000, rooms: [["Chambre 201", 2], ["Chambre 202", 2]] },
    { code: "MATERNITE", name: "Maternité", rate: 15000, rooms: [["Chambre 301", 2], ["Salle de naissance", 1, 0]] },
    { code: "URGENCES", name: "Urgences", rate: 10000, rooms: [["Box 1", 1], ["Box 2", 1], ["Box 3", 1]] },
  ];
  const wards = {};
  const freeBeds = {};
  for (const w of WARDS) {
    let ward = await prisma.ward.findUnique({ where: { organizationId_code: { organizationId: clinicId, code: w.code } } });
    if (!ward) ward = track("Ward", await prisma.ward.create({ data: { name: w.name, code: w.code, nightlyRate: w.rate, organizationId: clinicId } }));
    wards[w.code] = ward;
    for (const [roomName, bedCount, roomRate] of w.rooms) {
      let room = await prisma.room.findUnique({ where: { wardId_name: { wardId: ward.id, name: roomName } } });
      if (!room) {
        room = track("Room", await prisma.room.create({
          data: { name: roomName, wardId: ward.id, organizationId: clinicId, nightlyRate: roomRate ?? null },
        }));
      }
      for (let i = 0; i < bedCount; i++) {
        const label = bedCount === 1 ? "1" : String.fromCharCode(65 + i);
        let bed = await prisma.bed.findUnique({ where: { roomId_label: { roomId: room.id, label } } });
        if (!bed) bed = track("Bed", await prisma.bed.create({ data: { label, roomId: room.id, wardId: ward.id, organizationId: clinicId } }));
        if (bed.status === "AVAILABLE") {
          (freeBeds[w.code] ??= []).push({ bed, room, ward, rate: room.nightlyRate ?? ward.nightlyRate ?? 0 });
        }
      }
    }
  }

  // --- Planning des gardes (semaine en cours) -------------------------------------------------
  const shiftPlan = [
    [doc, "Consultations", "07:30", "15:30"], [gyn, "Consultations prénatales", "08:00", "14:00"], [surgeon, "Bloc opératoire", "07:00", "15:00"],
    [anesth, "Bloc opératoire", "07:00", "15:00"], [nurse1, "Garde de jour", "07:00", "19:00"], [nurse2, "Garde de nuit", "19:00", "07:00"],
    [midwife, "Garde maternité", "07:00", "19:00"], [labTech, "Laboratoire", "07:00", "15:00"], [pharmacist, "Pharmacie", "08:00", "17:00"], [cashier, "Caisse", "07:30", "16:30"],
  ];
  for (let d = -3; d <= 4; d++) {
    for (const [user, title, start, end] of shiftPlan) {
      const startAt = at(d, start);
      let endAt = at(d, end);
      if (endAt <= startAt) endAt = new Date(endAt.getTime() + DAY_MS);
      track("Shift", await prisma.shift.create({ data: { userId: user.id, createdById: coord.id, title, startAt, endAt } }));
    }
  }
  track("CalendarEvent", await prisma.calendarEvent.create({
    data: { userId: coord.id, title: "Réunion qualité et gestion des risques", description: "Revue des incidents du mois et des indicateurs.", startAt: at(1, "15:00"), endAt: at(1, "16:00") },
  }));

  // --- Caisses --------------------------------------------------------------------------------
  let register = await prisma.cashRegister.findFirst({ where: { organizationId: clinicId, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!register) register = track("CashRegister", await prisma.cashRegister.create({ data: { name: "Caisse principale", organizationId: clinicId } }));

  // --- Outils de facturation ------------------------------------------------------------------
  const svc = (description, amount) => ({ type: "SERVICE", description, quantity: 1, unitPrice: amount, amount });
  const lab = (t) => ({ type: "LAB", description: `Analyse : ${t.name}`, quantity: 1, unitPrice: t.basePrice, amount: t.basePrice });
  const med = (k, quantity, dispensed = 0) => {
    const it = pharmacy[k];
    return {
      type: "PHARMACY",
      pharmacyItemId: it.id,
      description: `${it.name}${it.dosage ? ` (${it.dosage})` : ""}`,
      quantity,
      unitPrice: it.unitPrice,
      amount: it.unitPrice * quantity,
      ...(dispensed ? { dispensedQuantity: dispensed } : {}),
    };
  };
  const total = (items) => items.reduce((s, i) => s + i.amount, 0);
  const category = (items) => (items.some((i) => i.type === "PHARMACY") ? "PHARMACY_SALE" : items.some((i) => i.type === "LAB") ? "LAB_EXAM_FEE" : "SERVICE_FEE");
  const describe = (items) => (items.length === 1 ? items[0].description : `Facture regroupée (${items.length} articles : ${items.map((i) => i.description).join(", ")})`);

  async function invoice({ patient, items, createdBy, createdAt, medicalRecordId = null, hospitalStayId = null, payments = [], dispensedAt = null, walkIn = null }) {
    const sum = total(items);
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    const status = paid <= 0 ? "PENDING" : paid >= sum ? "PAID" : "PARTIAL";
    const lastPayment = payments.at(-1);
    const inv = track("PendingInvoice", await prisma.pendingInvoice.create({
      data: {
        status,
        patientId: patient?.id ?? null,
        customPatientName: walkIn?.name ?? null,
        customPatientPhone: walkIn?.phone ?? null,
        medicalRecordId,
        organizationId: clinicId,
        items,
        createdById: createdBy.id,
        hospitalStayId,
        cashSessionId: lastPayment?.session.id ?? null,
        createdAt,
        paidAt: status === "PAID" ? lastPayment.at : null,
        dispensedAt,
        labConsumablesDispensedAt: null,
      },
    }));
    for (const p of payments) {
      track("FinancialTransaction", await prisma.financialTransaction.create({
        data: {
          type: "INCOME",
          category: category(items),
          amount: p.amount,
          description: describe(items),
          items,
          patientId: patient?.id ?? null,
          customPatientName: walkIn?.name ?? null,
          customPatientPhone: walkIn?.phone ?? null,
          recordedById: cashier.id,
          organizationId: clinicId,
          cashSessionId: p.session.id,
          pendingInvoiceId: inv.id,
          createdAt: p.at,
        },
      }));
      p.session.cashIn += p.amount;
    }
    return inv;
  }

  // Sessions de caisse fermées des 30 derniers jours (pas de session ouverte : la vidéo l'ouvre).
  const sessions = {};
  for (let d = -30; d <= -1; d++) {
    const s = track("CashSession", await prisma.cashSession.create({
      data: {
        registerId: register.id,
        organizationId: clinicId,
        openedById: cashier.id,
        openedAt: at(d, "07:30"),
        openingFloat: 50000,
        status: "CLOSED",
        closedById: cashier.id,
        closedAt: at(d, "17:00"),
      },
    }));
    s.cashIn = 0;
    s.cashOut = 0;
    s.day = d;
    sessions[d] = s;
  }
  // `time` : heure locale « HH:MM », ou un instant ISO déjà calculé.
  const payAt = (d, time, amount) => ({ session: sessions[d], at: time.includes("T") ? new Date(time) : at(d, time), amount });

  // --- Historique : consultations, examens et ventes des 30 derniers jours --------------------
  const diagnoses = [
    ["B54", "Paludisme, sans précision", ["artemether", 1], ["paracetamol", 12]],
    ["J06.9", "Infection aiguë des voies respiratoires supérieures", ["amoxicilline", 21], ["paracetamol", 12]],
    ["I10", "Hypertension essentielle", ["amlodipine", 30]],
    ["E11.9", "Diabète de type 2 sans complication", ["metformine", 60]],
    ["K29.7", "Gastrite, sans précision", ["omeprazole", 28]],
    ["A09", "Diarrhée et gastro-entérite d'origine infectieuse présumée", ["sro", 6], ["metronidazole", 15]],
    ["M54.5", "Lombalgie basse", ["tramadol", 10], ["paracetamol", 12]],
    ["D50.9", "Anémie par carence en fer", ["fer", 60]],
  ];
  const consultants = [doc, doc, doc, gyn, surgeon];
  const patientKeys = Object.keys(P);
  for (let d = -30; d <= -1; d++) {
    const perDay = between(3, 6);
    for (let n = 0; n < perDay; n++) {
      const pk = pick(patientKeys);
      const patient = P[pk];
      const physician = pick(consultants);
      const [code, label, ...meds] = pick(diagnoses);
      const time = `${String(8 + n * 1 + between(0, 1)).padStart(2, "0")}:${pick(["00", "15", "30", "45"])}`;
      const when = at(d, time);
      const appointment = track("Appointment", await prisma.appointment.create({
        data: { patientId: patient.id, caregiverId: physician.caregiverProfile.id, title: "Consultation", scheduledAt: when, durationMinutes: 20, type: "Visite médicale", status: "COMPLETED" },
      }));
      track("VitalSign", await prisma.vitalSign.create({
        data: {
          patientId: patient.id, recordedById: nurse1.id, appointmentId: appointment.id,
          temperature: code === "B54" ? 38.6 : 36.9, bloodPressure: code === "I10" ? "158/96" : `${between(110, 135)}/${between(70, 85)}`,
          heartRate: between(68, 96), oxygenSaturation: between(95, 99), weight: between(52, 88), painScore: between(0, 5), createdAt: when,
        },
      }));
      const record = track("MedicalRecord", await prisma.medicalRecord.create({
        data: {
          patientId: patient.id, appointmentId: appointment.id, title: `Consultation — ${label}`,
          description: `Motif : ${pick(["fièvre et céphalées", "douleurs abdominales", "toux persistante", "contrôle tensionnel", "fatigue", "douleurs lombaires"])}. Examen clinique réalisé. Conduite à tenir expliquée au patient.`,
          diagnosisCode: code, diagnosisLabel: label, createdById: physician.id, createdAt: when,
        },
      }));
      const items = [svc("Frais de consultation", physician === surgeon || physician === gyn ? 15000 : 10000)];
      for (const [mk, q] of meds) items.push(med(mk, q, q));
      const prescription = track("Prescription", await prisma.prescription.create({
        data: {
          patientId: patient.id, prescribedById: physician.id, medicalRecordId: record.id, appointmentId: appointment.id, organizationId: clinicId,
          status: "DISPENSED", sentToPharmacyAt: when, dispensedById: pharmacist.id, dispensedAt: new Date(when.getTime() + 50 * 60000), createdAt: when,
          items: { create: meds.map(([mk, q]) => ({ pharmacyItemId: pharmacy[mk].id, drugName: pharmacy[mk].name, dosage: pharmacy[mk].dosage ?? "", frequency: pick(["1 matin et soir", "3 fois par jour", "1 par jour"]), duration: "7 jours", quantity: q })) },
        },
      }));
      const payTime = new Date(when.getTime() + between(20, 45) * 60000).toISOString();
      const inv = await invoice({ patient, items, createdBy: physician, createdAt: when, medicalRecordId: record.id, payments: [payAt(d, payTime, total(items))], dispensedAt: new Date(when.getTime() + 50 * 60000) });
      await prisma.prescription.update({ where: { id: prescription.id }, data: { pendingInvoiceId: inv.id } });

      // Un examen biologique validé une fois sur trois.
      if (rand() < 0.35) {
        const tests = code === "B54" ? [labTests.ge, labTests.nfs] : code === "E11.9" ? [labTests.glycemie, labTests.creatinine] : [labTests.nfs, labTests.crp];
        const labInv = await invoice({ patient, items: tests.map(lab), createdBy: physician, createdAt: when, medicalRecordId: record.id, payments: [payAt(d, payTime, total(tests.map(lab)))] });
        await createLabOrderWithResults({ patient, physician, tests, when, recordId: record.id, invoiceId: labInv.id, status: "DELIVERED" });
      }
    }
    // Ventes au comptoir et dépenses courantes.
    if (rand() < 0.6) {
      const items = [med(pick(["paracetamol", "sro", "fer", "seringue"]), between(2, 10)), med("gants", 1)];
      items.forEach((i) => (i.dispensedQuantity = i.quantity));
      await invoice({ items, createdBy: cashier, createdAt: at(d, "11:20"), walkIn: { name: pick(["Client comptant", "Mme Ndi", "M. Ayissi"]), phone: null }, payments: [payAt(d, "11:20", total(items))], dispensedAt: at(d, "11:35") });
    }
    if (d % 6 === 0) {
      const amount = pick([15000, 25000, 8000]);
      track("FinancialTransaction", await prisma.financialTransaction.create({
        data: { type: "EXPENSE", category: "OPERATIONAL_EXPENSE", amount, description: pick(["Carburant groupe électrogène", "Achat de fournitures de bureau", "Réparation climatiseur"]), recordedById: cashier.id, organizationId: clinicId, cashSessionId: sessions[d].id, createdAt: at(d, "13:00") },
      }));
      sessions[d].cashOut += amount;
    }
  }

  // Hospitalisations terminées du mois (séjours facturés et réglés).
  for (const [pk, start, nights] of [["mballa", -24, 3], ["ngando", -17, 2], ["mvondo", -11, 4]]) {
    const patient = P[pk];
    const slot = freeBeds.MEDECINE?.[0];
    if (!slot) break;
    const stay = await prisma.hospitalStay.create({
      data: { patientId: patient.id, organizationId: clinicId, status: "CLOSED", admittedAt: at(start, "10:00"), admittedById: doc.id, nightsBilled: nights, dischargedAt: at(start + nights, "11:00"), dischargedById: doc.id, createdAt: at(start, "10:00") },
    });
    track("HospitalStay", stay);
    await prisma.bedStay.create({
      data: { hospitalStayId: stay.id, patientId: patient.id, bedId: slot.bed.id, bedLabel: slot.bed.label, roomName: slot.room.name, wardName: slot.ward.name, organizationId: clinicId, nightlyRate: slot.rate, startedAt: at(start, "10:00"), endedAt: at(start + nights, "11:00"), endedReason: "DISCHARGE" },
    });
    const items = [{ type: "SERVICE", description: `Hospitalisation — ${slot.ward.name} / ${slot.room.name} (lit ${slot.bed.label}) — ${nights} nuitées`, quantity: nights, unitPrice: slot.rate, amount: slot.rate * nights }];
    await invoice({ patient, items, createdBy: coord, createdAt: at(start + nights, "10:30"), hospitalStayId: stay.id, payments: [payAt(start + nights, "11:00", total(items))] });
  }

  // --- Laboratoire ----------------------------------------------------------------------------
  async function createLabOrderWithResults({ patient, physician, tests, when, recordId = null, invoiceId = null, status, priority = "ROUTINE", results = null, notes = null }) {
    const collected = ["SAMPLE_COLLECTED", "RECEIVED_AT_LAB", "IN_ANALYSIS", "TO_VALIDATE", "VALIDATED", "DELIVERED"].includes(status);
    const order = track("LabOrder", await prisma.labOrder.create({
      data: {
        patientId: patient.id, medicalRecordId: recordId, organizationId: clinicId, tests: tests.map((t) => t.name), notes,
        status, priority, pendingInvoiceId: invoiceId, orderedById: physician.id,
        testDetails: tests.map((t) => ({ testName: t.name, labTestId: t.id, basePrice: t.basePrice, baseCost: t.baseCost, consumables: [], totalPrice: t.basePrice })),
        sampleType: collected ? (tests.some((t) => t.name === "ECBU") ? "URINE" : "BLOOD") : null,
        sampleCollectedAt: collected ? new Date(when.getTime() + 30 * 60000) : null,
        sampleCollectedById: collected ? nurse1.id : null,
        sampleQuantity: collected ? "5 ml" : null,
        sampleCondition: collected ? "Conforme" : null,
        createdAt: when,
      },
    }));
    if (["TO_VALIDATE", "VALIDATED", "DELIVERED"].includes(status)) {
      const validated = status !== "TO_VALIDATE";
      for (const t of tests) {
        const r = results?.[t.name] ?? normalResult(t.name);
        await prisma.labResult.create({
          data: {
            labOrderId: order.id, testName: t.name, value: r.value, unit: r.unit, referenceRange: r.range, isAbnormal: r.abnormal ?? false, notes: r.notes ?? null,
            recordedById: labTech.id, validatedById: validated ? doc.id : null, validatedAt: validated ? new Date(when.getTime() + 3 * 3600000) : null,
            createdAt: new Date(when.getTime() + 2 * 3600000),
          },
        });
      }
    }
    return order;
  }

  // --- Aujourd'hui : file d'attente de l'accueil ----------------------------------------------
  async function visit(pk, destination, arrivedMinutesAgo, status, extra = {}) {
    const ticketNumber = await nextSequenceValue(`visit-${clinicId}-${todayKey}`);
    const arrivedAt = minutesAgo(arrivedMinutesAgo);
    return track("Visit", await prisma.visit.create({
      data: {
        organizationId: clinicId, patientId: P[pk].id, visitDate: todayKey, ticketNumber, destination, priority: extra.priority ?? "NORMAL",
        reason: extra.reason ?? null, assignedToId: extra.assignedToId ?? null, status, arrivedAt,
        calledAt: ["CALLED", "IN_PROGRESS", "DONE"].includes(status) ? new Date(arrivedAt.getTime() + 15 * 60000) : null,
        startedAt: ["IN_PROGRESS", "DONE"].includes(status) ? new Date(arrivedAt.getTime() + 20 * 60000) : null,
        completedAt: status === "DONE" ? new Date(arrivedAt.getTime() + 45 * 60000) : null,
        createdById: cashier.id, handledById: ["IN_PROGRESS", "DONE"].includes(status) ? (extra.assignedToId ?? doc.id) : null,
        triageLevel: extra.triageLevel ?? null, triagedAt: extra.triageLevel ? new Date(arrivedAt.getTime() + 5 * 60000) : null,
        createdAt: arrivedAt,
      },
    }));
  }

  await visit("kamdem", "CONSULTATION", 150, "DONE", { reason: "Fièvre depuis 3 jours", assignedToId: doc.id });
  await visit("fouda", "CONSULTATION", 95, "IN_PROGRESS", { reason: "Contrôle tensionnel", assignedToId: doc.id });
  await visit("bella", "CONSULTATION", 70, "CALLED", { reason: "Douleurs abdominales", assignedToId: doc.id });
  await visit("ekani", "CONSULTATION", 55, "WAITING", { reason: "Toux persistante" });
  await visit("ndongo", "CONSULTATION", 40, "WAITING", { reason: "Consultation prénatale", assignedToId: gyn.id });
  await visit("toko", "LAB", 35, "WAITING", { reason: "Bilan prescrit" });
  await visit("djomo", "PHARMACY", 25, "WAITING", { reason: "Renouvellement d'ordonnance" });
  await visit("manga", "NURSING", 20, "WAITING", { reason: "Pansement" });
  await visit("owona", "ADMINISTRATIVE", 10, "WAITING", { reason: "Certificat médical" });

  // Urgences : trois patients triés, un en attente de tri.
  const emergencies = [
    { pk: "eyenga", minutes: 50, level: 2, complaint: "Douleur thoracique avec dyspnée", vitals: { temperature: 37.2, bloodPressure: "165/100", heartRate: 118, respiratoryRate: 26, oxygenSaturation: 91, painScore: 7, glasgow: 15 }, status: "IN_PROGRESS" },
    { pk: "biya", minutes: 35, level: 3, complaint: "Crise vaso-occlusive drépanocytaire", vitals: { temperature: 38.4, bloodPressure: "105/65", heartRate: 112, respiratoryRate: 22, oxygenSaturation: 95, painScore: 8, glasgow: 15 }, status: "WAITING" },
    { pk: "onana", minutes: 20, level: 4, complaint: "Plaie de l'avant-bras", vitals: { temperature: 36.8, bloodPressure: "100/60", heartRate: 96, respiratoryRate: 20, oxygenSaturation: 99, painScore: 4, glasgow: 15 }, status: "WAITING" },
  ];
  for (const e of emergencies) {
    const v = await visit(e.pk, "EMERGENCY", e.minutes, e.status, { priority: "URGENT", triageLevel: e.level, reason: e.complaint, assignedToId: e.status === "IN_PROGRESS" ? doc.id : null });
    const triagedAt = new Date(v.arrivedAt.getTime() + 5 * 60000);
    const vital = track("VitalSign", await prisma.vitalSign.create({
      data: { patientId: P[e.pk].id, recordedById: nurse1.id, temperature: e.vitals.temperature, bloodPressure: e.vitals.bloodPressure, heartRate: e.vitals.heartRate, oxygenSaturation: e.vitals.oxygenSaturation, painScore: e.vitals.painScore, notes: "Tri des urgences", createdAt: triagedAt },
    }));
    track("EmergencyTriage", await prisma.emergencyTriage.create({
      data: { visitId: v.id, patientId: P[e.pk].id, organizationId: clinicId, level: e.level, chiefComplaint: e.complaint, ...e.vitals, vitalSignId: vital.id, triagedById: nurse1.id, triagedAt },
    }));
  }
  await visit("mvondo", "EMERGENCY", 5, "WAITING", { priority: "URGENT", reason: "Crise d'asthme" });

  // Rendez-vous à venir (aujourd'hui et prochains jours).
  for (const [pk, user, d, time, title] of [
    ["bella", doc, 0, "11:30", "Consultation"], ["ekani", doc, 0, "14:00", "Consultation de suivi"], ["atangana", doc, 0, "15:00", "Suivi diabète et tension"],
    ["ndongo", gyn, 0, "10:30", "Consultation prénatale"], ["essomba", gyn, 1, "09:00", "Consultation prénatale"], ["zang", doc, 1, "10:00", "Renouvellement d'ordonnance"],
    ["kamdem", doc, 2, "09:30", "Résultats d'analyses"], ["tchakounte", doc, 3, "11:00", "Consultation de contrôle post-hospitalisation"], ["mballa", surgeon, 4, "09:00", "Consultation post-opératoire"],
  ]) {
    track("Appointment", await prisma.appointment.create({
      data: { patientId: P[pk].id, caregiverId: user.caregiverProfile.id, title, scheduledAt: at(d, time), durationMinutes: 30, type: "Visite médicale", status: "SCHEDULED" },
    }));
  }

  // Consultation du matin terminée : facture en attente à la caisse avec ordonnance pour la pharmacie.
  {
    const when = minutesAgo(110);
    const record = track("MedicalRecord", await prisma.medicalRecord.create({
      data: { patientId: P.kamdem.id, title: "Consultation — Paludisme, sans précision", description: "Fièvre à 39 °C depuis 3 jours, céphalées, courbatures. TDR paludisme positif. Pas de signe de gravité.", diagnosisCode: "B54", diagnosisLabel: "Paludisme, sans précision", createdById: doc.id, createdAt: when },
    }));
    track("VitalSign", await prisma.vitalSign.create({ data: { patientId: P.kamdem.id, recordedById: nurse1.id, temperature: 39.1, bloodPressure: "118/76", heartRate: 102, oxygenSaturation: 98, weight: 78, painScore: 4, createdAt: minutesAgo(130) } }));
    const items = [svc("Frais de consultation", 10000), med("artemether", 1), med("paracetamol", 12), med("tdr", 1)];
    const inv = await invoice({ patient: P.kamdem, items, createdBy: doc, createdAt: when, medicalRecordId: record.id });
    track("Prescription", await prisma.prescription.create({
      data: {
        patientId: P.kamdem.id, prescribedById: doc.id, medicalRecordId: record.id, organizationId: clinicId, status: "SENT_TO_PHARMACY", pendingInvoiceId: inv.id, sentToPharmacyAt: when, createdAt: when,
        notes: "Revoir si la fièvre persiste au-delà de 72 h.",
        items: { create: [
          { pharmacyItemId: pharmacy.artemether.id, drugName: pharmacy.artemether.name, dosage: "4 comprimés", frequency: "2 fois par jour", duration: "3 jours", quantity: 1, instructions: "À prendre avec un repas" },
          { pharmacyItemId: pharmacy.paracetamol.id, drugName: pharmacy.paracetamol.name, dosage: "1 g", frequency: "3 fois par jour", duration: "4 jours", quantity: 12 },
        ] },
      },
    }));
    const labItems = [lab(labTests.nfs), lab(labTests.ge)];
    const labInv = await invoice({ patient: P.kamdem, items: labItems, createdBy: doc, createdAt: when, medicalRecordId: record.id });
    await createLabOrderWithResults({ patient: P.kamdem, physician: doc, tests: [labTests.nfs, labTests.ge], when, recordId: record.id, invoiceId: labInv.id, status: "PRESCRIBED", notes: "Fièvre, TDR positif : contrôler la parasitémie." });
  }

  // Ordonnance réglée hier, pas encore remise : file de la pharmacie.
  {
    const when = at(-1, "16:10");
    const items = [svc("Frais de consultation", 10000), med("amlodipine", 30), med("metformine", 60)];
    const record = track("MedicalRecord", await prisma.medicalRecord.create({
      data: { patientId: P.atangana.id, title: "Consultation — Hypertension essentielle", description: "Tension à 152/94 sous traitement, glycémie capillaire 1,62 g/L. Renforcement de l'hygiène de vie, renouvellement du traitement.", diagnosisCode: "I10", diagnosisLabel: "Hypertension essentielle", createdById: doc.id, createdAt: when },
    }));
    const inv = await invoice({ patient: P.atangana, items, createdBy: doc, createdAt: when, medicalRecordId: record.id, payments: [payAt(-1, "16:30", total(items))] });
    track("Prescription", await prisma.prescription.create({
      data: {
        patientId: P.atangana.id, prescribedById: doc.id, medicalRecordId: record.id, organizationId: clinicId, status: "SENT_TO_PHARMACY", pendingInvoiceId: inv.id, sentToPharmacyAt: when, createdAt: when,
        items: { create: [
          { pharmacyItemId: pharmacy.amlodipine.id, drugName: pharmacy.amlodipine.name, dosage: "5 mg", frequency: "1 par jour le matin", duration: "30 jours", quantity: 30 },
          { pharmacyItemId: pharmacy.metformine.id, drugName: pharmacy.metformine.name, dosage: "850 mg", frequency: "matin et soir", duration: "30 jours", quantity: 60 },
        ] },
      },
    }));
  }
  // Facture en acompte (vente à crédit) d'il y a 5 jours.
  {
    const items = [svc("Frais de consultation", 15000), lab(labTests.transaminases), med("fer", 60, 60)];
    await invoice({ patient: P.manga, items, createdBy: doc, createdAt: at(-5, "09:40"), payments: [payAt(-5, "10:00", 15000)], dispensedAt: at(-5, "10:20") });
  }

  // Examens du jour à différentes étapes.
  {
    const mk = async (pk, tests, minutes, status, extra = {}) => {
      const when = minutesAgo(minutes);
      const items = tests.map(lab);
      const inv = await invoice({ patient: P[pk], items, createdBy: extra.physician ?? doc, createdAt: when, payments: extra.paid ? [payAt(-1, "16:45", total(items))] : [] });
      return createLabOrderWithResults({ patient: P[pk], physician: extra.physician ?? doc, tests, when, invoiceId: inv.id, status, priority: extra.priority ?? "ROUTINE", results: extra.results, notes: extra.notes });
    };
    await mk("toko", [labTests.uree, labTests.creatinine], 35, "PRESCRIBED", { notes: "Bilan rénal de contrôle, goutte." });
    await mk("zang", [labTests.glycemie, labTests.kaliemie], 120, "SAMPLE_COLLECTED");
    await mk("abega", [labTests.nfs, labTests.hb], 180, "IN_ANALYSIS", { paid: true });
    await mk("tchakounte", [labTests.kaliemie, labTests.creatinine], 240, "TO_VALIDATE", {
      priority: "URGENT", paid: true,
      results: {
        [labTests.kaliemie.name]: { value: "6.9", unit: "mmol/L", range: "3.5 - 5.0", abnormal: true, notes: "Valeur critique, médecin prévenu par téléphone." },
        [labTests.creatinine.name]: { value: "24", unit: "mg/L", range: "7 - 13", abnormal: true },
      },
    });
    await mk("eyenga", [labTests.nfs, labTests.crp], 45, "PRESCRIBED", { priority: "URGENT", notes: "Douleur thoracique — bilan en urgence." });
  }

  // --- Imagerie -------------------------------------------------------------------------------
  async function radiologyOrder(pk, exams, minutes, status, extra = {}) {
    const when = minutesAgo(minutes);
    const items = exams.map((e) => svc(`Imagerie : ${e.name}`, e.basePrice));
    const inv = await invoice({ patient: P[pk], items, createdBy: doc, createdAt: when, payments: extra.paid ? [payAt(-1, "15:30", total(items))] : [] });
    const done = ["PERFORMED", "REPORTED", "VALIDATED"].includes(status);
    const reported = ["REPORTED", "VALIDATED"].includes(status);
    return track("RadiologyOrder", await prisma.radiologyOrder.create({
      data: {
        patientId: P[pk].id, organizationId: clinicId, exams: exams.map((e) => ({ examId: e.id, name: e.name, modality: e.modality, price: e.basePrice })),
        clinicalIndication: extra.indication ?? null, priority: extra.priority ?? "ROUTINE", status, pendingInvoiceId: inv.id, orderedById: extra.orderedBy?.id ?? doc.id,
        performedById: done ? nurse2.id : null, performedAt: done ? new Date(when.getTime() + 40 * 60000) : null, performedNotes: done ? "Examen réalisé sans incident." : null,
        report: reported ? extra.report : null, conclusion: reported ? extra.conclusion : null, reportedById: reported ? doc.id : null, reportedAt: reported ? new Date(when.getTime() + 90 * 60000) : null,
        validatedById: status === "VALIDATED" ? doc.id : null, validatedAt: status === "VALIDATED" ? new Date(when.getTime() + 120 * 60000) : null,
        createdAt: when,
      },
    }));
  }
  await radiologyOrder("eyenga", [radiology.thorax, radiology.ecg], 40, "PRESCRIBED", { priority: "URGENT", indication: "Douleur thoracique avec dyspnée" });
  await radiologyOrder("nana", [radiology.echo_abdo], 200, "PERFORMED", { paid: true, indication: "Épigastralgies récidivantes" });
  await radiologyOrder("tchakounte", [radiology.thorax], 26 * 60, "REPORTED", { paid: true, indication: "Dyspnée d'effort, insuffisance cardiaque connue", report: "Cardiomégalie (index cardio-thoracique à 0,58). Discrète redistribution vasculaire vers les sommets. Pas d'épanchement pleural.", conclusion: "Cardiomégalie avec signes de surcharge modérée." });
  await radiologyOrder("djomo", [radiology.echo_abdo], 3 * 24 * 60, "VALIDATED", { paid: true, indication: "Troubles mictionnels", report: "Prostate augmentée de volume (45 cc), homogène. Résidu post-mictionnel à 60 ml. Reins sans dilatation.", conclusion: "Hypertrophie prostatique, résidu post-mictionnel modéré." });
  await radiologyOrder("ndongo", [radiology.echo_obst], 30, "PRESCRIBED", { indication: "Échographie du 2e trimestre", orderedBy: gyn });

  // --- Hospitalisation en cours, soins et constantes ------------------------------------------
  const hospitalized = {};
  async function admit(pk, wardCode, daysAgo, by, reason) {
    const slot = freeBeds[wardCode]?.shift();
    if (!slot) {
      console.log(`Plus de lit libre en ${wardCode} : ${patientName(pk)} n'est pas hospitalisé(e).`);
      return null;
    }
    const admittedAt = at(-daysAgo, "10:30");
    const stay = track("HospitalStay", await prisma.hospitalStay.create({ data: { patientId: P[pk].id, organizationId: clinicId, status: "OPEN", admittedAt, admittedById: by.id, createdAt: admittedAt } }));
    await prisma.bedStay.create({
      data: { hospitalStayId: stay.id, patientId: P[pk].id, bedId: slot.bed.id, bedLabel: slot.bed.label, roomName: slot.room.name, wardName: slot.ward.name, organizationId: clinicId, nightlyRate: slot.rate, startedAt: admittedAt },
    });
    await prisma.bed.update({ where: { id: slot.bed.id }, data: { status: "OCCUPIED" } });
    await prisma.patient.update({ where: { id: P[pk].id }, data: { bedId: slot.bed.id } });
    const plan = track("CarePlan", await prisma.carePlan.create({ data: { patientId: P[pk].id, coordinatorId: coordProfile.id, title: `Hospitalisation — ${reason}`, startDate: admittedAt, status: "ACTIVE" } }));
    hospitalized[pk] = { stay, slot, plan, admittedAt };
    // Constantes deux fois par jour depuis l'admission.
    for (let d = -daysAgo; d <= 0; d++) {
      for (const time of ["08:00", "18:00"]) {
        const when = at(d, time);
        if (when < admittedAt || when > NOW) continue;
        track("VitalSign", await prisma.vitalSign.create({
          data: {
            patientId: P[pk].id, recordedById: time === "08:00" ? nurse1.id : nurse2.id,
            temperature: Math.round((36.6 + rand() * (d === -daysAgo ? 2 : 0.8)) * 10) / 10,
            bloodPressure: `${between(115, 150)}/${between(70, 92)}`, heartRate: between(70, 104), oxygenSaturation: between(93, 99),
            bloodSugar: P[pk].info.pathologies.some((x) => x.includes("Diabète")) ? Math.round((1.1 + rand()) * 100) / 100 : null,
            painScore: between(1, 5), createdAt: when,
          },
        }));
      }
    }
    return hospitalized[pk];
  }

  await admit("tchakounte", "MEDECINE", 4, doc, "Décompensation cardiaque");
  await admit("atangana", "MEDECINE", 2, doc, "Déséquilibre glycémique");
  await admit("zang", "MEDECINE", 1, doc, "Pneumopathie");
  await admit("mballa", "CHIRURGIE", 1, surgeon, "Hernie inguinale opérée");
  await admit("abega", "CHIRURGIE", 3, surgeon, "Appendicectomie");
  await admit("essomba", "MATERNITE", 1, gyn, "Accouchement");

  const nursingTasks = [
    ["Prise des constantes", "08:00", "COMPLETED", nurse1], ["Administration du traitement du matin", "08:30", "COMPLETED", nurse1],
    ["Pansement / surveillance", "11:00", "PENDING", nurse1], ["Administration du traitement du midi", "13:00", "PENDING", nurse1],
    ["Prise des constantes", "18:00", "PENDING", nurse2], ["Administration du traitement du soir", "20:00", "PENDING", nurse2],
  ];
  const treatments = {
    tchakounte: [["Furosémide", "40 mg IV", "matin et midi"], ["Bisoprolol", "2,5 mg", "1 par jour"]],
    atangana: [["Insuline rapide", "selon protocole", "avant chaque repas"], ["Amlodipine", "5 mg", "1 par jour"]],
    zang: [["Ceftriaxone", "1 g IV", "1 par jour"], ["Paracétamol", "1 g", "3 fois par jour"]],
    mballa: [["Tramadol", "50 mg", "3 fois par jour"], ["Paracétamol", "1 g", "4 fois par jour"]],
    abega: [["Ceftriaxone", "1 g IV", "1 par jour"], ["Métronidazole", "500 mg IV", "3 fois par jour"]],
    essomba: [["Fer + acide folique", "1 comprimé", "1 par jour"], ["Paracétamol", "1 g", "si douleur"]],
  };
  for (const [pk, h] of Object.entries(hospitalized)) {
    for (const [title, time, status, nurse] of nursingTasks) {
      const scheduledFor = at(0, time);
      const done = status === "COMPLETED" && scheduledFor < NOW;
      await prisma.careTask.create({
        data: { carePlanId: h.plan.id, caregiverId: nurse.caregiverProfile.id, title, scheduledFor, status: done ? "COMPLETED" : "PENDING", completedAt: done ? new Date(scheduledFor.getTime() + 20 * 60000) : null },
      });
    }
    for (const [name, dosage, frequency] of treatments[pk] ?? []) {
      await prisma.medication.create({ data: { carePlanId: h.plan.id, name, dosage, frequency } });
    }
  }

  // Ronde d'hier en médecine (clôturée) ; celle d'aujourd'hui reste à faire dans la vidéo.
  {
    const medPatients = Object.entries(hospitalized).filter(([, h]) => h.slot.ward.code === "MEDECINE" && h.admittedAt < at(-1, "09:00"));
    if (medPatients.length) {
      const round = track("RoundSession", await prisma.roundSession.create({
        data: { organizationId: clinicId, wardId: wards.MEDECINE.id, day: dayKey(-1), status: "CLOSED", participantIds: [doc.id, nurse1.id], startedById: doc.id, closedById: doc.id, closedAt: at(-1, "10:15"), createdAt: at(-1, "09:00") },
      }));
      const notes = {
        tchakounte: ["Dyspnée en amélioration, œdèmes des membres inférieurs en régression. Diurèse correcte.", "ADJUST", "Poursuivre le furosémide, contrôle de la kaliémie et de la créatinine demain."],
        atangana: ["Glycémies capillaires entre 1,8 et 2,4 g/L. Pas de signe de cétose.", "EXAMS", "Glycémie à jeun et créatininémie ; adaptation du schéma d'insuline."],
      };
      let position = 1;
      for (const [pk, h] of medPatients) {
        const [observations, decision, plan] = notes[pk] ?? ["État stable.", "CONTINUE", "Poursuite du traitement."];
        await prisma.roundEntry.create({
          data: { sessionId: round.id, patientId: P[pk].id, bedLabel: `${h.slot.room.name} · Lit ${h.slot.bed.label}`, roomName: h.slot.room.name, bedNumber: h.slot.bed.label, position: position++, status: "VISITED", observations, decision, plan, visitedAt: at(-1, `09:${String(position * 15).padStart(2, "0")}`), visitedById: doc.id },
        });
      }
    }
  }

  // --- Maternité ------------------------------------------------------------------------------
  {
    const pregnancies = [
      { pk: "ndongo", weeks: 22, g: 2, p: 1, risks: [] },
      { pk: "ngono", weeks: 31, g: 3, p: 2, risks: ["Antécédent de césarienne"] },
      { pk: "owona", weeks: 14, g: 1, p: 0, risks: [] },
      { pk: "fouda", weeks: 36, g: 2, p: 1, risks: ["Hypertension gravidique"] },
    ];
    for (const g of pregnancies) {
      const lmp = new Date(NOW.getTime() - g.weeks * 7 * DAY_MS);
      const preg = track("Pregnancy", await prisma.pregnancy.create({
        data: { patientId: P[g.pk].id, lastMenstrualPeriod: lmp, expectedDueDate: new Date(lmp.getTime() + 280 * DAY_MS), gravidity: g.g, parity: g.p, riskFactors: g.risks, status: "ACTIVE", createdById: gyn.id, createdAt: new Date(lmp.getTime() + 8 * 7 * DAY_MS) },
      }));
      for (let w = 12; w <= g.weeks; w += 6) {
        await prisma.prenatalVisit.create({
          data: {
            pregnancyId: preg.id, visitDate: new Date(lmp.getTime() + w * 7 * DAY_MS), gestationalWeeks: w, weightKg: 58 + w * 0.35,
            bloodPressureSystolic: g.risks.includes("Hypertension gravidique") && w > 28 ? 148 : between(105, 125), bloodPressureDiastolic: g.risks.includes("Hypertension gravidique") && w > 28 ? 95 : between(65, 80),
            fundalHeightCm: w > 18 ? w - 2 : null, fetalHeartRateBpm: w > 14 ? between(130, 155) : null,
            notes: w > 28 && g.risks.length ? "Surveillance rapprochée, bilan prescrit." : "Grossesse évolutive, RAS.", recordedById: pick([gyn, midwife]).id,
          },
        });
      }
    }
    // Accouchement d'hier : mère hospitalisée en maternité.
    const lmp = new Date(NOW.getTime() - 39 * 7 * DAY_MS);
    const preg = track("Pregnancy", await prisma.pregnancy.create({
      data: { patientId: P.essomba.id, lastMenstrualPeriod: lmp, expectedDueDate: new Date(lmp.getTime() + 280 * DAY_MS), gravidity: 1, parity: 0, status: "DELIVERED", createdById: gyn.id, createdAt: new Date(lmp.getTime() + 10 * 7 * DAY_MS) },
    }));
    for (const w of [12, 22, 32, 37]) {
      await prisma.prenatalVisit.create({ data: { pregnancyId: preg.id, visitDate: new Date(lmp.getTime() + w * 7 * DAY_MS), gestationalWeeks: w, weightKg: 55 + w * 0.3, bloodPressureSystolic: 112, bloodPressureDiastolic: 72, fundalHeightCm: w > 18 ? w - 2 : null, fetalHeartRateBpm: w > 14 ? 142 : null, notes: "RAS.", recordedById: midwife.id } });
    }
    const delivery = await prisma.delivery.create({
      data: { pregnancyId: preg.id, deliveredAt: at(-1, "04:40"), mode: "VAGINAL", complications: [], notes: "Accouchement eutocique, délivrance complète, saignement normal.", recordedById: midwife.id },
    });
    await prisma.newborn.create({ data: { deliveryId: delivery.id, sex: "F", weightGrams: 3250, apgarScore1: 8, apgarScore5: 10, vitalStatus: "LIVE_BIRTH", notes: "Mise au sein précoce." } });
  }

  // --- Bloc opératoire ------------------------------------------------------------------------
  const operatingRooms = [];
  for (const name of ["Salle d'opération 1", "Salle d'opération 2"]) {
    let room = await prisma.operatingRoom.findUnique({ where: { organizationId_name: { organizationId: clinicId, name } } });
    if (!room) room = track("OperatingRoom", await prisma.operatingRoom.create({ data: { organizationId: clinicId, name } }));
    operatingRooms.push(room);
  }
  const fullPhase = (phase, by, when) => {
    const keys = {
      SIGN_IN: ["identity", "procedure_site", "site_marked", "consent", "anesthesia_check", "oximeter", "allergies", "airway", "blood"],
      TIME_OUT: ["team", "confirm", "critical_events", "sterility", "antibiotics", "imaging"],
      SIGN_OUT: ["procedure_recorded", "counts", "specimens", "equipment", "recovery"],
    }[phase];
    const na = new Set(["imaging", "specimens", "equipment", "blood"]);
    return { answers: Object.fromEntries(keys.map((k) => [k, na.has(k) ? "NA" : "YES"])), notes: null, checkedById: by.id, checkedAt: when.toISOString() };
  };
  async function surgery(pk, room, procedure, start, minutes, status, extra = {}) {
    const end = new Date(start.getTime() + minutes * 60000);
    const items = [svc(`Bloc opératoire : ${procedure}`, extra.fee)];
    const inv = await invoice({ patient: P[pk], items, createdBy: surgeon, createdAt: new Date(start.getTime() - 2 * DAY_MS), payments: extra.paid ? [payAt(extra.paidDay, "10:00", extra.fee)] : [] });
    const checklist = {};
    if (["IN_PROGRESS", "COMPLETED"].includes(status)) {
      checklist.SIGN_IN = fullPhase("SIGN_IN", anesth, new Date(start.getTime() - 15 * 60000));
      checklist.TIME_OUT = fullPhase("TIME_OUT", nurse2, new Date(start.getTime() - 3 * 60000));
    }
    if (status === "COMPLETED") checklist.SIGN_OUT = fullPhase("SIGN_OUT", nurse2, new Date(end.getTime() - 5 * 60000));
    return track("SurgeryCase", await prisma.surgeryCase.create({
      data: {
        organizationId: clinicId, patientId: P[pk].id, operatingRoomId: room.id, procedure, indication: extra.indication ?? null, laterality: extra.laterality ?? "NA",
        anesthesiaType: extra.anesthesia ?? "GENERAL", priority: "SCHEDULED", scheduledStart: start, scheduledEnd: end, surgeonId: surgeon.id, anesthetistId: anesth.id, scrubNurseId: nurse2.id,
        fee: extra.fee, pendingInvoiceId: inv.id, status, checklist: Object.keys(checklist).length ? checklist : undefined,
        actualStart: ["IN_PROGRESS", "COMPLETED"].includes(status) ? start : null, actualEnd: status === "COMPLETED" ? end : null,
        operativeReport: status === "COMPLETED" ? extra.report : null, complications: status === "COMPLETED" ? "Aucune" : null, postOpInstructions: status === "COMPLETED" ? extra.postOp : null,
        reportedById: status === "COMPLETED" ? surgeon.id : null, reportedAt: status === "COMPLETED" ? new Date(end.getTime() + 20 * 60000) : null,
        createdById: surgeon.id, createdAt: new Date(start.getTime() - 2 * DAY_MS),
      },
    }));
  }
  await surgery("abega", operatingRooms[0], "Appendicectomie", at(-3, "08:00"), 60, "COMPLETED", {
    fee: 250000, paid: true, paidDay: -3, indication: "Appendicite aiguë", report: "Incision de Mac Burney. Appendice inflammatoire non perforé, appendicectomie avec enfouissement du moignon. Fermeture plan par plan.", postOp: "Antibiothérapie 48 h, lever précoce, reprise alimentaire progressive.",
  });
  await surgery("mballa", operatingRooms[0], "Cure de hernie inguinale", at(-1, "08:30"), 75, "COMPLETED", {
    fee: 200000, laterality: "RIGHT", anesthesia: "LOCOREGIONAL", indication: "Hernie inguinale droite symptomatique", report: "Abord inguinal droit. Hernie oblique externe, réintégration du sac, plastie selon Lichtenstein avec plaque. Hémostase soigneuse.", postOp: "Antalgiques, pas de port de charges lourdes pendant 4 semaines.",
  });
  await surgery("nana", operatingRooms[0], "Cholécystectomie", minutesAgo(40), 90, "IN_PROGRESS", { fee: 350000, paid: true, paidDay: -1, indication: "Lithiase vésiculaire symptomatique" });
  await surgery("ngando", operatingRooms[1], "Exérèse d'un lipome de l'épaule", at(0, "15:00"), 45, "SCHEDULED", { fee: 120000, laterality: "LEFT", anesthesia: "LOCAL", indication: "Lipome gênant de l'épaule gauche" });
  await surgery("djomo", operatingRooms[0], "Adénomectomie prostatique", at(1, "08:00"), 120, "SCHEDULED", { fee: 450000, indication: "Hypertrophie bénigne de la prostate compliquée", anesthesia: "LOCOREGIONAL" });

  // --- Banque de sang -------------------------------------------------------------------------
  {
    const units = [];
    const groups = [["O", "POS", 5], ["O", "NEG", 2], ["A", "POS", 3], ["A", "NEG", 1], ["B", "POS", 3], ["AB", "POS", 1]];
    let n = 1;
    for (const [abo, rh, count] of groups) {
      for (let i = 0; i < count; i++) {
        const expiresInDays = n === 3 ? 2 : n === 7 ? 4 : between(12, 35);
        units.push(track("BloodUnit", await prisma.bloodUnit.create({
          data: {
            organizationId: clinicId, unitNumber: `CNTS-${NOW.getUTCFullYear()}-${String(4100 + n).padStart(5, "0")}`, product: n % 5 === 0 ? "PLASMA" : "RBC", aboGroup: abo, rhesus: rh,
            volumeMl: n % 5 === 0 ? 220 : 280, collectedAt: new Date(NOW.getTime() - (35 - expiresInDays) * DAY_MS), expiresAt: new Date(NOW.getTime() + expiresInDays * DAY_MS),
            source: "CNTS Yaoundé", price: n % 5 === 0 ? 20000 : 25000, receivedById: labTech.id, createdAt: new Date(NOW.getTime() - between(3, 15) * DAY_MS),
          },
        })));
        n++;
      }
    }
    const discarded = track("BloodUnit", await prisma.bloodUnit.create({
      data: { organizationId: clinicId, unitNumber: `CNTS-${NOW.getUTCFullYear()}-04090`, product: "RBC", aboGroup: "A", rhesus: "POS", volumeMl: 280, expiresAt: at(-2, "23:59"), source: "CNTS Yaoundé", price: 25000, status: "DISCARDED", receivedById: labTech.id, discardReason: "Poche périmée", discardedById: labTech.id, discardedAt: at(-1, "08:00"), createdAt: at(-30, "10:00") },
    }));
    void discarded;

    // Transfusion terminée il y a 2 jours (anémie), et une poche réservée pour l'intervention de demain.
    const abegaUnit = units.find((u) => u.aboGroup === "B" && u.rhesus === "POS" && u.product === "RBC");
    await prisma.bloodUnit.update({ where: { id: abegaUnit.id }, data: { status: "TRANSFUSED" } });
    const transfusionItems = [svc(`Transfusion : Concentré de globules rouges (CGR) n° ${abegaUnit.unitNumber}`, abegaUnit.price)];
    const tInv = await invoice({ patient: P.abega, items: transfusionItems, createdBy: surgeon, createdAt: at(-2, "09:00"), payments: [payAt(-2, "12:00", abegaUnit.price)] });
    track("Transfusion", await prisma.transfusion.create({
      data: {
        organizationId: clinicId, patientId: P.abega.id, bloodUnitId: abegaUnit.id, indication: "Anémie post-opératoire (Hb 6,8 g/dL)", patientAboGroup: "B", patientRhesus: "POS",
        antibodyScreen: "NEGATIVE", crossmatch: "COMPATIBLE", requestedById: surgeon.id, status: "COMPLETED", bedsideCheckById: nurse1.id, startedAt: at(-2, "10:00"),
        preVitals: "TA 108/68, FC 96, T° 37,0 °C", endedAt: at(-2, "12:00"), completedById: nurse1.id, postVitals: "TA 116/72, FC 88, T° 37,1 °C", reaction: "NONE", pendingInvoiceId: tInv.id, createdAt: at(-2, "09:00"),
      },
    }));
    const djomoUnit = units.find((u) => u.aboGroup === "O" && u.rhesus === "POS" && u.product === "RBC" && u.status === "AVAILABLE");
    await prisma.bloodUnit.update({ where: { id: djomoUnit.id }, data: { status: "RESERVED" } });
    const rInv = await invoice({ patient: P.djomo, items: [svc(`Transfusion : Concentré de globules rouges (CGR) n° ${djomoUnit.unitNumber}`, djomoUnit.price)], createdBy: surgeon, createdAt: minutesAgo(90) });
    track("Transfusion", await prisma.transfusion.create({
      data: { organizationId: clinicId, patientId: P.djomo.id, bloodUnitId: djomoUnit.id, indication: "Réserve pour adénomectomie prostatique", patientAboGroup: "O", patientRhesus: "POS", antibodyScreen: "NEGATIVE", crossmatch: "COMPATIBLE", requestedById: surgeon.id, status: "RESERVED", pendingInvoiceId: rInv.id, createdAt: minutesAgo(90) },
    }));
  }

  // --- Qualité : incidents --------------------------------------------------------------------
  for (const [pk, title, description, priority, status, daysAgo] of [
    ["tchakounte", "Chute en chambre", "Patient retrouvé au sol à 3 h du matin en voulant se lever seul. Pas de traumatisme apparent, médecin de garde prévenu. Barrières de lit remontées.", "HIGH", "IN_PROGRESS", 2],
    ["zang", "Erreur de dose évitée", "Prescription de paracétamol 2 g interceptée par l'infirmière avant administration ; dose corrigée à 1 g avec le prescripteur.", "MEDIUM", "RESOLVED", 6],
    ["atangana", "Hypoglycémie à 0,52 g/L", "Malaise avec sueurs à 11 h. Resucrage oral, contrôle à 1,10 g/L 20 minutes après. Schéma d'insuline à revoir.", "HIGH", "OPEN", 0],
    ["kamdem", "Retard de prise en charge à l'accueil", "Attente de plus de 2 heures signalée par le patient. Analyse de l'organisation de la file à faire.", "LOW", "OPEN", 1],
  ]) {
    track("Incident", await prisma.incident.create({
      data: { patientId: P[pk].id, reportedById: nurse1.id, title, description, priority, status, createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS - 3 * 3600000) },
    }));
  }

  // --- Messagerie et notifications ------------------------------------------------------------
  {
    const channels = {};
    for (const name of ["urgences", "garde-nuit", "bloc-operatoire"]) {
      const existing = await prisma.conversation.findFirst({ where: { organizationId: clinicId, type: "CHANNEL", title: { equals: name, mode: "insensitive" } } });
      channels[name] = existing ?? track("Conversation", await prisma.conversation.create({ data: { title: name, type: "CHANNEL", organizationId: clinicId, createdById: coord.id } }));
    }
    const say = (channel, sender, content, minutes, sharedPatientId = null) =>
      prisma.message.create({ data: { conversationId: channels[channel].id, senderId: sender.id, content, sharedPatientId, createdAt: minutesAgo(minutes) } });
    await say("urgences", nurse1, "Patiente de 27 ans arrivée pour douleur thoracique, triée niveau 2. ECG et bilan demandés.", 45, P.eyenga.id);
    await say("urgences", doc, "Je la vois tout de suite. Préparez une voie veineuse et la saturation en continu.", 43);
    await say("urgences", nurse1, "Enfant drépanocytaire en crise, niveau 3. Antalgiques débutés selon protocole.", 30, P.biya.id);
    await say("garde-nuit", nurse2, "Nuit calme en médecine. M. Tchakounté a fait une chute à 3 h, pas de lésion, déclaration faite.", 2 * 24 * 60, P.tchakounte.id);
    await say("garde-nuit", doc, "Merci. Barrières de lit et surveillance renforcée cette nuit.", 2 * 24 * 60 - 30);
    await say("bloc-operatoire", surgeon, "Cholécystectomie de M. Nana en cours en salle 1. Exérèse de lipome de 15 h maintenue en salle 2.", 35);
    await say("bloc-operatoire", anesth, "Consultation pré-anesthésique de M. Djomo faite pour demain, 1 CGR O+ réservé.", 20, P.djomo.id);

    for (const [user, title, message, type, minutes] of [
      [coord, "Valeur critique au laboratoire", `Kaliémie à 6,9 mmol/L pour ${patientName("tchakounte")} : résultat à valider.`, "INCIDENT", 200],
      [coord, "Incident déclaré", `Hypoglycémie de ${patientName("atangana")} déclarée par l'équipe soignante.`, "INCIDENT", 120],
      [coord, "Stock bas", "Salbutamol et compresses stériles sont sous le seuil d'alerte.", "INFO", 300],
      [coord, "Produits bientôt périmés", "Test de diagnostic rapide paludisme et métronidazole périment dans moins de 30 jours.", "INFO", 600],
      [doc, "Rendez-vous du jour", "3 consultations prévues cet après-midi.", "APPOINTMENT", 180],
    ]) {
      track("Notification", await prisma.notification.create({ data: { userId: user.id, title, message, type, createdAt: minutesAgo(minutes) } }));
    }
  }

  // Modèle d'ordonnance partagé.
  track("PrescriptionTemplate", await prisma.prescriptionTemplate.create({
    data: {
      name: "Paludisme simple de l'adulte", pathology: "B54", createdById: doc.id, organizationId: clinicId, isShared: true,
      items: [
        { drugName: "Artéméther-Luméfantrine", dosage: "4 comprimés", frequency: "2 fois par jour", duration: "3 jours", instructions: "À prendre avec un repas" },
        { drugName: "Paracétamol", dosage: "1 g", frequency: "3 fois par jour", duration: "4 jours", instructions: "" },
      ],
    },
  }));

  // Comptage de fin de journée : petit écart certains jours, pour l'exemple.
  for (const s of Object.values(sessions)) {
    const expected = 50000 + s.cashIn - s.cashOut;
    const gap = s.day === -4 ? -2000 : s.day === -12 ? 500 : 0;
    await prisma.cashSession.update({
      where: { id: s.id },
      data: { countedAmount: expected + gap, notes: gap ? (gap < 0 ? "Écart constaté au comptage, signalé au coordinateur." : "Monnaie rendue en moins.") : null },
    });
  }

  await writeManifest(clinicId);

  const counts = Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.length]));
  console.log("Créés :", JSON.stringify(counts));
  console.log("\nComptes de démonstration (mot de passe commun = MOT_DE_PASSE_DEMO) :");
  for (const s of STAFF) console.log(`  ${s.role.padEnd(10)} ${s.firstName} ${s.lastName.padEnd(10)} ${s.email}`);
  console.log(`  PATIENT    ${patientName("zang").padEnd(21)} patiente.zang@${DEMO_DOMAIN}`);
  console.log(`  FAMILY     Brice Tchakounté      famille.tchakounte@${DEMO_DOMAIN}`);
}

function normalResult(name) {
  const table = {
    "NFS (numération formule sanguine)": { value: "Hb 13,2 g/dL ; GB 7 400/mm³ ; Plaquettes 245 000/mm³", unit: null, range: "Normes adultes" },
    Hémoglobine: { value: "12.8", unit: "g/dL", range: "12 - 16" },
    "Goutte épaisse": { value: "Positive — 1 200 trophozoïtes/µL (P. falciparum)", unit: null, range: "Négative", abnormal: true },
    "Glycémie à jeun": { value: "1.02", unit: "g/L", range: "0.70 - 1.10" },
    Créatininémie: { value: "9.8", unit: "mg/L", range: "7 - 13" },
    Urée: { value: "0.32", unit: "g/L", range: "0.15 - 0.45" },
    "Transaminases (ASAT/ALAT)": { value: "ASAT 28 ; ALAT 31", unit: "UI/L", range: "< 40" },
    CRP: { value: "4", unit: "mg/L", range: "< 6" },
    "Groupage sanguin ABO-Rhésus": { value: "O Rhésus positif", unit: null, range: null },
    "Sérodiagnostic de Widal": { value: "TO 1/80 ; TH 1/80", unit: null, range: "< 1/160" },
    ECBU: { value: "Leucocytes < 10/mm³, culture stérile", unit: null, range: "Stérile" },
    Kaliémie: { value: "4.1", unit: "mmol/L", range: "3.5 - 5.0" },
  };
  return table[name] ?? { value: "Normal", unit: null, range: null };
}

async function nextSequenceValue(key) {
  const res = await prisma.$runCommandRaw({ findAndModify: "Counter", query: { key }, update: { $inc: { value: 1 } }, upsert: true, new: true });
  const value = Number(res?.value?.value);
  if (!Number.isInteger(value) || value < 1) throw new Error(`Compteur ${key} illisible.`);
  return value;
}

main()
  .catch((error) => {
    console.error(`ÉCHEC : ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
