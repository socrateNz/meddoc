"use client";

import CsvImportDialog from "@/components/csv-import-dialog";
import { importSuppliers } from "@/actions/suppliers";
import type { CsvColumn } from "@/lib/csv";

const COLUMNS: CsvColumn[] = [
  { key: "name", header: "Nom du fournisseur", aliases: ["fournisseur", "raison sociale", "nom"], required: true },
  { key: "contactName", header: "Personne à contacter", aliases: ["contact", "interlocuteur"] },
  { key: "phone", header: "Téléphone", aliases: ["telephone", "tel", "phone"] },
  { key: "email", header: "E-mail", aliases: ["email", "mail", "courriel"] },
  { key: "address", header: "Adresse", aliases: ["adresse", "ville"] },
  { key: "notes", header: "Notes", aliases: ["note", "commentaire", "remarque"] },
];

const SAMPLE_ROWS = [
  ["Laborex Cameroun", "Service commercial", "+237 6XX XX XX XX", "commandes@exemple.cm", "Douala", "Livraison le mardi"],
  ["Grossiste Santé Plus", "", "+237 6XX XX XX XX", "", "Yaoundé", ""],
];

type Row = { name: string; contactName?: string; phone?: string; email?: string; address?: string; notes?: string };

export default function SuppliersImport({ organizationId, onImported }: { organizationId?: string; onImported?: () => void }) {
  return (
    <CsvImportDialog<Row>
      title="Importer des fournisseurs"
      itemLabel="fournisseur"
      templateFileName="modele_import_fournisseurs.csv"
      description="Une ligne par fournisseur. Un fournisseur de même nom est mis à jour (seules les cellules remplies remplacent les informations existantes)."
      columns={COLUMNS}
      sampleRows={SAMPLE_ROWS}
      parseRow={(get) => {
        const name = get("name");
        if (!name) return { error: "Nom du fournisseur manquant." };
        const email = get("email");
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: `E-mail invalide pour « ${name} ».` };
        const opt = (k: string) => get(k) || undefined;
        return { item: { name, contactName: opt("contactName"), phone: opt("phone"), email: email || undefined, address: opt("address"), notes: opt("notes") } };
      }}
      onImport={(items) => importSuppliers({ organizationId, items })}
      onImported={onImported}
    />
  );
}
