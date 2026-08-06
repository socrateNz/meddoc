import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== ORGANIZATIONS ===');
  const orgs = await prisma.organization.findMany();
  console.log(JSON.stringify(orgs, null, 2));

  console.log('=== ALL USERS ===');
  const users = await prisma.user.findMany({
    include: {
      organization: true,
      patientProfile: true,
      caregiverProfile: true,
      coordinatorProfile: true,
      familyProfile: true,
    }
  });

  const formattedUsers = users.map(u => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    phone: u.phone,
    isActive: u.isActive,
    organizationName: u.organization?.name || 'SuperAdmin / Global',
    organizationType: u.organization?.type || 'N/A',
    organizationId: u.organizationId
  }));

  console.log(JSON.stringify(formattedUsers, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
