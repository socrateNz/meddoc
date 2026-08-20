import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Seed (idempotent, upsert-only) des permissions par défaut. Ne touche à aucune
// autre collection — safe à relancer à tout moment, y compris en production.
//
// Volontairement réduit à MANAGE_STOCK et MANAGE_CONTRACTS : un audit du code a montré que
// ce sont les deux SEULES permissions réellement reliées à un contrôle d'accès (via
// requirePermission dans src/actions/stock.ts et src/actions/contracts.ts). Les 10 autres
// entrées historiques (ACCESS_ALL, MANAGE_PATIENTS, MANAGE_CAREGIVERS, MANAGE_APPOINTMENTS,
// REPORT_INCIDENTS, RESOLVE_INCIDENTS, RUN_AI_ANALYSIS, VIEW_REPORTS, VIEW_AUDIT_LOG,
// MANAGE_PERMISSIONS) apparaissaient sur /dashboard/permissions et pouvaient être décochées
// par un ADMIN sans le moindre effet réel — un faux sentiment de contrôle plutôt qu'un bug
// silencieux. Elles sont supprimées ci-dessous plutôt que laissées dans l'écran.
const permissionsList: { name: string; description: string; roles: Role[] }[] = [
  // Corrige une divergence avec l'enforcement réel dans src/actions/stock.ts (STOCK_WRITE_ROLES =
  // COORDINATOR/PHARMACIST, ADMIN y est en lecture seule) — PHARMACIST échouait silencieusement ici.
  { name: 'MANAGE_STOCK', description: "Enregistrer des achats de pharmacie et réaliser l'inventaire", roles: [Role.COORDINATOR, Role.PHARMACIST] },
  { name: 'MANAGE_CONTRACTS', description: 'Créer et gérer les contrats des aidants', roles: [Role.ADMIN, Role.COORDINATOR] },
];

// Noms historiques sans enforcement réel — supprimés s'ils existent encore en base
// (déploiements déjà seedés avant cet audit).
const DEAD_PERMISSION_NAMES = [
  'ACCESS_ALL', 'MANAGE_PATIENTS', 'MANAGE_CAREGIVERS', 'MANAGE_APPOINTMENTS',
  'REPORT_INCIDENTS', 'RESOLVE_INCIDENTS', 'RUN_AI_ANALYSIS', 'VIEW_REPORTS',
  'VIEW_AUDIT_LOG', 'MANAGE_PERMISSIONS',
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

  const { count } = await prisma.permission.deleteMany({ where: { name: { in: DEAD_PERMISSION_NAMES } } });
  if (count > 0) console.log(`  ✓ ${count} permission(s) historique(s) sans effet réel supprimée(s).`);

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
