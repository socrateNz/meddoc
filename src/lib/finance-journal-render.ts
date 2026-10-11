import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import writeExcelFile from "write-excel-file/node";
import FinanceJournalPDFDocument from "@/components/pdf/finance-journal-pdf";
import { buildJournalSheetData, JOURNAL_SHEET_COLUMNS, type JournalExportRow } from "@/lib/finance-journal-export";

// Génération du fichier d'export du Journal de caisse, côté serveur uniquement (route
// src/app/api/finance/journal/export/route.ts) : le navigateur ne reçoit que le fichier final.

export type JournalExportFormat = "pdf" | "xlsx";

export interface JournalExportInput {
  rows: JournalExportRow[];
  totalIncome: number;
  totalExpenses: number;
  periodLabel: string;
  filters: string[];
  generatedAt: Date;
  tzOffsetMinutes?: number;
  organizationName?: string;
  organizationLogoUrl?: string | null;
}

export const JOURNAL_EXPORT_CONTENT_TYPES: Record<JournalExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function renderJournalExport(format: JournalExportFormat, input: JournalExportInput): Promise<Buffer> {
  if (format === "pdf") {
    return renderToBuffer(
      // renderToBuffer attend un élément <Document> ; createElement ne le déduit pas du composant,
      // d'où le cast (même approche que inventory-report-pdf.test.ts).
      createElement(FinanceJournalPDFDocument, input) as unknown as ReactElement<DocumentProps>
    );
  }
  const { data, stickyRowsCount } = buildJournalSheetData(input);
  return writeExcelFile(data, {
    sheet: "Journal de caisse",
    columns: JOURNAL_SHEET_COLUMNS,
    stickyRowsCount,
    orientation: "landscape",
  }).toBuffer();
}
