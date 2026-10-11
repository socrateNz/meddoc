"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { listFinancialTransactions } from "@/actions/finance";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { MAX_PAGE_SIZE } from "@/lib/pagination";
import {
  buildJournalExportRows,
  buildJournalSheetData,
  describeJournalFilters,
  JOURNAL_SHEET_COLUMNS,
  journalExportFileName,
  type JournalExportFilters,
  type JournalTransaction,
} from "@/lib/finance-journal-export";

interface FinanceJournalExportButtonsProps {
  organizationId?: string;
  // Exactement les filtres du journal affiché (cf. finance-journal.tsx) : l'export reproduit la
  // sélection à l'écran, toutes pages confondues.
  filters: JournalExportFilters;
  dateFrom?: string | null;
  dateTo?: string | null;
  tzOffsetMinutes?: number;
  periodLabel: string;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  disabled?: boolean;
}

type ExportFormat = "pdf" | "xlsx";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Même mécanique que ZReportDownloadButton : rien n'est chargé tant qu'on ne clique pas, puis on
// enchaîne les pages de listFinancialTransactions (20 par requête) et le fichier est généré côté
// navigateur.
export default function FinanceJournalExportButtons({
  organizationId,
  filters,
  dateFrom,
  dateTo,
  tzOffsetMinutes,
  periodLabel,
  organizationName,
  organizationLogoUrl,
  disabled,
}: FinanceJournalExportButtonsProps) {
  const [generating, setGenerating] = useState<ExportFormat | null>(null);

  const loadJournal = async () => {
    // Totaux du premier appel : agrégés côté serveur sur l'ensemble filtré (pas sur une page).
    const totals = { income: 0, expenses: 0 };
    const transactions = await fetchAllPages<JournalTransaction>(async (page) => {
      const res = await listFinancialTransactions({
        organizationId,
        search: filters.search?.trim() || undefined,
        type: filters.type || undefined,
        category: filters.category && filters.category !== "ALL" ? filters.category : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        tzOffsetMinutes,
        minAmount: filters.minAmount ? Number(filters.minAmount) : undefined,
        maxAmount: filters.maxAmount ? Number(filters.maxAmount) : undefined,
        page,
        pageSize: MAX_PAGE_SIZE,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || "Impossible de charger le journal de caisse.");
      }
      totals.income = res.data.filteredIncome;
      totals.expenses = res.data.filteredExpenses;
      return { data: res.data.transactions, total: res.data.totalCount, pageSize: res.data.pageSize };
    });
    return { rows: buildJournalExportRows(transactions), totals };
  };

  const exportPdf = async () => {
    const { rows, totals } = await loadJournal();
    const FinanceJournalPDFDocument = (await import("@/components/pdf/finance-journal-pdf")).default;
    const { pdf } = await import("@react-pdf/renderer");
    const blob = await pdf(
      <FinanceJournalPDFDocument
        rows={rows}
        totalIncome={totals.income}
        totalExpenses={totals.expenses}
        periodLabel={periodLabel}
        filters={describeJournalFilters(filters)}
        generatedAt={new Date()}
        organizationName={organizationName}
        organizationLogoUrl={organizationLogoUrl}
      />
    ).toBlob();
    downloadBlob(blob, journalExportFileName({ from: dateFrom, to: dateTo }, "pdf"));
  };

  const exportXlsx = async () => {
    const { rows, totals } = await loadJournal();
    const writeExcelFile = (await import("write-excel-file/browser")).default;

    const { data, stickyRowsCount } = buildJournalSheetData({
      rows,
      totalIncome: totals.income,
      totalExpenses: totals.expenses,
      periodLabel,
      filters: describeJournalFilters(filters),
      generatedAt: new Date(),
      organizationName,
    });
    const blob = await writeExcelFile(data, {
      sheet: "Journal de caisse",
      columns: JOURNAL_SHEET_COLUMNS,
      stickyRowsCount,
      orientation: "landscape",
    }).toBlob();
    downloadBlob(blob, journalExportFileName({ from: dateFrom, to: dateTo }, "xlsx"));
  };

  const run = async (format: ExportFormat) => {
    setGenerating(format);
    try {
      await (format === "pdf" ? exportPdf() : exportXlsx());
      toast.success(format === "pdf" ? "Journal de caisse exporté en PDF !" : "Journal de caisse exporté en Excel !");
    } catch (error) {
      console.error("Erreur lors de l'export du journal de caisse:", error);
      toast.error(error instanceof Error && error.message ? error.message : "Impossible d'exporter le journal de caisse.");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || generating !== null}
        onClick={() => run("pdf")}
        className="h-9 gap-1.5 rounded-xl text-xs font-semibold"
        title="Exporter le journal filtré en PDF"
      >
        {generating === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 text-rose-500" />}
        PDF
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || generating !== null}
        onClick={() => run("xlsx")}
        className="h-9 gap-1.5 rounded-xl text-xs font-semibold"
        title="Exporter le journal filtré en Excel (.xlsx)"
      >
        {generating === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}
        Excel
      </Button>
    </div>
  );
}
