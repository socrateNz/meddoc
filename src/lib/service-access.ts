import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Cloisonnement par service (Médecine, Ophtalmologie, Maternité...) : un médecin ou un infirmier
// rattaché à des services (User.serviceIds) ne voit que les dossiers de ces services
// (Patient.serviceId). Restent communs à tous :
// - les dossiers sans service (antérieurs à la mise en place des services) ;
// - le personnel sans service (comportement historique) ou rattaché à un service transversal
//   (laboratoire, imagerie, urgences : il travaille pour tous les autres) ;
// - la direction (coordinateur, admin de holding), qui supervise toute la clinique.
// Les autres rôles (accueil, pharmacie, caisse, labo, comptabilité) n'ouvrent pas de dossier
// médical : leur accès est déjà réglé par rôle (src/lib/staff-roles.ts).
export const SERVICE_RESTRICTED_ROLES = ["MEDECIN", "CAREGIVER"];

type ServiceUser = { id?: string; role: string; serviceIds?: string[] | null };

// Services visibles par l'utilisateur, ou null s'il n'est pas restreint.
export async function restrictedServiceIds(user: ServiceUser): Promise<string[] | null> {
  if (!SERVICE_RESTRICTED_ROLES.includes(user.role)) return null;
  const ids = user.serviceIds ?? [];
  if (ids.length === 0) return null;
  const transversal = await prisma.clinicService.count({ where: { id: { in: ids }, isTransversal: true } });
  return transversal > 0 ? null : ids;
}

// Filtre Prisma des patients visibles pour une liste de services (null = aucun filtre).
// « Sans service » couvre le champ absent (dossiers antérieurs) comme une valeur nulle.
export function patientServiceWhere(serviceIds: string[] | null): Prisma.PatientWhereInput {
  if (!serviceIds) return {};
  return { OR: [{ serviceId: { isSet: false } }, { serviceId: null }, { serviceId: { in: serviceIds } }] };
}

// Patients de la clinique suivis par un AUTRE service que ceux de l'utilisateur — pour les listes
// dont le modèle n'a pas de relation Prisma vers Patient (imagerie, urgences, bloc, transfusions) :
// on les exclut par `patientId: { notIn }`. Liste vide si l'utilisateur n'est pas restreint.
export async function hiddenPatientIds(clinicId: string, serviceIds: string[] | null): Promise<string[]> {
  if (!serviceIds) return [];
  const hidden = await prisma.patient.findMany({
    where: { organizationId: clinicId, AND: [{ serviceId: { not: null } }, { serviceId: { notIn: serviceIds } }] },
    select: { id: true },
  });
  return hidden.map((p) => p.id);
}

export function canSeePatientService(serviceIds: string[] | null, patientServiceId: string | null | undefined): boolean {
  return !serviceIds || !patientServiceId || serviceIds.includes(patientServiceId);
}

export const SERVICE_ACCESS_DENIED = "Non autorisé. Ce dossier est suivi par un autre service : demandez son transfert.";
