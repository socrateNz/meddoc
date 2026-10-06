import { pageFromParam } from "@/lib/pagination";
import type { PatientDependencyFilter, PatientSort, PatientStatusFilter } from "@/actions/patient-list";

// Lecture des filtres de la liste des patients depuis l'URL (?q, ?status, ?gir, ?allergies, ?sort, ?page).
// Une valeur inconnue retombe sur la valeur par défaut, jamais transmise telle quelle au serveur.
type RawParams = Record<string, string | string[] | undefined>;

const STATUSES = ["ALL", "ACTIVE", "DISCHARGED"] as const satisfies readonly PatientStatusFilter[];
const DEPENDENCIES = ["ALL", "HEAVY", "MODERATE", "AUTONOMOUS"] as const satisfies readonly PatientDependencyFilter[];
const SORTS = ["name-asc", "name-desc", "age-asc", "age-desc", "gir-asc", "gir-desc"] as const satisfies readonly PatientSort[];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function patientListOptions(params: RawParams) {
  return {
    page: pageFromParam(params.page),
    search: first(params.q),
    status: pick(first(params.status), STATUSES, "ALL"),
    dependency: pick(first(params.gir), DEPENDENCIES, "ALL"),
    allergiesOnly: first(params.allergies) === "1",
    sort: pick(first(params.sort), SORTS, "name-asc"),
  };
}

// Valeur de repli quand la requête échoue : la page reste affichable, sans patients.
export const EMPTY_PATIENT_PAGE = {
  data: [] as never[],
  total: 0,
  page: 1,
  pageSize: 20,
  counts: { active: 0, discharged: 0, allergies: 0, highDependency: 0 },
};
