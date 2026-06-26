import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration...');

  // 1. Find the clinic
  const clinic = await prisma.organization.findFirst({
    where: { type: 'CLINIC' }
  });

  if (!clinic) {
    console.log('No clinic found!');
    process.exit(1);
  }

  console.log(`Found clinic: ${clinic.name} (${clinic.id})`);

  const allUsers = await prisma.user.findMany({ select: { id: true, email: true, organizationId: true } });
  console.log("ALL USERS:", allUsers);

  const allPatients = await prisma.patient.findMany({ select: { id: true, organizationId: true } });
  console.log("ALL PATIENTS:", allPatients);

  // Instead of where: null, let's just update anyone who is NOT the holding admin
  // Wait, if organizationId is the holding ID, we don't want to move them.
  const holdingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN", organization: { type: "HOLDING" } }});
  
  if (holdingAdmin && clinic) {
    const usersToUpdate = allUsers.filter(u => u.organizationId !== holdingAdmin.organizationId);
    
    let count = 0;
    for (const u of usersToUpdate) {
      await prisma.user.update({ where: { id: u.id }, data: { organizationId: clinic.id }});
      count++;
    }
    console.log(`Updated ${count} users by filtering out holding admin.`);

    const patientsToUpdate = allPatients.filter(p => p.organizationId !== holdingAdmin.organizationId);
    let pCount = 0;
    for (const p of patientsToUpdate) {
      await prisma.patient.update({ where: { id: p.id }, data: { organizationId: clinic.id }});
      pCount++;
    }
    console.log(`Updated ${pCount} patients.`);
  }

  console.log('Migration complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
