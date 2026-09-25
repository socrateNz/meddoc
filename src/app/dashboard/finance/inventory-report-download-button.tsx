"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { getInventoryReport } from "@/actions/stock";

interface InventoryReportDownloadButtonProps {
  inventoryCountId: string;
  label?: string;
}

// Même mécanique que ZReportDownloadButton : le détail (lignes + ajustements appliqués) n'est
// chargé qu'au clic, jamais pour chaque ligne de l'historique, puis le PDF est généré côté
// navigateur.
export default function InventoryReportDownloadButton({ inventoryCountId, label = "Rapport PDF" }: InventoryReportDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const res = await getInventoryReport(inventoryCountId);
      if (!res.success || !res.data) {
        throw new Error(res.error || "Impossible de charger le rapport de cet inventaire.");
      }
      const { inventory, organization, report } = res.data;

      const InventoryReportPDFDocument = (await import("@/components/pdf/inventory-report-pdf")).default;
      const { pdf } = await import("@react-pdf/renderer");

      const element = (
        <InventoryReportPDFDocument
          inventory={inventory}
          report={report}
          organizationName={organization.name}
          organizationLogoUrl={organization.logoUrl}
        />
      );

      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const day = inventory.completedAt ? new Date(inventory.completedAt).toISOString().slice(0, 10) : "";
      const reportRef = String(inventoryCountId).slice(-6).toUpperCase();
      link.download = `inventaire_${day}_${reportRef}`.replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Rapport d'inventaire téléchargé !");
    } catch (error: any) {
      console.error("Erreur lors de la génération du rapport d'inventaire:", error);
      toast.error(error.message || "Impossible de générer le rapport d'inventaire.");
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
      {isGenerating ? "Génération..." : label}
    </Button>
  );
}
