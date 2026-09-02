"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

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
    borderBottomColor: "#7c3aed",
    paddingBottom: 15,
    marginBottom: 20,
  },
  clinicInfo: {
    flexDirection: "column",
  },
  logoImage: {
    width: 42,
    height: 42,
    objectFit: "contain",
    marginBottom: 4,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e293b",
  },
  companySub: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  reportMeta: {
    textAlign: "right",
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#7c3aed",
    textTransform: "uppercase",
  },
  reportRef: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e293b",
    marginTop: 2,
  },
  reportStatus: {
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
    marginBottom: 16,
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  summaryBox: {
    width: "33.33%",
    paddingRight: 8,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1e293b",
    marginTop: 2,
  },
  varianceOk: {
    color: "#059669",
  },
  varianceBad: {
    color: "#dc2626",
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    padding: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    padding: 6,
  },
  colTime: { width: "12%" },
  colType: { width: "13%" },
  colDesc: { width: "40%" },
  colPatient: { width: "20%" },
  colAmount: { width: "15%", textAlign: "right" },
  tableHeaderText: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  tableText: {
    fontSize: 8.5,
  },
  incomeText: {
    color: "#059669",
    fontWeight: "bold",
  },
  expenseText: {
    color: "#dc2626",
    fontWeight: "bold",
  },
  notesBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 20,
    backgroundColor: "#fffbeb",
  },
  notesTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#92400e",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  footer: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 15,
  },
  signatureBox: {
    width: "40%",
    textAlign: "center",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    marginTop: 35,
    paddingTop: 4,
    fontSize: 8,
    color: "#64748b",
  },
  // Petit pied de page répété identique sur chaque page (fixed) — distinct du bloc signature
  // ci-dessus, qui n'apparaît qu'une fois là où le contenu se termine réellement.
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

interface ZReportPDFProps {
  session: any;
  transactions: any[];
  totalIncome: number;
  totalExpenses: number;
  expectedAmount: number;
  variance?: number | null;
  organizationName?: string;
  organizationLogoUrl?: string | null;
}

export default function ZReportPDFDocument({
  session,
  transactions,
  totalIncome,
  totalExpenses,
  expectedAmount,
  variance,
  organizationName,
  organizationLogoUrl,
}: ZReportPDFProps) {
  const formatFCFA = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "-";
    const num = Math.round(Number(val) || 0);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  };

  const formatDateTime = (d: string | Date | null | undefined) => {
    if (!d) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d));
  };

  const formatTime = (d: string | Date) =>
    new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));

  const reportRef = `Z-${(session.id || "000000").slice(-6).toUpperCase()}`;
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        {/* fixed : répété identique sur chaque page */}
        <View style={styles.header} fixed>
          <View style={styles.clinicInfo}>
            {organizationLogoUrl && <Image src={organizationLogoUrl} style={styles.logoImage} />}
            <Text style={styles.companyName}>{organizationName || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.companySub}>Plateforme de Gestion Médicale & Pharmacie</Text>
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportTitle}>Rapport de clôture (Z)</Text>
            <Text style={styles.reportRef}>N° {reportRef}</Text>
            <Text style={styles.reportStatus}>
              {session.status === "CLOSED" ? "Session clôturée" : "Session en cours"}
            </Text>
          </View>
        </View>

        {/* Informations de session */}
        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Ouverture</Text>
            <Text style={styles.infoText}>Caisse : {session.register?.name || "-"}</Text>
            <Text style={styles.infoText}>
              Par : {session.openedBy ? `${session.openedBy.firstName} ${session.openedBy.lastName}` : "-"}
            </Text>
            <Text style={styles.infoText}>Le : {formatDateTime(session.openedAt)}</Text>
            <Text style={styles.infoText}>Fond de caisse initial : {formatFCFA(session.openingFloat)}</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Fermeture</Text>
            <Text style={styles.infoText}>
              Par :{" "}
              {session.closedBy ? `${session.closedBy.firstName} ${session.closedBy.lastName}` : "En attente de clôture"}
            </Text>
            <Text style={styles.infoText}>Le : {formatDateTime(session.closedAt)}</Text>
            <Text style={styles.infoText}>Montant compté : {formatFCFA(session.countedAmount)}</Text>
          </View>
        </View>

        {/* Récapitulatif chiffré */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Fond de départ</Text>
            <Text style={styles.summaryValue}>{formatFCFA(session.openingFloat)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total encaissements</Text>
            <Text style={[styles.summaryValue, styles.varianceOk]}>+{formatFCFA(totalIncome)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total dépenses</Text>
            <Text style={[styles.summaryValue, styles.varianceBad]}>-{formatFCFA(totalExpenses)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Montant théorique</Text>
            <Text style={styles.summaryValue}>{formatFCFA(expectedAmount)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Montant compté</Text>
            <Text style={styles.summaryValue}>{formatFCFA(session.countedAmount)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Écart</Text>
            <Text
              style={[
                styles.summaryValue,
                variance == null ? styles.summaryValue : variance === 0 ? styles.varianceOk : styles.varianceBad,
              ]}
            >
              {variance == null ? "-" : `${variance > 0 ? "+" : ""}${formatFCFA(variance)}`}
            </Text>
          </View>
        </View>

        {/* Détail des mouvements */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colTime, styles.tableHeaderText]}>Heure</Text>
            <Text style={[styles.colType, styles.tableHeaderText]}>Type</Text>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>Désignation / Motif</Text>
            <Text style={[styles.colPatient, styles.tableHeaderText]}>Patient</Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>Montant</Text>
          </View>

          {sortedTransactions.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.tableText}>Aucun mouvement enregistré sur cette session.</Text>
            </View>
          ) : (
            sortedTransactions.map((t: any) => {
              const isIncome = t.type === "INCOME";
              const patientName = t.patient?.user ? `${t.patient.user.lastName} ${t.patient.user.firstName}` : "-";
              return (
                <View key={t.id} style={styles.tableRow}>
                  <Text style={[styles.colTime, styles.tableText]}>{formatTime(t.createdAt)}</Text>
                  <Text style={[styles.colType, styles.tableText]}>{isIncome ? "Encaiss." : "Dépense"}</Text>
                  <Text style={[styles.colDesc, styles.tableText]}>{t.description}</Text>
                  <Text style={[styles.colPatient, styles.tableText]}>{patientName}</Text>
                  <Text style={[styles.colAmount, styles.tableText, isIncome ? styles.incomeText : styles.expenseText]}>
                    {isIncome ? "+" : "-"}
                    {formatFCFA(t.amount)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Notes de clôture */}
        {session.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>Notes de clôture</Text>
            <Text style={styles.infoText}>{session.notes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.footer}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLine}>Signature du Caissier</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLine}>Signature du Responsable / Coordinateur</Text>
          </View>
        </View>

        {/* fixed : répété identique en bas de chaque page (distinct du bloc signature
            ci-dessus, qui n'apparaît qu'une fois à la fin réelle du contenu) */}
        <View style={styles.pageFooter} fixed>
          <Text>Document généré via MedDoc • Rapport de clôture de caisse (Z) • {reportRef}</Text>
        </View>
      </Page>
    </Document>
  );
}
