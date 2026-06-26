import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial Super Admin...');

  const superAdminEmail = 'superadmin@meddoc.com';
  
  // Check if it already exists
  const existingSuperAdmin = await prisma.user.findUnique({
    where: { email: superAdminEmail }
  });

  if (existingSuperAdmin) {
    console.log(`Super Admin ${superAdminEmail} already exists.`);
    return;
  }

  const hashedPassword = await bcrypt.hash('superadmin123', 10);

  const superAdmin = await prisma.user.create({
    data: {
      email: superAdminEmail,
      firstName: 'System',
      lastName: 'SuperAdmin',
      passwordHash: hashedPassword,
      role: Role.SUPER_ADMIN,
      isActive: true,
      requiresPasswordChange: false,
      organizationId: null, // System-level user has no organization
    }
  });

  console.log(`Successfully created Super Admin: ${superAdmin.email}`);
  console.log('Password is: superadmin123');
}

main()
  .catch((e) => {
    console.error('Error seeding Super Admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
