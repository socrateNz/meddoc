"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    color: "#1e293b",
    fontSize: 9,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    paddingBottom: 15,
    marginBottom: 20,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e40af",
  },
  companySub: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  invoiceMeta: {
    textAlign: "right",
  },
  invoiceTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e293b",
    textTransform: "uppercase",
  },
  invoiceNumber: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#2563eb",
    marginTop: 2,
  },
  invoiceDate: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 20,
  },
  infoBox: {
    flexDirection: "column",
    width: "48%",
  },
  infoTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 2,
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    padding: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    padding: 8,
  },
  colDesc: {
    width: "55%",
    fontWeight: "bold",
  },
  colFreq: {
    width: "20%",
    textAlign: "center",
  },
  colTotal: {
    width: "25%",
    textAlign: "right",
    fontWeight: "bold",
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 20,
  },
  totalBox: {
    width: "45%",
    borderWidth: 1,
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    padding: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e40af",
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e40af",
  },
  noteBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 30,
    backgroundColor: "#fafafa",
  },
  noteText: {
    fontSize: 8,
    color: "#64748b",
  },
  footer: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 15,
  },
  signatureBox: {
    width: "42%",
    textAlign: "center",
  },
  signatureRole: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#334155",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  signatureName: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 30,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    paddingTop: 4,
    fontSize: 8,
    color: "#64748b",
  },
  pageFooter: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
});

const PLAN_LABELS: Record<string, string> = {
  TRIAL: "Essai (Trial)",
  BASIC: "Basique",
  PREMIUM: "Premium",
  ENTERPRISE: "Entreprise",
};

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: "Mensuelle",
  YEARLY: "Annuelle",
};

interface HoldingInvoicePDFProps {
  holding: {
    id: string;
    name: string;
    plan: string;
    licenseExpiresAt?: string | Date | null;
    paymentAmount?: number | null;
    paymentFrequency?: string | null;
    createdAt?: string | Date | null;
    paymentPlan?: string | null;
    installmentsCount?: number | null;
    nextPaymentDate?: string | Date | null;
  };
  adminName?: string;
  adminEmail?: string;
}

export default function HoldingInvoicePDFDocument({ holding, adminName, adminEmail }: HoldingInvoicePDFProps) {
  const formatFCFA = (val: number) => {
    const num = Math.round(Number(val) || 0);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  };

  const invoiceNum = `HOLD-${String(holding.id || "000000").slice(-6).toUpperCase()}`;
  const issueDate = holding.createdAt ? new Date(holding.createdAt) : new Date();
  const formattedDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(issueDate);

  const planLabel = PLAN_LABELS[holding.plan] || holding.plan;
  const frequencyLabel = holding.paymentFrequency ? FREQUENCY_LABELS[holding.paymentFrequency] || holding.paymentFrequency : "-";
  const hasAmount = holding.paymentAmount != null && holding.paymentAmount > 0;
  const licenseLabel = holding.licenseExpiresAt
    ? `Jusqu'au ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(holding.licenseExpiresAt))}`
    : "Illimitée";

  const isInstallments = holding.paymentPlan === "INSTALLMENTS";
  const paymentPlanLabel = isInstallments
    ? `Paiement échelonné${holding.installmentsCount ? ` (${holding.installmentsCount} tranches)` : ""}`
    : "Paiement intégral (en une fois)";
  const nextPaymentLabel = holding.nextPaymentDate
    ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(holding.nextPaymentDate))
    : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête — fixed : répété identique sur chaque page */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.companyName}>MEDDOC</Text>
            <Text style={styles.companySub}>Plateforme SaaS de Gestion Médicale & Pharmacie</Text>
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>Facture d&apos;abonnement</Text>
            <Text style={styles.invoiceNumber}>N° {invoiceNum}</Text>
            <Text style={styles.invoiceDate}>Date: {formattedDate}</Text>
          </View>
        </View>

        {/* Parties */}
        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Prestataire</Text>
            <Text style={styles.infoText}>MedDoc</Text>
            <Text style={styles.infoText}>Plateforme SaaS de gestion médicale & pharmacie</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Client</Text>
            <Text style={styles.infoText}>{holding.name}</Text>
            {adminName && <Text style={styles.infoText}>Administrateur : {adminName}</Text>}
            {adminEmail && <Text style={styles.infoText}>Email : {adminEmail}</Text>}
          </View>
        </View>

        {/* Détail de l'abonnement */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>Désignation</Text>
            <Text style={[styles.colFreq, styles.tableHeaderText]}>Fréquence</Text>
            <Text style={[styles.colTotal, styles.tableHeaderText]}>Montant FCFA</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colDesc}>
              Abonnement MedDoc — Forfait {planLabel}{isInstallments ? " (par tranche)" : ""}
            </Text>
            <Text style={styles.colFreq}>{frequencyLabel}</Text>
            <Text style={styles.colTotal}>{hasAmount ? formatFCFA(holding.paymentAmount!) : "Gratuit / Sur devis"}</Text>
          </View>
        </View>

        {/* Total */}
        <View style={styles.totalSection}>
          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {isInstallments ? "MONTANT PAR TRANCHE" : "TOTAL"} {frequencyLabel !== "-" ? `(${frequencyLabel.toUpperCase()})` : ""} :
              </Text>
              <Text style={styles.totalAmount}>{hasAmount ? formatFCFA(holding.paymentAmount!) : "-"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>Mode de paiement : {paymentPlanLabel}</Text>
          {nextPaymentLabel && <Text style={[styles.noteText, { marginTop: 3, fontWeight: "bold" }]}>Prochain paiement : {nextPaymentLabel}</Text>}
          <Text style={[styles.noteText, { marginTop: 3 }]}>Validité de la licence : {licenseLabel}</Text>
        </View>

        {/* Signatures des deux parties */}
        <View style={styles.footer}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureRole}>Le Prestataire</Text>
            <Text style={styles.signatureName}>MedDoc</Text>
            <Text style={styles.signatureLine}>Signature & cachet</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureRole}>Le Client</Text>
            <Text style={styles.signatureName}>{adminName || holding.name}</Text>
            <Text style={styles.signatureLine}>Signature & cachet</Text>
          </View>
        </View>

        {/* fixed : répété identique en bas de chaque page */}
        <View style={styles.pageFooter} fixed>
          <Text>Document généré via MedDoc • Facture d&apos;abonnement</Text>
        </View>
      </Page>
    </Document>
  );
}
