"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";

interface PDFDownloadButtonProps {
  documentName: string;
  type: "patient" | "consultation" | "careplan" | "invoice" | "prescription" | "labreport" | "zreport" | "holding-invoice";
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
        element = <PatientPDFDocument patient={data} organizationName={data.organizationName} organizationLogoUrl={data.organizationLogoUrl} />;
      } else if (type === "consultation") {
        const ConsultationPDFDocument = (await import("./consultation-pdf")).default;
        element = (
          <ConsultationPDFDocument
            patient={data.patient}
            record={data.record}
            organizationName={data.organizationName}
            organizationLogoUrl={data.organizationLogoUrl}
          />
        );
      } else if (type === "careplan") {
        const CarePlanPDFDocument = (await import("./careplan-pdf")).default;
        element = (
          <CarePlanPDFDocument
            patient={data.patient}
            plan={data.plan}
            organizationName={data.organizationName}
            organizationLogoUrl={data.organizationLogoUrl}
          />
        );
      } else if (type === "invoice") {
        const InvoicePDFDocument = (await import("./invoice-pdf")).default;
        element = (
          <InvoicePDFDocument
            transaction={data.transaction}
            organizationName={data.organizationName}
            organizationLogoUrl={data.organizationLogoUrl}
            format={data.format}
          />
        );
      } else if (type === "prescription") {
        const PrescriptionPDFDocument = (await import("./prescription-pdf")).default;
        element = (
          <PrescriptionPDFDocument
            patient={data.patient}
            medications={data.medications}
            doctorName={data.doctorName}
            organizationName={data.organizationName}
            organizationLogoUrl={data.organizationLogoUrl}
            date={data.date}
          />
        );
      } else if (type === "labreport") {
        const QRCode = (await import("qrcode")).default;
        const reportNumber = `LAB-${String(data.order.id).slice(-8).toUpperCase()}`;
        const qrDataUrl = await QRCode.toDataURL(
          `MEDDOC-LAB|${reportNumber}|${data.order.patient?.user?.lastName || ""} ${data.order.patient?.user?.firstName || ""}`,
          { margin: 1, width: 160 }
        );
        const LabReportPDFDocument = (await import("./lab-report-pdf")).default;
        element = (
          <LabReportPDFDocument
            order={data.order}
            organizationName={data.organizationName}
            organizationLogoUrl={data.organizationLogoUrl}
            reportNumber={reportNumber}
            qrDataUrl={qrDataUrl}
          />
        );
      } else if (type === "zreport") {
        const ZReportPDFDocument = (await import("./z-report-pdf")).default;
        element = (
          <ZReportPDFDocument
            session={data.session}
            transactions={data.transactions}
            totalIncome={data.totalIncome}
            totalExpenses={data.totalExpenses}
            expectedAmount={data.expectedAmount}
            variance={data.variance}
            organizationName={data.organizationName}
            organizationLogoUrl={data.organizationLogoUrl}
          />
        );
      } else if (type === "holding-invoice") {
        const HoldingInvoicePDFDocument = (await import("./holding-invoice-pdf")).default;
        element = (
          <HoldingInvoicePDFDocument
            holding={data.holding}
            adminName={data.adminName}
            adminEmail={data.adminEmail}
          />
        );
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
