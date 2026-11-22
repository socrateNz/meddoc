// Lecture / écriture CSV pour les imports en masse (catalogues, patients, fournisseurs...). Pur :
// utilisable côté navigateur (fenêtres d'import) comme côté tests.
//
// Excel en locale française exporte en point-virgule (la virgule y est le séparateur décimal) : le
// délimiteur réel est détecté, guillemets RFC 4180 pris en charge, BOM UTF-8 ignoré.

export function normalizeKey(header: string): string {
  return header
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

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

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
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

// Point-virgule et BOM UTF-8 : ce qu'Excel français ouvre directement, accents compris.
export function buildCsv(table: string[][]): string {
  const lines = table.map((row) => row.map((cell) => (/[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(";"));
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(table: string[][], fileName: string) {
  const blob = new Blob([buildCsv(table)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- Lecture des cellules ----------

// Nombre français ou anglais (« 1 500,50 », « 1500.5 ») ; undefined si vide, null si illisible.
export function parseNumberCell(raw: string): number | undefined | null {
  const v = raw.replace(/\s/g, "").replace(",", ".");
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Date AAAA-MM-JJ ou JJ/MM/AAAA (JJ-MM-AAAA) → AAAA-MM-JJ ; undefined si vide, null si illisible.
export function parseDateCell(raw: string): string | undefined | null {
  const v = raw.trim();
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (Number(d) < 1 || Number(d) > 31 || Number(mo) < 1 || Number(mo) > 12) return null;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Liste dans une cellule : « Asthme, HTA » ou « Asthme | HTA ».
export function parseListCell(raw: string): string[] {
  return raw
    .split(/[,|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- Colonnes ----------

export type CsvColumn = {
  key: string;
  // En-tête du modèle téléchargeable.
  header: string;
  // Autres libellés reconnus à l'import (comparés sans accents ni ponctuation, par inclusion).
  aliases?: string[];
  required?: boolean;
};

// Index de chaque colonne dans l'en-tête du fichier (-1 si absente). Correspondance exacte
// d'abord, puis par inclusion, pour tolérer « Prix (FCFA) » ou « Nom du produit ».
export function resolveColumns(headerRow: string[], columns: CsvColumn[]): Record<string, number> {
  const headers = headerRow.map(normalizeKey);
  const taken = new Set<number>();
  const result: Record<string, number> = {};
  const candidates = (c: CsvColumn) => [c.header, ...(c.aliases ?? [])].map(normalizeKey).filter(Boolean);
  for (const pass of ["exact", "includes"] as const) {
    for (const col of columns) {
      if (result[col.key] !== undefined && result[col.key] !== -1) continue;
      const idx = headers.findIndex(
        (h, i) => !taken.has(i) && candidates(col).some((c) => (pass === "exact" ? h === c : h.includes(c) || c.includes(h) && h.length > 2))
      );
      result[col.key] = idx;
      if (idx >= 0) taken.add(idx);
    }
  }
  return result;
}
