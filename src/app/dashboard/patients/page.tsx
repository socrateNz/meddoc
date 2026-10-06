import { getCurrentUser } from "@/lib/auth";
import NewPatientDialog from "./new-patient-dialog";
import { getClinics } from "@/actions/organizations";
import { listPatientsPage } from "@/actions/patient-list";
import CacheWriter from "@/components/cache-writer";
import { keepQuery } from "@/components/ui/pagination-nav";
import { EMPTY_PATIENT_PAGE, patientListOptions } from "./patient-list-params";

import PatientTable from "./patient-table";

interface PatientsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PatientsPage({ searchParams }: PatientsPageProps) {
  const activeUser = await getCurrentUser();
  if (!activeUser) return null;

  const isHoldingAdmin = activeUser.role === "ADMIN" && activeUser.organization?.type === "HOLDING";

  // Utilisé par CacheWriter/loading.tsx pour l'aperçu instantané au prochain chargement —
  // cf. plan « Affichage instantané depuis un cache local ». Indépendant du mécanisme RxDB de
  // use-offline-patients.ts / patient-table.tsx (vrai mode hors-ligne recherchable) : ici, on ne
  // fait que rejouer la dernière liste vue pendant le rafraîchissement serveur.
  const cachedAt = new Date().toISOString();

  const params = await searchParams;

  // La liste des cliniques (pour le sélecteur holding) et la page de patients
  // sont indépendantes l'une de l'autre — un seul aller-retour réseau au lieu de deux.
  const [clinicsRes, patientsRes] = await Promise.all([
    isHoldingAdmin ? getClinics() : Promise.resolve({ clinics: [] as any[], error: null }),
    listPatientsPage(patientListOptions(params)),
  ]);
  const patientsPage = patientsRes.success ? patientsRes : EMPTY_PATIENT_PAGE;

  let clinics: { id: string; name: string }[] = [];
  if (isHoldingAdmin && clinicsRes.clinics) {
    clinics = clinicsRes.clinics.map(c => ({ id: c.id, name: c.name }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-up">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Patients</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez la liste de vos patients, filtrez par statut de soins et consultez leurs dossiers.
          </p>
        </div>
        {["COORDINATOR", "MEDECIN", "CAREGIVER"].includes(activeUser.role) && (
          <NewPatientDialog
            isHoldingAdmin={isHoldingAdmin}
            holdingId={activeUser.organizationId || ""}
            clinics={clinics}
          />
        )}
      </div>

      <PatientTable
        patients={patientsPage.data}
        total={patientsPage.total}
        page={patientsPage.page}
        pageSize={patientsPage.pageSize}
        counts={patientsPage.counts}
        query={keepQuery(params)}
        pathname="/dashboard/patients"
        organizationId={activeUser.organizationId || undefined}
      />

      <CacheWriter
        cacheKey={`patients-list:${activeUser.organizationId ?? "none"}`}
        updatedAt={cachedAt}
        routeFamily="patients-list"
        contextHint={{ organizationId: activeUser.organizationId ?? "none" }}
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
