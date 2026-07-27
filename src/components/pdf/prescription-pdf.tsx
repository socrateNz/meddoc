"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 45,
    fontFamily: "Helvetica",
    color: "#1e293b",
    fontSize: 10,
    lineHeight: 1.5,
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#0284c7",
    paddingBottom: 15,
    marginBottom: 20,
  },
  clinicInfo: {
    flexDirection: "column",
  },
  clinicName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0f172a",
  },
  clinicSub: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  docTitleContainer: {
    textAlign: "right",
  },
  docTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0284c7",
    textTransform: "uppercase",
  },
  docDate: {
    fontSize: 9,
    color: "#64748b",
    marginTop: 4,
  },
  patientCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
  },
  patientTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#475569",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  patientGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  patientCol: {
    width: "48%",
  },
  rxHeader: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0284c7",
    marginBottom: 10,
    fontFamily: "Helvetica-Bold",
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    marginBottom: 25,
    overflow: "hidden",
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
    padding: 10,
  },
  colName: {
    width: "35%",
    fontWeight: "bold",
    color: "#0f172a",
  },
  colDosage: {
    width: "25%",
    color: "#334155",
  },
  colFreq: {
    width: "20%",
    color: "#334155",
  },
  colInstructions: {
    width: "20%",
    color: "#64748b",
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  instructionsBox: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 6,
    padding: 10,
    marginBottom: 30,
  },
  instructionsTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#1e40af",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  instructionsText: {
    fontSize: 9,
    color: "#1e3a8a",
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
    width: "45%",
    textAlign: "center",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    marginTop: 45,
    paddingTop: 4,
    fontSize: 8,
    color: "#64748b",
  },
  watermark: {
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 25,
  }
});

interface PrescriptionPDFProps {
  patient: any;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    instructions?: string;
  }>;
  doctorName?: string;
  organizationName?: string;
  date?: string | Date;
}

export default function PrescriptionPDFDocument({ patient, medications = [], doctorName, organizationName, date }: PrescriptionPDFProps) {
  const formattedDate = date
    ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(date))
    : new Date().toLocaleDateString("fr-FR");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Letterhead */}
        <View style={styles.letterhead}>
          <View style={styles.clinicInfo}>
            <Text style={styles.clinicName}>{organizationName || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.clinicSub}>Plateforme de Santé & Gestion Médicale</Text>
          </View>
          <View style={styles.docTitleContainer}>
            <Text style={styles.docTitle}>Ordonnance Médicale</Text>
            <Text style={styles.docDate}>Date : {formattedDate}</Text>
          </View>
        </View>

        {/* Patient Card */}
        <View style={styles.patientCard}>
          <Text style={styles.patientTitle}>Informations Patient</Text>
          <View style={styles.patientGrid}>
            <View style={styles.patientCol}>
              <Text style={{ fontWeight: "bold" }}>
                Patient : {patient?.user ? `${patient.user.lastName} ${patient.user.firstName}` : "Non spécifié"}
              </Text>
              {patient?.dateOfBirth && (
                <Text style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                  Né(e) le : {new Date(patient.dateOfBirth).toLocaleDateString("fr-FR")}
                </Text>
              )}
            </View>
            <View style={styles.patientCol}>
              {doctorName && (
                <Text style={{ fontWeight: "bold", textAlign: "right" }}>
                  Médecin prescripteur : {doctorName}
                </Text>
              )}
              {patient?.allergies && patient.allergies.length > 0 && (
                <Text style={{ fontSize: 9, color: "#dc2626", textAlign: "right", marginTop: 2 }}>
                  Allergies connues : {Array.isArray(patient.allergies) ? patient.allergies.join(", ") : patient.allergies}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Rx Symbol */}
        <Text style={styles.rxHeader}>Rx / Prescriptions :</Text>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colName, styles.tableHeaderText]}>Médicament / Produit</Text>
            <Text style={[styles.colDosage, styles.tableHeaderText]}>Dosage</Text>
            <Text style={[styles.colFreq, styles.tableHeaderText]}>Fréquence / Durée</Text>
            <Text style={[styles.colInstructions, styles.tableHeaderText]}>Instructions</Text>
          </View>

          {medications.map((med, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colName}>{med.name}</Text>
              <Text style={styles.colDosage}>{med.dosage}</Text>
              <Text style={styles.colFreq}>{med.frequency}</Text>
              <Text style={styles.colInstructions}>{med.instructions || "-"}</Text>
            </View>
          ))}
        </View>

        {/* Instructions general */}
        <View style={styles.instructionsBox}>
          <Text style={styles.instructionsTitle}>Conseils & Recommandations</Text>
          <Text style={styles.instructionsText}>
            Veuillez respecter scrupuleusement les doses prescrites. Présentez cette ordonnance à votre pharmacie pour l'obtention des traitements.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.footer}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLine}>Cachet de l'Établissement</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLine}>Signature du Médecin Prescripteur</Text>
          </View>
        </View>

        <Text style={styles.watermark}>
          Ordonnance officielle générée via MedDoc • Document sécurisé
        </Text>
      </Page>
    </Document>
  );
}
