import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Seed (idempotent, upsert-only) des permissions par défaut. Ne touche à aucune
// autre collection — safe à relancer à tout moment, y compris en production.
const permissionsList: { name: string; description: string; roles: Role[] }[] = [
  { name: 'ACCESS_ALL', description: 'Accès complet au système', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'MANAGE_PATIENTS', description: 'Créer, modifier et supprimer des patients', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'MANAGE_CAREGIVERS', description: 'Gérer les soignants et affectations', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'MANAGE_APPOINTMENTS', description: 'Planifier des rendez-vous', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'REPORT_INCIDENTS', description: 'Déclarer des incidents', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'RESOLVE_INCIDENTS', description: 'Traiter et résoudre des incidents', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'RUN_AI_ANALYSIS', description: 'Lancer des analyses cliniques IA', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'VIEW_REPORTS', description: 'Visualiser les rapports et statistiques', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'MANAGE_STOCK', description: "Enregistrer des achats de pharmacie et réaliser l'inventaire", roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'MANAGE_CONTRACTS', description: 'Créer et gérer les contrats des aidants', roles: [Role.ADMIN, Role.COORDINATOR] },
  { name: 'VIEW_AUDIT_LOG', description: "Consulter le journal d'audit", roles: [Role.ADMIN] },
  { name: 'MANAGE_PERMISSIONS', description: 'Modifier les permissions par rôle', roles: [Role.ADMIN] },
];

async function main() {
  console.log('Seeding default permissions...');

  for (const perm of permissionsList) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: {
        name: perm.name,
        description: perm.description,
        roles: perm.roles,
      },
    });
    console.log(`  ✓ ${perm.name}`);
  }

  console.log(`Done. ${permissionsList.length} permissions ensured.`);
}

main()
  .catch((e) => {
    console.error('Error seeding permissions:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
