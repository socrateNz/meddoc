import { Role, Priority, IncidentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Seed Permissions
  const permissionsList = [
    { name: 'ACCESS_ALL', description: 'Accès complet au système' },
    { name: 'MANAGE_PATIENTS', description: 'Créer, modifier et supprimer des patients' },
    { name: 'MANAGE_CAREGIVERS', description: 'Gérer les soignants et affectations' },
    { name: 'MANAGE_APPOINTMENTS', description: 'Planifier des rendez-vous' },
    { name: 'REPORT_INCIDENTS', description: 'Déclarer des incidents' },
    { name: 'RESOLVE_INCIDENTS', description: 'Traiter et résoudre des incidents' },
    { name: 'RUN_AI_ANALYSIS', description: 'Lancer des analyses cliniques IA' },
    { name: 'VIEW_REPORTS', description: 'Visualiser les rapports et statistiques' },
  ];

  for (const perm of permissionsList) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: {
        name: perm.name,
        description: perm.description,
        roles: [Role.ADMIN, Role.COORDINATOR],
      },
    });
  }

  // 2. Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@meddoc.com' },
    update: {},
    create: {
      email: 'admin@meddoc.com',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'System',
      role: Role.ADMIN,
    },
  });

  // 3. Coordinator User & Profile
  const coordUser = await prisma.user.upsert({
    where: { email: 'coord@meddoc.com' },
    update: {},
    create: {
      email: 'coord@meddoc.com',
      passwordHash: hashedPassword,
      firstName: 'Sophie',
      lastName: 'Martin',
      role: Role.COORDINATOR,
      coordinatorProfile: {
        create: {}
      }
    },
    include: { coordinatorProfile: true }
  });

  // 4. Caregiver User & Profile
  const caregiverUser = await prisma.user.upsert({
    where: { email: 'caregiver@meddoc.com' },
    update: {},
    create: {
      email: 'caregiver@meddoc.com',
      passwordHash: hashedPassword,
      firstName: 'Jean',
      lastName: 'Dupont',
      role: Role.CAREGIVER,
      caregiverProfile: {
        create: {
          specialties: ['Gériatrie', 'Soins Palliatifs', 'Aide à la mobilité'],
          certifications: ['DEAS - Diplôme d\'État d\'Aide-Soignant'],
          isAvailable: true,
        }
      }
    },
    include: { caregiverProfile: true }
  });

  // 5. Patient User, Profile & clinical data
  const patientUser = await prisma.user.upsert({
    where: { email: 'patient@meddoc.com' },
    update: {},
    create: {
      email: 'patient@meddoc.com',
      passwordHash: hashedPassword,
      firstName: 'Alice',
      lastName: 'Dubois',
      role: Role.PATIENT,
      patientProfile: {
        create: {
          dateOfBirth: new Date('1945-05-15'),
          address: '45 Rue de la Paix, 75002 Paris',
          emergencyContact: 'Pierre Dubois (Fils) - 0612345678',
          dependencyLevel: 4,
          pathologies: ['Diabète Type 2', 'Hypertension Artérielle', 'Insuffisance Cardiaque'],
          allergies: ['Pénicilline'],
        }
      }
    },
    include: { patientProfile: true }
  });

  const patientProfile = patientUser.patientProfile!;
  const caregiverProfile = caregiverUser.caregiverProfile!;
  const coordinatorProfile = coordUser.coordinatorProfile!;

  // 6. Family Member
  const familyUser = await prisma.user.upsert({
    where: { email: 'family@meddoc.com' },
    update: {},
    create: {
      email: 'family@meddoc.com',
      passwordHash: hashedPassword,
      firstName: 'Pierre',
      lastName: 'Dubois',
      role: Role.FAMILY,
      familyProfile: {
        create: {
          patientId: patientProfile.id,
          relationship: 'Fils',
        }
      }
    }
  });

  // 7. Contract
  await prisma.contract.create({
    data: {
      patientId: patientProfile.id,
      caregiverId: caregiverProfile.id,
      title: 'Contrat d\'accompagnement gériatrique - Alice Dubois',
      status: 'ACTIVE',
      startDate: new Date(),
      hourlyRate: 25.5,
      hoursPerWeek: 15,
    }
  });

  // 8. Care Plan & Tasks & Medications
  const carePlan = await prisma.carePlan.create({
    data: {
      patientId: patientProfile.id,
      coordinatorId: coordinatorProfile.id,
      title: 'Plan de soins global - Stabilisation Cardio-Vasculaire',
      startDate: new Date(),
      status: 'ACTIVE',
      medications: {
        create: [
          { name: 'Kardegic 75mg', dosage: '1 sachet', frequency: 'Matin', instructions: 'Pendant le repas' },
          { name: 'Metoprolol 50mg', dosage: '1/2 comprimé', frequency: 'Matin et Soir', instructions: 'Vérifier la tension artérielle avant administration' },
        ]
      },
      tasks: {
        create: [
          {
            title: 'Aide à la toilette et habillage',
            description: 'Accompagnement doux le matin',
            scheduledFor: new Date(new Date().setHours(8, 30, 0, 0)),
            caregiverId: caregiverProfile.id,
          },
          {
            title: 'Contrôle de la glycémie',
            description: 'Vérifier avant le repas du midi',
            scheduledFor: new Date(new Date().setHours(11, 45, 0, 0)),
            caregiverId: caregiverProfile.id,
          }
        ]
      }
    }
  });

  // 9. Incidents
  await prisma.incident.create({
    data: {
      patientId: patientProfile.id,
      reportedById: caregiverUser.id,
      title: 'Hausse de tension constatée',
      description: 'Tension mesurée à 165/95 mmHg à 8h30. Patient légèrement désorienté mais pas de douleur thoracique signalée. Le traitement de réserve a été administré.',
      priority: Priority.HIGH,
      status: IncidentStatus.OPEN,
    }
  });

  // 10. Medical Record
  await prisma.medicalRecord.create({
    data: {
      patientId: patientProfile.id,
      title: 'Compte-rendu de consultation cardiologique',
      description: 'Consultation annuelle chez le Dr. Lemoine. Insuffisance cardiaque stable. Fraction d\'éjection mesurée à 45%. Poursuivre le traitement actuel avec Metoprolol.',
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
