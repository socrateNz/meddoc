"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import type { JournalExportFilters } from "@/lib/finance-journal-export";

interface FinanceJournalExportButtonsProps {
  organizationId?: string;
  // Exactement les filtres du journal affiché (cf. finance-journal.tsx) : l'export reproduit la
  // sélection à l'écran, toutes pages confondues.
  filters: JournalExportFilters;
  dateFrom?: string | null;
  dateTo?: string | null;
  tzOffsetMinutes?: number;
  disabled?: boolean;
}

type ExportFormat = "pdf" | "xlsx";

// Une seule requête par export : la route /api/finance/journal/export lit tout le journal filtré,
// calcule les totaux et génère le fichier côté serveur ; le navigateur ne fait que le télécharger.
export default function FinanceJournalExportButtons({
  organizationId,
  filters,
  dateFrom,
  dateTo,
  tzOffsetMinutes,
  disabled,
}: FinanceJournalExportButtonsProps) {
  const [generating, setGenerating] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    setGenerating(format);
    try {
      const params = new URLSearchParams({ format });
      const set = (key: string, value: string | number | null | undefined) => {
        if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, String(value).trim());
      };
      set("organizationId", organizationId);
      set("dateFrom", dateFrom);
      set("dateTo", dateTo);
      set("tzOffsetMinutes", tzOffsetMinutes);
      set("search", filters.search);
      set("type", filters.type);
      if (filters.category !== "ALL") set("category", filters.category);
      set("minAmount", filters.minAmount);
      set("maxAmount", filters.maxAmount);

      const res = await fetch(`/api/finance/journal/export?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Impossible d'exporter le journal de caisse.");
      }

      const blob = await res.blob();
      const fileName =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || `journal-caisse.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

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
