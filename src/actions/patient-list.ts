"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { resolvePage } from "@/lib/pagination";
import { assertClinicScope } from "@/lib/clinic-scope";

export type PatientStatusFilter = "ALL" | "ACTIVE" | "DISCHARGED";
export type PatientDependencyFilter = "ALL" | "HEAVY" | "MODERATE" | "AUTONOMOUS";
export type PatientSort = "name-asc" | "name-desc" | "age-asc" | "age-desc" | "gir-asc" | "gir-desc";

type PatientListOptions = {
  organizationId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PatientStatusFilter;
  dependency?: PatientDependencyFilter;
  allergiesOnly?: boolean;
  sort?: PatientSort;
};

// Un patient est sorti si son statut est DISCHARGED, ou si toutes ses prises en charge sont closes
// (il a des plans de soins, et aucun n'est ACTIVE). Même règle que checkIsDischarged côté client.
const DISCHARGED_CLAUSE: Prisma.PatientWhereInput = {
  OR: [
    { status: "DISCHARGED" },
    { AND: [{ carePlans: { some: {} } }, { carePlans: { none: { status: "ACTIVE" } } }] },
  ],
};
const ACTIVE_CLAUSE: Prisma.PatientWhereInput = {
  AND: [
    { status: { not: "DISCHARGED" } },
    { OR: [{ carePlans: { none: {} } }, { carePlans: { some: { status: "ACTIVE" } } }] },
  ],
};

const DEPENDENCY_CLAUSES: Record<Exclude<PatientDependencyFilter, "ALL">, Prisma.PatientWhereInput> = {
  HEAVY: { dependencyLevel: { lte: 2 } },
  MODERATE: { dependencyLevel: { gte: 3, lte: 4 } },
  AUTONOMOUS: { dependencyLevel: { gte: 5 } },
};

function sortOrder(sort: PatientSort | undefined): Prisma.PatientOrderByWithRelationInput[] {
  switch (sort) {
    case "name-desc":
      return [{ user: { lastName: "desc" } }];
    case "age-asc":
      // Plus jeune d'abord = date de naissance la plus récente d'abord.
      return [{ dateOfBirth: "desc" }, { user: { lastName: "asc" } }];
    case "age-desc":
      return [{ dateOfBirth: "asc" }, { user: { lastName: "asc" } }];
    case "gir-asc":
      return [{ dependencyLevel: "asc" }, { user: { lastName: "asc" } }];
    case "gir-desc":
      return [{ dependencyLevel: "desc" }, { user: { lastName: "asc" } }];
    default:
      return [{ user: { lastName: "asc" } }];
  }
}

// Liste paginée des patients (20 par page au plus) avec recherche, filtres et tri appliqués en base.
// Les compteurs du tableau (actifs, sortis, allergiques, dépendance lourde) portent sur tout le
// périmètre, pas sur la page ou les filtres affichés.
export async function listPatientsPage(options?: PatientListOptions) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");

    const scope: Prisma.PatientWhereInput[] = [];
    if (options?.organizationId) {
      await assertClinicScope(options.organizationId, activeUser);
      scope.push({ organizationId: options.organizationId });
    } else if (activeUser.organization?.type === "HOLDING") {
      scope.push({
        OR: [
          { organizationId: activeUser.organizationId },
          { organization: { parentId: activeUser.organizationId } },
        ],
      });
    } else if (activeUser.organization?.type === "CLINIC") {
      scope.push({ organizationId: activeUser.organizationId });
    } else {
      // Tableau `in` vide : ne matche jamais, sans faire planter Prisma sur un ObjectId invalide.
      scope.push({ organizationId: { in: [] } });
    }

    const conditions = [...scope];
    if (options?.status === "ACTIVE") conditions.push(ACTIVE_CLAUSE);
    if (options?.status === "DISCHARGED") conditions.push(DISCHARGED_CLAUSE);
    if (options?.dependency && options.dependency !== "ALL") conditions.push(DEPENDENCY_CLAUSES[options.dependency]);
    if (options?.allergiesOnly) conditions.push({ allergies: { isEmpty: false } });

    // Recherche : nom, e-mail, téléphone, groupe sanguin. Les pathologies et allergies (listes de
    // texte) ne se recherchent pas par sous-chaîne en base : elles ne sont pas incluses ici.
    const term = options?.search?.trim();
    if (term) {
      conditions.push({
        OR: [
          { user: { firstName: { contains: term, mode: "insensitive" } } },
          { user: { lastName: { contains: term, mode: "insensitive" } } },
          { user: { email: { contains: term, mode: "insensitive" } } },
          { user: { phone: { contains: term, mode: "insensitive" } } },
          { bloodType: { contains: term, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.PatientWhereInput = { AND: conditions };
    const { page, pageSize, skip, take } = resolvePage(options);

    const [patients, total, active, discharged, allergies, highDependency] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: {
          user: true,
          bed: { select: { id: true, label: true, room: { select: { name: true } } } },
          carePlans: { select: { id: true, status: true } },
          vitalSigns: { take: 1, orderBy: { createdAt: "desc" } },
          appointments: { take: 1, where: { scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: "asc" } },
        },
        orderBy: sortOrder(options?.sort),
        skip,
        take,
      }),
      prisma.patient.count({ where }),
      prisma.patient.count({ where: { AND: [...scope, ACTIVE_CLAUSE] } }),
      prisma.patient.count({ where: { AND: [...scope, DISCHARGED_CLAUSE] } }),
      prisma.patient.count({ where: { AND: [...scope, { allergies: { isEmpty: false } }] } }),
      prisma.patient.count({ where: { AND: [...scope, { dependencyLevel: { lte: 3 } }] } }),
    ]);

    return {
      success: true as const,
      data: patients,
      total,
      page,
      pageSize,
      counts: { active, discharged, allergies, highDependency },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des patients.") };
  }
}
