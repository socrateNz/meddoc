"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";

interface PDFDownloadButtonProps {
  documentName: string;
  type: "patient" | "consultation" | "careplan" | "invoice";
  data: any;
  buttonText?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function PDFDownloadButton({
  documentName,
  type,
  data,
  buttonText = "Télécharger PDF",
  variant = "outline",
  size = "sm",
  className = "",
}: PDFDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      // 1. Dynamic import of the correct template based on type
      let element: any;
      
      if (type === "patient") {
        const PatientPDFDocument = (await import("./patient-pdf")).default;
        element = <PatientPDFDocument patient={data} />;
      } else if (type === "consultation") {
        const ConsultationPDFDocument = (await import("./consultation-pdf")).default;
        element = <ConsultationPDFDocument patient={data.patient} record={data.record} />;
      } else if (type === "careplan") {
        const CarePlanPDFDocument = (await import("./careplan-pdf")).default;
        element = <CarePlanPDFDocument patient={data.patient} plan={data.plan} />;
      } else if (type === "invoice") {
        const InvoicePDFDocument = (await import("./invoice-pdf")).default;
        element = <InvoicePDFDocument transaction={data.transaction} organizationName={data.organizationName} format={data.format} />;
      } else {
        throw new Error("Type de document PDF non pris en charge");
      }
      
      // 2. Dynamic import of the pdf compiler from @react-pdf/renderer
      const { pdf } = await import("@react-pdf/renderer");
      
      // 3. Compile to blob
      const docInstance = pdf(element);
      const blob = await docInstance.toBlob();
      
      // 4. Trigger download in the browser
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      // Clean filename
      const cleanFilename = documentName
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      link.download = `${cleanFilename}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("PDF téléchargé !");
    } catch (error) {
      console.error("Erreur lors de la génération du PDF:", error);
      toast.error("Impossible de générer le PDF. Veuillez réessayer.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={generatePDF}
      disabled={isGenerating}
      className={className}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Download className="h-4 w-4 mr-2" />
      )}
      {isGenerating ? "Génération..." : buttonText}
    </Button>
  );
}
