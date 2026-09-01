"use client";

// Aperçu partagé "dernière vue" pour la fiche patient — lu par les deux `loading.tsx` jumeaux
// (`/dashboard/patients/[id]` et `/dashboard/clinics/[id]/patients/[patientId]`), au même titre
// que `maternity-panel.tsx` est déjà partagé entre les deux `page.tsx` correspondants (cf. plan
// « Affichage instantané depuis un cache local »).
//
// Ne représente jamais l'arbre clinique complet : uniquement les champs scalaires + compteurs
// par onglet écrits par <CacheWriter> dans les deux page.tsx (jamais patient.medicalRecords,
// carePlans, etc. bruts). Strictement non interactif — décoratif, remplacé automatiquement par
// le vrai Server Component dès qu'il a fini de charger.

import { User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface PharmacistPatientPreview {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO
}

export interface FullPatientPreview {
  firstName: string;
  lastName: string;
  sex: string | null;
  dateOfBirth: string; // ISO
  status: string;
  dependencyLevel: number;
  isDischarged: boolean;
  pathologiesCount: number;
  allergiesCount: number;
  medicalRecordsCount: number;
  prescriptionsCount: number;
  labOrdersCount: number;
  carePlansCount: number;
  incidentsCount: number;
  activeCarePlanTitle: string | null;
}

function calculateAge(dateOfBirthIso: string) {
  const birthDate = new Date(dateOfBirthIso);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function formatDate(dateOfBirthIso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(dateOfBirthIso));
}

function sexLabel(sex: string | null) {
  return sex === "M" ? "Homme" : sex === "F" ? "Femme" : sex || "Sexe non renseigné";
}

function UpdatingBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1.5">
      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      Mise à jour…
    </span>
  );
}

export function PharmacistPatientPreviewCard({ preview }: { preview: PharmacistPatientPreview }) {
  return (
    <div className="space-y-6 pointer-events-none select-none" aria-hidden="true" inert>
      <div className="rounded-2xl border bg-card text-card-foreground shadow-md overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
        <div className="p-6 md:p-8 flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <UserIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {preview.lastName} {preview.firstName}
            </h1>
            <p className="text-muted-foreground mt-1">
              {calculateAge(preview.dateOfBirth)} ans • Né(e) le {formatDate(preview.dateOfBirth)}
            </p>
            <UpdatingBadge />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FullPatientPreviewCard({ preview }: { preview: FullPatientPreview }) {
  const chips = [
    { label: "Dossier médical", count: preview.medicalRecordsCount },
    { label: "Ordonnances", count: preview.prescriptionsCount },
    { label: "Laboratoire", count: preview.labOrdersCount },
    { label: "Plan de soins", count: preview.carePlansCount },
    { label: "Incidents", count: preview.incidentsCount },
  ];

  return (
    <div className="space-y-6 pointer-events-none select-none" aria-hidden="true" inert>
      <div className="rounded-2xl border bg-card text-card-foreground shadow-md overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <UserIcon className="h-8 w-8 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  {preview.lastName} {preview.firstName}
                </h1>
                {preview.isDischarged ? (
                  <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-300 dark:text-slate-400 dark:border-slate-700">
                    Soins terminés / Sortie
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                    Soins en cours
                  </Badge>
                )}
                <Badge variant={preview.dependencyLevel > 3 ? "destructive" : "secondary"} className="h-5">
                  GIR {preview.dependencyLevel}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {calculateAge(preview.dateOfBirth)} ans • {sexLabel(preview.sex)} • Né(e) le {formatDate(preview.dateOfBirth)}
              </p>
              <UpdatingBadge />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {chips.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm flex items-center gap-2 shadow-sm">
            <span className="font-medium text-slate-600 dark:text-slate-300">{c.label}</span>
            <span className="font-bold text-primary">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
