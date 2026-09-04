"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { importPharmacyItems } from "@/actions/finance";
import { toast } from "sonner";

const TEMPLATE_HEADERS = [
  "Nom du produit",
  "Dosage",
  "Unite",
  "Categorie",
  "Prix d'achat (FCFA)",
  "Prix de vente (FCFA)",
  "Seuil d'alerte",
  "Stock initial",
  "Numero de lot",
  "Date de peremption (AAAA-MM-JJ)",
  "Fournisseur",
  "Emplacement",
];

const TEMPLATE_ROWS = [
  ["Paracetamol", "500", "mg", "Medicament", "350", "500", "20", "100", "LOT-2026-01", "2027-06-30", "Labo Pharmacie Centrale", "Rayon A1"],
  ["Amoxicilline", "250", "mg", "Medicament", "900", "1200", "15", "60", "LOT-2026-02", "2027-03-15", "Grossiste Sante Plus", "Rayon A2"],
  ["Seringues", "5", "ml", "Consommable", "", "3500", "5", "40", "", "", "", "Rayon C1"],
  ["Tensiometre electronique", "", "", "Materiel", "", "25000", "2", "3", "", "", "", "Rayon D1"],
];

// Classification par sous-chaîne plutôt qu'un dictionnaire à correspondance exacte : tolère les
// fautes de frappe courantes ("consomable" pour "consommable") et les libellés de forme
// galénique qu'on nous a vus utiliser en pratique (comprimé, sirop, injectable, colis, gel,
// crème...) qui n'ont pas vocation à distinguer MEDICATION/CONSUMABLE/EQUIPMENT — tout ce qui
// n'est reconnu ni comme consommable ni comme matériel retombe sur MEDICATION, la catégorie la
// plus courante. Dans ce cas, le libellé d'origine (ex: "Comprimé") est renvoyé comme `form` :
// plutôt que d'être silencieusement perdu, il est ajouté au dosage ("500mg, Comprimé") — c'est
// une information réelle sur le produit, pas juste une case de classement.
function classifyCategory(raw: string): { category: "MEDICATION" | "CONSUMABLE" | "EQUIPMENT"; form?: string } {
  const trimmed = raw.trim();
  const key = normalizeKey(trimmed);
  if (!key) return { category: "MEDICATION" };
  if (key.includes("consom") || key.includes("consum")) return { category: "CONSUMABLE" };
  if (key.includes("materi") || key.includes("equip")) return { category: "EQUIPMENT" };
  const form = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return { category: "MEDICATION", form };
}

interface ParsedRow {
  line: number;
  name: string;
  dosage?: string;
  category: "MEDICATION" | "CONSUMABLE" | "EQUIPMENT";
  reorderLevel: number;
  unitPrice: number;
  purchasePrice?: number;
  stockQuantity: number;
  batchNumber?: string;
  expiryDate?: string;
  supplier?: string;
  location?: string;
}

interface RowError {
  line: number;
  message: string;
}

