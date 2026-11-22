"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { downloadCsv, parseCsv, resolveColumns, type CsvColumn } from "@/lib/csv";
import { toast } from "sonner";

export type CsvRowResult<T> = { item: T } | { error: string };
export type CsvImportResult = { success: true; data: { created: number; updated?: number; failures: { name: string; error: string }[] } } | { success: false; error: string };

// Fenêtre d'import CSV générique : télécharger le modèle, choisir le fichier, voir les lignes prêtes
// et en erreur, importer. Chaque type de données fournit ses colonnes, des lignes d'exemple, la
// lecture d'une ligne et l'action serveur d'import.
export default function CsvImportDialog<T>({
  title,
  description,
  templateFileName,
  columns,
  sampleRows,
  parseRow,
  onImport,
  itemLabel,
  maxRows = 2000,
  onImported,
}: {
  title: string;
  description: React.ReactNode;
  templateFileName: string;
  columns: CsvColumn[];
  sampleRows: string[][];
  // get(key) : valeur de la cellule (vide si colonne absente).
  parseRow: (get: (key: string) => string, line: number) => CsvRowResult<T>;
  onImport: (items: T[]) => Promise<CsvImportResult>;
  itemLabel: string;
  maxRows?: number;
  // Après un import réussi (même partiel) : recharger une liste tenue côté client (react-query...).
  onImported?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName("");
    setItems([]);
    setErrors([]);
    setFailures([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    const table = parseCsv(await file.text());
    if (table.length < 2) {
      setErrors([{ line: 0, message: "Le fichier ne contient aucune ligne (juste l'en-tête, ou vide)." }]);
      return;
    }
    if (table.length - 1 > maxRows) {
      setErrors([{ line: 0, message: `Trop de lignes (${table.length - 1}) : ${maxRows} au maximum par import. Découpez le fichier.` }]);
      return;
    }
    const idx = resolveColumns(table[0], columns);
    const missing = columns.filter((c) => c.required && idx[c.key] < 0);
    if (missing.length > 0) {
      setErrors([{ line: 0, message: `Colonnes obligatoires introuvables : ${missing.map((c) => `« ${c.header} »`).join(", ")}. Utilisez le modèle fourni.` }]);
      return;
    }
    const parsed: T[] = [];
    const rowErrors: { line: number; message: string }[] = [];
    for (let i = 1; i < table.length; i++) {
      const cells = table[i];
      const get = (key: string) => (idx[key] >= 0 ? (cells[idx[key]] ?? "").trim() : "");
      const res = parseRow(get, i + 1);
      if ("item" in res) parsed.push(res.item);
      else rowErrors.push({ line: i + 1, message: res.error });
    }
    setItems(parsed);
    setErrors(rowErrors);
  };

  const handleImport = async () => {
    if (items.length === 0) return;
    setImporting(true);
    try {
      const res = await onImport(items);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const { created, updated = 0, failures: failed } = res.data;
      const summary = [created ? `${created} ${itemLabel}(s) créé(s)` : "", updated ? `${updated} mis à jour` : ""].filter(Boolean).join(", ") || "Aucun changement";
      router.refresh();
      onImported?.();
      if (failed.length === 0) {
        toast.success(`${summary}.`);
        setOpen(false);
        reset();
      } else {
        toast.error(`${summary} — ${failed.length} en échec, voir le détail.`);
        setFailures(failed);
        setItems([]);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl" />}>
        <Upload className="h-4 w-4" />
        Importer CSV
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-[640px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
            <p className="font-semibold">1. Téléchargez le modèle, remplissez-le dans Excel, enregistrez-le en CSV.</p>
            <p className="mt-0.5">Colonnes obligatoires : {columns.filter((c) => c.required).map((c) => c.header).join(", ")}. Les lignes d&apos;exemple sont à remplacer.</p>
            <Button type="button" variant="outline" size="sm" className="mt-2 gap-2 rounded-lg bg-white dark:bg-slate-900" onClick={() => downloadCsv([columns.map((c) => c.header), ...sampleRows], templateFileName)}>
              <Download className="h-4 w-4" />
              Télécharger le modèle
            </Button>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">2. Choisissez le fichier rempli</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="block w-full rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 dark:border-slate-700 dark:text-slate-400"
            />
            {fileName && <p className="text-xs text-slate-500">Fichier : {fileName}</p>}
          </div>

          {items.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {items.length} ligne(s) prête(s) à importer.
            </div>
          )}
          {errors.length > 0 && (
            <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {errors.length} ligne(s) ignorée(s) :
              </p>
              <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-6 text-xs text-amber-700 dark:text-amber-400">
                {errors.map((e, i) => (
                  <li key={i}>
                    {e.line > 0 ? `Ligne ${e.line} : ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {failures.length > 0 && (
            <div className="space-y-1 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {failures.length} ligne(s) non importée(s) :
              </p>
              <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-6 text-xs text-red-700 dark:text-red-400">
                {failures.map((f, i) => (
                  <li key={i}>
                    <span className="font-semibold">{f.name}</span> — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            Annuler
          </Button>
          <Button onClick={handleImport} disabled={importing || items.length === 0} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importer {items.length > 0 ? `${items.length} ligne(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
