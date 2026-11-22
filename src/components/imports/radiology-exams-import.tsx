"use client";

import CsvImportDialog from "@/components/csv-import-dialog";
import { importRadiologyExams } from "@/actions/radiology";
import { normalizeKey, parseNumberCell, type CsvColumn } from "@/lib/csv";
import { RADIOLOGY_MODALITIES, RADIOLOGY_MODALITY_LABELS } from "@/lib/radiology";

type Modality = (typeof RADIOLOGY_MODALITIES)[number];

const COLUMNS: CsvColumn[] = [
  { key: "name", header: "Nom de l'examen", aliases: ["examen", "nom"], required: true },
  { key: "modality", header: "Modalité", aliases: ["modalite", "type"], required: true },
  { key: "basePrice", header: "Tarif (FCFA)", aliases: ["tarif", "prix"], required: true },
];

const SAMPLE_ROWS = [
  ["Échographie obstétricale", "Échographie", "10000"],
  ["Radiographie du thorax (face)", "Radiographie", "8000"],
  ["Électrocardiogramme", "ECG", "5000"],
];

// Modalité reconnue par son libellé (« Échographie ») ou son code (« ULTRASOUND »).
const modalityByKey = new Map<string, Modality>(
  RADIOLOGY_MODALITIES.flatMap((m) => [[normalizeKey(m), m] as const, [normalizeKey(RADIOLOGY_MODALITY_LABELS[m] ?? m), m] as const])
);

type Row = { name: string; modality: Modality; basePrice: number };

export default function RadiologyExamsImport({ clinicId }: { clinicId: string }) {
  return (
    <CsvImportDialog<Row>
      title="Importer le catalogue d'imagerie"
      itemLabel="examen"
      templateFileName="modele_import_examens_imagerie.csv"
      description={
        <>
          Une ligne par examen. Modalités reconnues : {RADIOLOGY_MODALITIES.map((m) => RADIOLOGY_MODALITY_LABELS[m] ?? m).join(", ")}. Un examen de même nom est mis à jour.
        </>
      }
      columns={COLUMNS}
      sampleRows={SAMPLE_ROWS}
      parseRow={(get) => {
        const name = get("name");
        if (name.length < 2) return { error: "Nom de l'examen manquant." };
        const modality = modalityByKey.get(normalizeKey(get("modality")));
        if (!modality) return { error: `Modalité inconnue pour « ${name} » (« ${get("modality")} »).` };
        const basePrice = parseNumberCell(get("basePrice"));
        if (basePrice == null || basePrice < 0) return { error: `Tarif manquant ou invalide pour « ${name} ».` };
        return { item: { name, modality, basePrice } };
      }}
      onImport={(items) => importRadiologyExams({ clinicId, items })}
    />
  );
}
