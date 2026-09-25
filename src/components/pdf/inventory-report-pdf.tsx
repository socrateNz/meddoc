"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { InventoryReport, InventoryReportRow } from "@/lib/inventory-report";

// Même charte que le rapport Z (z-report-pdf.tsx) : en-tête violet, blocs d'infos, tableaux gris.
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
  clinicInfo: { flexDirection: "column" },
  logoImage: { width: 42, height: 42, objectFit: "contain", marginBottom: 4 },
  companyName: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  companySub: { fontSize: 8, color: "#64748b", marginTop: 2 },
  runningHeader: { position: "absolute", top: 18, left: 40, fontSize: 8, color: "#64748b" },
  reportMeta: { textAlign: "right" },
  reportTitle: { fontSize: 14, fontWeight: "bold", color: "#7c3aed", textTransform: "uppercase" },
  reportRef: { fontSize: 10, fontWeight: "bold", color: "#1e293b", marginTop: 2 },
  reportStatus: { fontSize: 8, color: "#64748b", marginTop: 2 },
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
  infoBox: { flexDirection: "column", width: "48%" },
  infoTitle: { fontSize: 8, fontWeight: "bold", color: "#475569", textTransform: "uppercase", marginBottom: 4 },
  infoText: { fontSize: 9, color: "#0f172a", marginBottom: 2 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  summaryBox: { width: "33.33%", paddingRight: 8, marginBottom: 8 },
  summaryLabel: { fontSize: 7.5, fontWeight: "bold", color: "#64748b", textTransform: "uppercase" },
  summaryValue: { fontSize: 12, fontWeight: "bold", color: "#1e293b", marginTop: 2 },
  okText: { color: "#059669" },
  badText: { color: "#dc2626" },
  warnText: { color: "#d97706" },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 3,
  },
  sectionHint: { fontSize: 8, color: "#64748b", marginBottom: 6 },
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
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableHeaderText: { fontSize: 7.5, fontWeight: "bold", color: "#475569", textTransform: "uppercase" },
  tableText: { fontSize: 8.5 },
  mutedText: { color: "#94a3b8" },
  // Colonnes du tableau des produits modifiés
  mName: { width: "38%" },
  mBefore: { width: "14%", textAlign: "right" },
  mAfter: { width: "14%", textAlign: "right" },
  mDelta: { width: "12%", textAlign: "right" },
  mValue: { width: "22%", textAlign: "right" },
  notesBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
    backgroundColor: "#fffbeb",
  },
  notesTitle: { fontSize: 8, fontWeight: "bold", color: "#92400e", textTransform: "uppercase", marginBottom: 4 },
  footer: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 15,
  },
  signatureBox: { width: "40%", textAlign: "center" },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    marginTop: 35,
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
    fontSize: 7,
    color: "#94a3b8",
  },
});

interface InventoryReportPDFProps {
  inventory: { id: string; createdAt: string | Date; completedAt?: string | Date | null; startedBy?: { firstName?: string | null; lastName?: string | null } | null };
  report: InventoryReport;
  organizationName?: string | null;
  organizationLogoUrl?: string | null;
}

const formatFCFA = (val: number | null | undefined) => {
  if (val === null || val === undefined) return "-";
  return Math.round(Number(val) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
};

const formatDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
};

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

const productLabel = (row: InventoryReportRow) => (row.dosage ? `${row.name} (${row.dosage})` : row.name);