function normalizeKey(header: string): string {
  // normalize("NFD") décompose é en "e" + diacritique combinant (U+0300-U+036F) ; on retire
  // ensuite tout caractère non alphanumérique, ce qui élimine ce diacritique en même temps que
  // les espaces/parenthèses/apostrophes — pas besoin d'une plage Unicode dédiée.
  return header
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Excel en locale française (courant au Cameroun/en Afrique francophone) exporte en CSV
// délimité par point-virgule — la virgule y sert de séparateur décimal. On détecte donc le
// délimiteur réellement utilisé plutôt que de supposer une virgule : compte les occurrences de
// chacun sur les premières lignes (hors texte entre guillemets, où une virgule ne doit pas
// compter) et retient le plus fréquent, avec la virgule comme repli si aucun des deux n'apparaît.
function detectDelimiter(text: string): "," | ";" {
  const sample = text.slice(0, 2000);
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (const char of sample) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char === ",") commas++;
    else if (!inQuotes && char === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}

// Parseur CSV minimal mais correct sur les guillemets/retours à la ligne dans un champ (format
// RFC4180), délimiteur virgule ou point-virgule — évite d'ajouter une dépendance pour un besoin
// aussi ponctuel.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Ignore le BOM UTF-8 qu'Excel ajoute couramment en tête de fichier.
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = detectDelimiter(clean);

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Retourne la date en AAAA-MM-JJ si reconnue, undefined si la cellule est vide (non renseignée),
// ou null si le texte est présent mais illisible comme date. Le repli précédent ("on renvoie le
// texte brut tel quel") laissait passer des dates invalides jusqu'à l'insertion en base : sur
// MongoDB, un createMany() en lot s'arrête silencieusement au premier document rejeté et
// n'insère jamais les lignes suivantes — un fichier de 159 lignes pouvait ainsi n'en importer
// que 101 sans le moindre message d'erreur. Une date illisible est maintenant une erreur de
// ligne visible avant même de tenter l'import, comme un prix invalide.
function parseDateFlexible(raw: string): string | undefined | null {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // AAAA-MM-JJ (format attendu du modèle)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // JJ/MM/AAAA ou JJ-MM-AAAA (formats courants tableur français)
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    const day = Number(d), month = Number(m);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function downloadTemplate() {
  // Point-virgule : correspond à ce qu'Excel produit par défaut en locale française (le
  // séparateur le plus couramment rencontré en pratique) — le parseur détecte de toute façon
  // automatiquement le délimiteur réel du fichier importé, virgule ou point-virgule.
  const lines = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((row) =>
    row.map((cell) => (cell.includes(";") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(";")
  );
  // BOM UTF-8 en tête : Excel affiche correctement les accents à l'ouverture sans lui.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modele_import_produits_pharmacie.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface ImportPharmacyCsvDialogProps {
  organizationId?: string;
}

export default function ImportPharmacyCsvDialog({ organizationId }: ImportPharmacyCsvDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [importing, setImporting] = useState(false);
  const [importFailures, setImportFailures] = useState<{ name: string; error: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName("");
    setRows([]);
    setErrors([]);
    setImportFailures([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setRows([]);
    setErrors([]);

    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      setErrors([{ line: 0, message: "Le fichier ne contient aucune ligne de produit (juste l'en-tête ou vide)." }]);
      return;
    }

    const headers = table[0].map(normalizeKey);
    const colIndex = (...candidates: string[]) => headers.findIndex((h) => candidates.some((c) => h.includes(c)));
    // "Prix" seul est ambigu entre les deux colonnes de prix : on distingue par "achat"/"vente",
    // en excluant explicitement l'autre pour qu'une colonne "Prix d'achat" ne matche jamais comme
    // prix de vente (et inversement) même si l'utilisateur ne garde que le mot "Prix".
    const colIndexExcluding = (include: string[], exclude: string[]) =>
      headers.findIndex((h) => include.some((c) => h.includes(c)) && !exclude.some((e) => h.includes(e)));

    const idx = {
      name: colIndex("nom"),
      dosage: colIndex("dosage"),
      unit: colIndex("unite"),
      category: colIndex("categ"),
      purchasePrice: colIndex("achat"),
      unitPrice: colIndexExcluding(["vente", "prix"], ["achat"]),
      reorderLevel: colIndex("seuil"),
      stockQuantity: colIndex("stockinitial", "stock"),
      batchNumber: colIndex("lot"),
      expiryDate: colIndex("peremption", "expir"),
      supplier: colIndex("fournisseur"),
      location: colIndex("emplacement", "rayon", "location"),
    };

    if (idx.name === -1 || idx.unitPrice === -1) {
      setErrors([{
        line: 0,
        message: "Colonnes obligatoires introuvables : \"Nom du produit\" et \"Prix de vente\" doivent être présentes. Utilisez le modèle fourni.",
      }]);
      return;
    }

    const parsedRows: ParsedRow[] = [];
    const parsedErrors: RowError[] = [];

    for (let i = 1; i < table.length; i++) {
      const cells = table[i];
      const line = i + 1;
      const get = (col: number) => (col >= 0 ? (cells[col] || "").trim() : "");

      const name = get(idx.name);
      if (!name) {
        parsedErrors.push({ line, message: "Nom du produit manquant." });
        continue;
      }

      const unitPriceRaw = get(idx.unitPrice).replace(/\s/g, "").replace(",", ".");
      const unitPrice = unitPriceRaw ? Number(unitPriceRaw) : NaN;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        parsedErrors.push({ line, message: `Prix de vente invalide pour "${name}".` });
        continue;
      }

      // Vide = non renseigné (pas d'erreur, purchasePrice reste undefined) ; rempli mais
      // illisible = erreur, pour ne pas importer silencieusement un prix d'achat faux.
      const purchasePriceRaw = get(idx.purchasePrice).replace(/\s/g, "").replace(",", ".");
      let purchasePrice: number | undefined;
      if (purchasePriceRaw) {
        purchasePrice = Number(purchasePriceRaw);
        if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
          parsedErrors.push({ line, message: `Prix d'achat invalide pour "${name}".` });
          continue;
        }
      }

      const reorderRaw = get(idx.reorderLevel).replace(/\s/g, "");
      const reorderLevel = reorderRaw ? Number(reorderRaw) : 10;
      if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
        parsedErrors.push({ line, message: `Seuil d'alerte invalide pour "${name}".` });
        continue;
      }

      // Stock initial — exception volontaire à la règle habituelle (stock à 0 à la création,
      // évoluant ensuite uniquement via achat/vente/inventaire) : sert uniquement à amorcer le
      // catalogue la toute première fois. Les articles créés après cet import initial repassent
      // par le circuit normal (Nouveau produit + Nouvel achat).
      const stockRaw = get(idx.stockQuantity).replace(/\s/g, "");
      const stockQuantity = stockRaw ? Number(stockRaw) : 0;
      if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
        parsedErrors.push({ line, message: `Stock initial invalide pour "${name}".` });
        continue;
      }

      const expiryDate = parseDateFlexible(get(idx.expiryDate));
      if (expiryDate === null) {
        parsedErrors.push({
          line,
          message: `Date de péremption illisible pour "${name}" ("${get(idx.expiryDate)}"). Utilisez AAAA-MM-JJ ou JJ/MM/AAAA, ou laissez vide.`,
        });
        continue;
      }

      const { category, form } = classifyCategory(get(idx.category));

      const dosageValue = get(idx.dosage);
      const unitValue = get(idx.unit);
      const dosageAndUnit = dosageValue && unitValue ? `${dosageValue}${unitValue}` : dosageValue || unitValue || "";
      const dosage = [dosageAndUnit, form].filter(Boolean).join(", ") || undefined;

      parsedRows.push({
        line,
        name,
        dosage,
        category,
        reorderLevel,
        unitPrice,
        purchasePrice,
        stockQuantity,
        batchNumber: get(idx.batchNumber) || undefined,
        expiryDate,
        supplier: get(idx.supplier) || undefined,
        location: get(idx.location) || undefined,
      });
    }

    setRows(parsedRows);
    setErrors(parsedErrors);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setImportFailures([]);
    try {
      const res = await importPharmacyItems({
        items: rows.map(({ line, ...item }) => item),
        organizationId,
      });
      if (res.success) {
        const failures = res.data?.failures || [];
        const count = res.data?.count ?? 0;
        router.refresh();
        if (failures.length === 0) {
          toast.success(`${count} produit(s) importé(s) avec succès.`);
          setOpen(false);
          reset();
        } else {
          // Chaque ligne est indépendante (cf. importPharmacyItems) : un échec partiel n'annule
          // pas les autres, mais on le montre clairement plutôt que de prétendre un succès total.
          toast.error(`${count} produit(s) importé(s), ${failures.length} en échec — voir le détail ci-dessous.`);
          setImportFailures(failures);
          setRows([]);
        }
      } else {
        toast.error(res.error || "Erreur lors de l'import.");
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl" />}>
        <Upload className="h-4 w-4" />
        Importer CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importer des produits depuis un fichier CSV
          </DialogTitle>
          <DialogDescription>
            Chaque ligne du fichier crée un nouveau produit dans le catalogue, avec la quantité indiquée dans « Stock initial » (0 si vide).
            Cette colonne ne sert qu&apos;à amorcer le stock la toute première fois — pour tout ajout ultérieur, utilisez
            « Nouveau produit » (stock à 0) puis « Nouvel achat » pour réceptionner une quantité.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Button type="button" variant="outline" onClick={downloadTemplate} className="gap-2 rounded-xl w-full">
            <Download className="h-4 w-4" />
            Télécharger le modèle CSV
          </Button>

          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-950/30 dark:file:text-blue-400 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3"
            />
            {fileName && <p className="text-xs text-slate-500">Fichier sélectionné : {fileName}</p>}
          </div>

          {rows.length > 0 && (
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {rows.length} produit(s) prêt(s) à être importé(s).
            </div>
          )}

          {errors.length > 0 && (
            <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {errors.length} ligne(s) ignorée(s) :
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 pl-6 list-disc space-y-0.5 max-h-32 overflow-y-auto">
                {errors.map((e, i) => (
                  <li key={i}>{e.line > 0 ? `Ligne ${e.line} : ` : ""}{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {importFailures.length > 0 && (
            <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 space-y-1">
              <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {importFailures.length} produit(s) n&apos;ont pas pu être créés :
              </p>
              <ul className="text-xs text-red-700 dark:text-red-400 pl-6 list-disc space-y-0.5 max-h-32 overflow-y-auto">
                {importFailures.map((f, i) => (
                  <li key={i}><span className="font-semibold">{f.name}</span> — {f.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>Annuler</Button>
          <Button onClick={handleImport} disabled={importing || rows.length === 0} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importer {rows.length > 0 ? `${rows.length} produit(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
