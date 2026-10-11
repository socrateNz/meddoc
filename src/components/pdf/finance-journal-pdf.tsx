"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatFCFA, type JournalExportRow } from "@/lib/finance-journal-export";

// Même charte que z-report-pdf.tsx (en-tête, encadrés, pied de page répété), en paysage : le
// journal a deux colonnes de plus que le Z (statut, enregistré par).
// Pas de lineHeight sur la Page : hérité par le pied de page en position absolue, il l'empêche de
// s'afficher (vérifié avec @react-pdf/renderer v4). L'interligne par défaut suffit au tableau.
const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 50,
    paddingLeft: 32,
    paddingRight: 32,
    fontFamily: "Helvetica",
    color: "#1e293b",
    fontSize: 8.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    paddingBottom: 12,
    marginBottom: 14,
  },
  logoImage: {
    width: 38,
    height: 38,
    objectFit: "contain",
    marginBottom: 4,
  },
  companyName: {
    fontSize: 15,
    fontWeight: "bold",
  },
  companySub: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 4,
  },
  reportMeta: {
    textAlign: "right",
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2563eb",
    textTransform: "uppercase",
  },
  reportSub: {
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 2,
  },
  reportStatus: {
    fontSize: 7.5,
    color: "#64748b",
    marginTop: 2,
  },
  filtersBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    padding: 8,
    marginBottom: 12,
  },
  filtersTitle: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  summaryGrid: {
    flexDirection: "row",
    marginBottom: 14,
  },
  summaryBox: {
    width: "25%",
    paddingRight: 8,
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
    marginTop: 2,
  },
  incomeText: {
    color: "#059669",
    fontWeight: "bold",
  },
  expenseText: {
    color: "#dc2626",
    fontWeight: "bold",
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  colDate: { width: "12%", paddingRight: 4 },
  colCategory: { width: "12%", paddingRight: 4 },
  colDesc: { width: "27%", paddingRight: 4 },
  colStatus: { width: "13%", paddingRight: 4 },
  colPatient: { width: "12%", paddingRight: 4 },
  colRecordedBy: { width: "11%", paddingRight: 4 },
  colAmount: { width: "13%", textAlign: "right" },
  tableHeaderText: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  mutedText: {
    color: "#64748b",
  },
  pageFooter: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
});

interface FinanceJournalPDFProps {
  rows: JournalExportRow[];
  totalIncome: number;
  totalExpenses: number;
  periodLabel: string;
  filters: string[];
  generatedAt: Date;
  organizationName?: string;
  organizationLogoUrl?: string | null;
}

const formatDateTime = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

export default function FinanceJournalPDFDocument({
  rows,
  totalIncome,
  totalExpenses,
  periodLabel,
  filters,
  generatedAt,
  organizationName,
  organizationLogoUrl,
}: FinanceJournalPDFProps) {
  const netBalance = totalIncome - totalExpenses;

  return (
    <Document title={`Journal de caisse — ${periodLabel}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* fixed : répété identique sur chaque page */}
        <View style={styles.header} fixed>
          <View>
            {organizationLogoUrl && <Image src={organizationLogoUrl} style={styles.logoImage} />}
            <Text style={styles.companyName}>{organizationName || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.companySub}>Plateforme de Gestion Médicale & Pharmacie</Text>
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportTitle}>Journal de caisse</Text>
            <Text style={styles.reportSub}>{periodLabel}</Text>
            <Text style={styles.reportStatus}>Édité le {formatDateTime(generatedAt)}</Text>
          </View>
        </View>

        {filters.length > 0 && (
          <View style={styles.filtersBox}>
            <Text style={styles.filtersTitle}>Filtres appliqués</Text>
            <Text>{filters.join("  •  ")}</Text>
          </View>
        )}

        {/* Totaux : agrégés côté serveur sur l'ensemble filtré, identiques à l'écran */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total encaissé</Text>
            <Text style={[styles.summaryValue, styles.incomeText]}>+{formatFCFA(totalIncome)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total dépensé</Text>
            <Text style={[styles.summaryValue, styles.expenseText]}>
              {totalExpenses > 0 ? "-" : ""}
              {formatFCFA(totalExpenses)}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Solde net</Text>
            <Text style={[styles.summaryValue, netBalance < 0 ? styles.expenseText : {}]}>
              {netBalance >= 0 ? "+" : ""}
              {formatFCFA(netBalance)}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Mouvements</Text>
            <Text style={styles.summaryValue}>{rows.length}</Text>
          </View>
        </View>

        <View style={styles.table}>
          {/* fixed : l'en-tête de colonnes est répété en haut de chaque page du tableau */}
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.colDate, styles.tableHeaderText]}>Date & heure</Text>
            <Text style={[styles.colCategory, styles.tableHeaderText]}>Catégorie</Text>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>Motif / Description</Text>
            <Text style={[styles.colStatus, styles.tableHeaderText]}>Statut</Text>
            <Text style={[styles.colPatient, styles.tableHeaderText]}>Patient</Text>
            <Text style={[styles.colRecordedBy, styles.tableHeaderText]}>Enregistré par</Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>Montant</Text>
          </View>

          {rows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.mutedText}>Aucune transaction ne correspond à ces filtres.</Text>
            </View>
          ) : (
            rows.map((r) => (
              // wrap={false} : une ligne n'est jamais coupée entre deux pages
              <View key={r.id} style={styles.tableRow} wrap={false}>
                <Text style={styles.colDate}>{formatDateTime(r.date)}</Text>
                <Text style={styles.colCategory}>{r.categoryLabel}</Text>
                <Text style={styles.colDesc}>{r.description}</Text>
                <Text style={[styles.colStatus, styles.mutedText]}>{r.status || "-"}</Text>
                <Text style={styles.colPatient}>{r.patient || "-"}</Text>
                <Text style={styles.colRecordedBy}>{r.recordedBy || "-"}</Text>
                <Text style={[styles.colAmount, r.isIncome ? styles.incomeText : styles.expenseText]}>
                  {r.isIncome ? "+" : ""}
                  {formatFCFA(r.signedAmount)}
                </Text>
              </View>
            ))
          )}

          <View style={styles.totalRow} wrap={false}>
            <Text style={[{ width: "87%" }, styles.tableHeaderText]}>Solde net de la sélection</Text>
            <Text style={[styles.colAmount, netBalance < 0 ? styles.expenseText : { fontWeight: "bold" }]}>
              {netBalance >= 0 ? "+" : ""}
              {formatFCFA(netBalance)}
            </Text>
          </View>
        </View>

        <View style={styles.pageFooter} fixed>
          <Text>Document généré via MedDoc • Journal de caisse • {periodLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