export default function InventoryReportPDFDocument({ inventory, report, organizationName, organizationLogoUrl }: InventoryReportPDFProps) {
  const { totals, modified, notApplied } = report;
  const reportRef = `INV-${(inventory.id || "000000").slice(-6).toUpperCase()}`;
  const startedBy = inventory.startedBy ? `${inventory.startedBy.firstName ?? ""} ${inventory.startedBy.lastName ?? ""}`.trim() : "";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Éléments répétés sur chaque page : posés en absolu, directement au niveau de la Page (un
            `render` imbriqué dans un conteneur `fixed`, ou un second `render` de pied de page, ne
            s'affichait pas). Le numéro de page est donc porté par le bandeau du haut. */}
        <Text
          fixed
          style={styles.runningHeader}
          render={({ pageNumber, totalPages }) =>
            pageNumber > 1
              ? `${organizationName || "MEDDOC"} • Rapport d'inventaire N° ${reportRef} • Page ${pageNumber} / ${totalPages}`
              : `Page ${pageNumber} / ${totalPages}`
          }
        />
        <View fixed style={styles.pageFooter}>
          <Text>Document généré via MedDoc • Rapport d&apos;inventaire • {reportRef}</Text>
        </View>

        {/* Le logo ne doit apparaître QUE sur la première page : répété dans un en-tête `fixed`, il fait
            échouer le rendu de react-pdf dès que le document compte plusieurs pages ("unsupported
            number: -1.8e+22", constaté sur un inventaire de 276 produits avec le logo de la clinique).
            Les pages suivantes n'ont donc qu'un bandeau texte, répété via `fixed`. */}
        <View style={styles.header}>
          <View style={styles.clinicInfo}>
            {organizationLogoUrl && <Image src={organizationLogoUrl} style={styles.logoImage} />}
            <Text style={styles.companyName}>{organizationName || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.companySub}>Plateforme de Gestion Médicale & Pharmacie</Text>
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportTitle}>Rapport d&apos;inventaire</Text>
            <Text style={styles.reportRef}>N° {reportRef}</Text>
            <Text style={styles.reportStatus}>Inventaire clôturé</Text>
          </View>
        </View>
        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Démarrage</Text>
            <Text style={styles.infoText}>Par : {startedBy || "-"}</Text>
            <Text style={styles.infoText}>Le : {formatDateTime(inventory.createdAt)}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Clôture</Text>
            <Text style={styles.infoText}>Le : {formatDateTime(inventory.completedAt)}</Text>
            <Text style={styles.infoText}>Produits inventoriés : {totals.totalLines}</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Produits modifiés</Text>
            <Text style={styles.summaryValue}>{totals.modified}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Conformes (sans écart)</Text>
            <Text style={[styles.summaryValue, styles.okText]}>{totals.conform}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Écarts non appliqués</Text>
            <Text style={[styles.summaryValue, totals.notApplied > 0 ? styles.warnText : styles.summaryValue]}>{totals.notApplied}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Pertes (unités)</Text>
            <Text style={[styles.summaryValue, totals.lossUnits > 0 ? styles.badText : styles.summaryValue]}>
              {totals.lossUnits > 0 ? `-${totals.lossUnits}` : "0"}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Valeur des pertes</Text>
            <Text style={[styles.summaryValue, totals.lossValue > 0 ? styles.badText : styles.summaryValue]}>
              {formatFCFA(totals.lossValue)}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Surplus (unités / valeur)</Text>
            <Text style={[styles.summaryValue, totals.surplusUnits > 0 ? styles.okText : styles.summaryValue]}>
              {totals.surplusUnits > 0 ? `+${totals.surplusUnits}` : "0"}
              {totals.surplusUnits > 0 ? ` / ${formatFCFA(totals.surplusValue)}` : ""}
            </Text>
          </View>
        </View>

        {/* Produits dont le stock a été modifié par la clôture */}
        <Text style={styles.sectionTitle}>Produits dont le stock a été modifié ({modified.length})</Text>
        <Text style={styles.sectionHint}>
          Stock avant = ce que le système indiquait au moment du comptage ; stock après = quantité comptée, désormais le stock réel.
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.mName, styles.tableHeaderText]}>Produit</Text>
            <Text style={[styles.mBefore, styles.tableHeaderText]}>Stock avant</Text>
            <Text style={[styles.mAfter, styles.tableHeaderText]}>Stock après</Text>
            <Text style={[styles.mDelta, styles.tableHeaderText]}>Écart</Text>
            <Text style={[styles.mValue, styles.tableHeaderText]}>Valeur</Text>
          </View>
          {modified.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.tableText}>Aucun produit modifié : le stock système était conforme au comptage.</Text>
            </View>
          ) : (
            modified.map((row) => {
              const loss = (row.delta ?? 0) < 0;
              return (
                <View key={row.lineId} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.mName, styles.tableText]}>{productLabel(row)}</Text>
                  <Text style={[styles.mBefore, styles.tableText]}>{row.stockBefore}</Text>
                  <Text style={[styles.mAfter, styles.tableText]}>{row.stockAfter}</Text>
                  <Text style={[styles.mDelta, styles.tableText, loss ? styles.badText : styles.okText, { fontWeight: "bold" }]}>
                    {signed(row.delta ?? 0)}
                  </Text>
                  {/* Une perte sans lot d'achat (stock hérité d'avant le suivi par lot) vaut 0 : pas de "-0 FCFA". */}
                  <Text style={[styles.mValue, styles.tableText, !row.valuation ? styles.mutedText : loss ? styles.badText : styles.okText]}>
                    {!row.valuation ? "0 FCFA" : `${loss ? "-" : "+"}${formatFCFA(row.valuation)}`}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Écarts constatés mais NON appliqués */}
        {notApplied.length > 0 && (
          <View style={styles.notesBox} wrap={false}>
            <Text style={styles.notesTitle}>Écarts non appliqués ({notApplied.length})</Text>
            <Text style={styles.infoText}>
              Le stock de ces produits a changé (ravitaillement reçu, remise pharmacie...) après leur comptage : aucun ajustement n&apos;a été appliqué. Ils doivent être recomptés lors d&apos;un prochain inventaire.
            </Text>
            <Text style={[styles.infoText, { marginTop: 4 }]}>
              {notApplied.map((row) => `${productLabel(row)} (compté ${row.countedQuantity}, système ${row.systemQuantity})`).join(" ; ")}
            </Text>
          </View>
        )}

        <View style={styles.footer} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLine}>Signature du Pharmacien</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLine}>Signature du Responsable / Coordinateur</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
