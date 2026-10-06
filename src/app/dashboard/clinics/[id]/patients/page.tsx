import { getCurrentUser } from "@/lib/auth";
import { getClinics } from "@/actions/organizations";
import { listPatientsPage } from "@/actions/patient-list";
import CacheWriter from "@/components/cache-writer";
import { keepQuery } from "@/components/ui/pagination-nav";
import NewPatientDialog from "@/app/dashboard/patients/new-patient-dialog";
import { EMPTY_PATIENT_PAGE, patientListOptions } from "@/app/dashboard/patients/patient-list-params";

import PatientTable from "@/app/dashboard/patients/patient-table";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClinicPatientsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const clinicId = resolvedParams.id;

  // Utilisé par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ». Indépendant du mécanisme RxDB de
  // use-offline-patients.ts / patient-table.tsx (vrai mode hors-ligne recherchable) : ici, on ne
  // fait que rejouer la dernière liste vue pendant le rafraîchissement serveur.
  const cachedAt = new Date().toISOString();

  const activeUser = await getCurrentUser();
  if (!activeUser) return null;

  const isHoldingAdmin = activeUser.role === "ADMIN" && activeUser.organization?.type === "HOLDING";
  const query = await searchParams;

  // Périmètre de la clinique contrôlé dans listPatientsPage (même contrôle que le layout de clinique).
  const [clinicsRes, patientsRes] = await Promise.all([
    isHoldingAdmin ? getClinics() : Promise.resolve(null),
    listPatientsPage({ ...patientListOptions(query), organizationId: clinicId }),
  ]);
  const patientsPage = patientsRes.success ? patientsRes : EMPTY_PATIENT_PAGE;

  let clinics: { id: string; name: string }[] = [];
  if (isHoldingAdmin && clinicsRes?.clinics) {
    clinics = clinicsRes.clinics.map(c => ({ id: c.id, name: c.name }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-up">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Patients</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez la liste des patients, leurs statuts (actifs / clôturés) et leurs dossiers pour cette clinique.
          </p>
        </div>
        {["COORDINATOR", "MEDECIN", "CAREGIVER"].includes(activeUser.role) && (
          <NewPatientDialog
            isHoldingAdmin={isHoldingAdmin}
            holdingId={activeUser.organizationId || ""}
            clinics={clinics}
            defaultOrganizationId={clinicId}
          />
        )}
      </div>

      <PatientTable
        patients={patientsPage.data}
        total={patientsPage.total}
        page={patientsPage.page}
        pageSize={patientsPage.pageSize}
        counts={patientsPage.counts}
        query={keepQuery(query)}
        pathname={`/dashboard/clinics/${clinicId}/patients`}
        clinicId={clinicId}
        organizationId={clinicId}
        canAssignBed={["COORDINATOR", "MEDECIN", "CAREGIVER"].includes(activeUser.role)}
      />

      <CacheWriter
        cacheKey={`patients-list:${clinicId}`}
        updatedAt={cachedAt}
        data={{
          totalCount: patientsPage.total,
          patients: patientsPage.data.slice(0, 30).map((p) => ({
            id: p.id,
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            status: p.status,
            dependencyLevel: p.dependencyLevel,
          })),
        }}
      />
    </div>
  );
}
