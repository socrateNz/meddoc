"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { getSessionSummary } from "@/actions/registers";

interface ZReportDownloadButtonProps {
  sessionId: string;
  registerName: string;
  organizationName?: string;
  organizationLogoUrl?: string | null;
}

// Séparé de PDFDownloadButton (générique, alimenté par des props déjà en mémoire) : le tableau
// « Rapport de caisse » ne charge que les agrégats par session (listCashSessions), pas le détail
// complet des mouvements — trop lourd à charger pour chaque ligne du tableau alors que le Z n'est
// téléchargé qu'occasionnellement. Ce bouton va donc chercher le détail (getSessionSummary) au
// clic, puis génère le PDF, en réutilisant la même mécanique blob que PDFDownloadButton.
export default function ZReportDownloadButton({ sessionId, registerName, organizationName, organizationLogoUrl }: ZReportDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const res = await getSessionSummary(sessionId);
      if (!res.success || !res.data) {
        throw new Error(res.error || "Impossible de charger le détail de cette session.");
      }
      const { session, transactions, totalIncome, totalExpenses, expectedAmount, variance } = res.data;

      const ZReportPDFDocument = (await import("@/components/pdf/z-report-pdf")).default;
      const { pdf } = await import("@react-pdf/renderer");

      const element = (
        <ZReportPDFDocument
          session={session}
          transactions={transactions}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          expectedAmount={expectedAmount}
          variance={variance}
          organizationName={organizationName}
          organizationLogoUrl={organizationLogoUrl}
        />
      );

      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const reportRef = String(sessionId).slice(-6).toUpperCase();
      link.download = `Z_${registerName}_${reportRef}`.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Rapport Z téléchargé !");
    } catch (error: any) {
      console.error("Erreur lors de la génération du rapport Z:", error);
      toast.error(error.message || "Impossible de générer le rapport Z.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDownload}
      disabled={isGenerating}
      className="h-8 text-purple-600 dark:text-purple-400 hover:text-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-950/30 rounded-lg gap-1.5 text-xs font-medium"
    >
      {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
      {isGenerating ? "Génération..." : "Z de caisse"}
    </Button>
  );
}
