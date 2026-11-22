"use client";

import CsvImportDialog from "@/components/csv-import-dialog";
import { importPatients } from "@/actions/patients";
import { normalizeKey, parseDateCell, parseListCell, parseNumberCell, type CsvColumn } from "@/lib/csv";

const COLUMNS: CsvColumn[] = [
  { key: "lastName", header: "Nom", aliases: ["nom de famille"], required: true },
  { key: "firstName", header: "Prénom", aliases: ["prenom", "prenoms"], required: true },
  { key: "dateOfBirth", header: "Date de naissance (JJ/MM/AAAA)", aliases: ["date de naissance", "naissance", "ne le"], required: true },
  { key: "sex", header: "Sexe (M/F)", aliases: ["sexe", "genre"] },
  { key: "phone", header: "Téléphone", aliases: ["telephone", "tel", "contact"] },
  { key: "address", header: "Adresse / Quartier", aliases: ["adresse", "quartier", "domicile"], required: true },
  { key: "email", header: "E-mail", aliases: ["email", "mail"] },
  { key: "emergencyContact", header: "Personne à prévenir", aliases: ["urgence", "personne a prevenir", "proche"] },
  { key: "service", header: "Service", aliases: ["service"] },
  { key: "pathologies", header: "Antécédents / pathologies", aliases: ["antecedents", "pathologies"] },
  { key: "allergies", header: "Allergies", aliases: ["allergie"] },
  { key: "dependencyLevel", header: "Niveau de dépendance (1-5)", aliases: ["dependance", "gir"] },
];

const SAMPLE_ROWS = [
  ["MBARGA", "Jean", "14/03/1985", "M", "+237 6XX XX XX XX", "Simbock", "", "Épouse : +237 6XX XX XX XX", "Médecine générale", "HTA", "Pénicilline", ""],
  ["NGONO", "Marie", "02/11/1998", "F", "+237 6XX XX XX XX", "Mendong", "", "", "Maternité", "", "", ""],
];

type Row = {
  lastName: string;
  firstName: string;
  dateOfBirth: string;
  sex?: "M" | "F" | "Autre";
  phone?: string;
  address: string;
  email?: string;
  emergencyContact?: string;
  serviceName?: string;
  pathologies: string[];
  allergies: string[];
  dependencyLevel: number;
};

function parseSex(raw: string): Row["sex"] | null | undefined {
  const k = normalizeKey(raw);
  if (!k) return undefined;
  if (["m", "h", "homme", "masculin", "male"].includes(k)) return "M";
  if (["f", "femme", "feminin", "female"].includes(k)) return "F";
  if (k === "autre") return "Autre";
  return null;
}

export default function PatientsImport({ clinicId }: { clinicId: string }) {
  return (
    <CsvImportDialog<Row>
      title="Importer des patients"
      itemLabel="patient"
      templateFileName="modele_import_patients.csv"
      maxRows={1000}
      description={
        <>
          Reprise de votre fichier patients : chaque ligne crée un dossier avec son IPP. Un patient déjà enregistré (mêmes nom, prénom et date de naissance)
          est ignoré, jamais créé en double. Sans e-mail, aucun compte de connexion n&apos;est créé. « Service » : nom exact d&apos;un service de la clinique
          (vide = dossier commun). Plusieurs antécédents ou allergies : séparez-les par des virgules.
        </>
      }
      columns={COLUMNS}
      sampleRows={SAMPLE_ROWS}
      parseRow={(get) => {
        const lastName = get("lastName");
        const firstName = get("firstName");
        const label = `${lastName} ${firstName}`.trim() || "patient";
        if (lastName.length < 2 || firstName.length < 2) return { error: `Nom et prénom requis (2 caractères au moins) — ${label}.` };
        const dob = parseDateCell(get("dateOfBirth"));
        if (!dob) return { error: `Date de naissance manquante ou illisible pour ${label} (JJ/MM/AAAA attendu).` };
        const sex = parseSex(get("sex"));
        if (sex === null) return { error: `Sexe illisible pour ${label} (M ou F attendu).` };
        const address = get("address");
        if (address.length < 3) return { error: `Adresse / quartier requis pour ${label}.` };
        const email = get("email");
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: `E-mail invalide pour ${label}.` };
        const dep = parseNumberCell(get("dependencyLevel"));
        if (dep === null || (dep != null && (dep < 1 || dep > 5))) return { error: `Niveau de dépendance invalide pour ${label} (1 à 5).` };
        return {
          item: {
            lastName,
            firstName,
            dateOfBirth: dob,
            sex: sex ?? undefined,
            phone: get("phone") || undefined,
            address,
            email: email || undefined,
            emergencyContact: get("emergencyContact") || undefined,
            serviceName: get("service") || undefined,
            pathologies: parseListCell(get("pathologies")),
            allergies: parseListCell(get("allergies")),
            dependencyLevel: dep ?? 1,
          },
        };
      }}
      onImport={(items) => importPatients({ clinicId, items })}
    />
  );
}
