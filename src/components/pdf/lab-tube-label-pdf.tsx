"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { TubeLabelData } from "@/lib/lab-label";

// Étiquette de tube de prélèvement, format 60 × 30 mm (étiqueteuses thermiques courantes) : une
// page par étiquette, toutes identiques — une par tube prélevé. Le code-barres (Code 128 de la
// référence de la demande) est généré en image par l'appelant (cf. pdf-download-button.tsx).
const MM = 72 / 25.4;
const LABEL_SIZE: [number, number] = [60 * MM, 30 * MM];

const styles = StyleSheet.create({
  page: {
    padding: 5,
    fontFamily: "Helvetica",
    color: "#0f172a",
    fontSize: 6,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  name: {
    fontSize: 8,
    fontWeight: "bold",
    maxWidth: "78%",
  },
  urgent: {
    fontSize: 6,
    fontWeight: "bold",
    color: "#ffffff",
    backgroundColor: "#dc2626",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  identity: {
    marginTop: 1,
    fontSize: 6.5,
  },
  barcode: {
    marginTop: 2,
    height: 22,
    objectFit: "contain",
  },
  bottomRow: {
    marginTop: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reference: {
    fontSize: 6.5,
    fontWeight: "bold",
  },
  muted: {
    fontSize: 5.5,
    color: "#334155",
  },
});

interface LabTubeLabelPDFProps {
  label: TubeLabelData;
  barcodeDataUrl: string;
  copies?: number;
}

export default function LabTubeLabelPDFDocument({ label, barcodeDataUrl, copies = 1 }: LabTubeLabelPDFProps) {
  const identity = [label.ipp, label.birthDate ? `Né(e) le ${label.birthDate}` : null, label.sex].filter(Boolean).join(" • ");
  return (
    <Document title={`Étiquette ${label.reference}`}>
      {Array.from({ length: Math.max(1, copies) }, (_, i) => (
        <Page key={i} size={LABEL_SIZE} style={styles.page}>
          <View style={styles.topRow}>
            <Text style={styles.name}>{label.patientName}</Text>
            {label.priority === "URGENT" && <Text style={styles.urgent}>URGENT</Text>}
          </View>
          {identity ? <Text style={styles.identity}>{identity}</Text> : null}
          <Image src={barcodeDataUrl} style={styles.barcode} />
          <View style={styles.bottomRow}>
            <Text style={styles.reference}>{label.reference}</Text>
            <Text style={styles.muted}>
              {label.sampleType}
              {label.collectedAt ? ` • ${label.collectedAt}` : ""}
            </Text>
          </View>
          {label.tests ? (
            <Text style={styles.muted} wrap={false}>
              {label.tests.length > 60 ? `${label.tests.slice(0, 57)}…` : label.tests}
            </Text>
          ) : null}
        </Page>
      ))}
    </Document>
  );
}
