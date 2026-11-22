"use client";

import CsvImportDialog from "@/components/csv-import-dialog";
import { importLabTests } from "@/actions/lab";
import { parseNumberCell, normalizeKey, type CsvColumn } from "@/lib/csv";
import { TEMPLATE_PRESETS } from "@/lib/lab-templates";

const COLUMNS: CsvColumn[] = [
  { key: "name", header: "Nom de l'examen", aliases: ["examen", "nom", "analyse"], required: true },
  { key: "department", header: "Paillasse", aliases: ["service", "departement"] },
  { key: "basePrice", header: "Prix maison (FCFA)", aliases: ["prix maison", "prix de base", "prix"], required: true },
  { key: "partnerPrice", header: "Prix partenaire (FCFA)", aliases: ["prix partenaire", "partenaire"] },
  { key: "baseCost", header: "Coût de base (FCFA)", aliases: ["cout"] },
  { key: "durationMinutes", header: "Durée (minutes)", aliases: ["duree", "delai"] },
  { key: "template", header: "Modèle de compte rendu", aliases: ["modele", "template"] },
];

const SAMPLE_ROWS = [
  ["NFS", "Hématologie", "5000", "4000", "", "60", "NFS (numération formule sanguine)"],
  ["Acide urique", "Biochimie", "3000", "2500", "", "120", "Acide urique"],
  ["ECBU + antibiogramme", "Bactériologie", "10000", "8000", "", "2880", "ECBU (examen cytobactériologique des urines)"],
  ["Goutte épaisse", "Parasitologie", "1500", "1000", "", "30", "Goutte épaisse (paludisme)"],
  ["AgHBs", "Sérologie", "3000", "2500", "", "30", "AgHBs (hépatite B)"],
];

// Modèle de compte rendu désigné par son nom (ou son identifiant) dans le fichier.
const presetIdByName = new Map(TEMPLATE_PRESETS.flatMap((p) => [[normalizeKey(p.name), p.id] as const, [normalizeKey(p.id), p.id] as const]));

type Row = { name: string; department?: string; basePrice: number; partnerPrice?: number; baseCost?: number; durationMinutes?: number; templateId?: string };

export default function LabTestsImport({ organizationId }: { organizationId?: string }) {
  return (
    <CsvImportDialog<Row>
      title="Importer le catalogue d'examens"
      itemLabel="examen"
      templateFileName="modele_import_examens_laboratoire.csv"
      description={
        <>
          Une ligne par examen. Un examen qui existe déjà (même nom) est mis à jour : réimporter votre grille de prix ne crée pas de doublons.
          « Modèle de compte rendu » reprend le nom d&apos;un modèle prêt à l&apos;emploi (ex. « Acide urique », « ECBU (examen cytobactériologique des urines) ») ;
          vide = saisie simple.
        </>
      }
      columns={COLUMNS}
      sampleRows={SAMPLE_ROWS}
      parseRow={(get) => {
        const name = get("name");
        if (!name) return { error: "Nom de l'examen manquant." };
        const basePrice = parseNumberCell(get("basePrice"));
        if (basePrice == null || basePrice < 0) return { error: `Prix maison manquant ou invalide pour « ${name} ».` };
        const partnerPrice = parseNumberCell(get("partnerPrice"));
        const baseCost = parseNumberCell(get("baseCost"));
        const duration = parseNumberCell(get("durationMinutes"));
        if (partnerPrice === null || (partnerPrice ?? 0) < 0) return { error: `Prix partenaire invalide pour « ${name} ».` };
        if (baseCost === null || duration === null) return { error: `Coût ou durée invalide pour « ${name} ».` };
        const templateCell = get("template");
        const templateId = templateCell ? presetIdByName.get(normalizeKey(templateCell)) : undefined;
        if (templateCell && !templateId) return { error: `Modèle de compte rendu inconnu pour « ${name} » (« ${templateCell} »).` };
        return {
          item: { name, department: get("department") || undefined, basePrice, partnerPrice, baseCost, durationMinutes: duration, templateId },
        };
      }}
      onImport={(items) => importLabTests({ organizationId, items })}
    />
  );
}
