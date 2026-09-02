"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 90,
    paddingLeft: 50,
    paddingRight: 50,
    fontFamily: "Helvetica",
    color: "#1e293b",
    fontSize: 10,
    lineHeight: 1.6,
  },
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0284c7",
    paddingBottom: 20,
    marginBottom: 25,
  },
  clinicInfo: {
    flexDirection: "column",
  },
  logoImage: {
    width: 38,
    height: 38,
    objectFit: "contain",
    marginBottom: 4,
  },
  clinicName: {
    fontSize: 14,
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
    marginBottom: 25,
  },
  patientTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#334155",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  patientGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  patientCol: {
    width: "50%",
    marginBottom: 4,
  },
  contentSection: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 3,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  bodyText: {
    fontSize: 10,
    color: "#334155",
    marginBottom: 10,
    whiteSpace: "pre-wrap",
  },
  prescriptionBox: {
    marginTop: 15,
    borderWidth: 1.5,
    borderColor: "#0284c7",
    borderRadius: 6,
    padding: 15,
    backgroundColor: "#f0f9ff",
  },
  prescriptionHeader: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0369a1",
    borderBottomWidth: 1,
    borderBottomColor: "#bae6fd",
    paddingBottom: 6,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  signArea: {
    marginTop: 50,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  signBox: {
    width: 200,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    paddingTop: 8,
    textAlign: "center",
  },
  signTitle: {
    fontSize: 8,
    color: "#64748b",
  },
  signName: {
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
  },
});

interface ConsultationPDFDocumentProps {
  patient: any;
  record: any;
  organizationName?: string;
  organizationLogoUrl?: string | null;
}

export default function ConsultationPDFDocument({ patient, record, organizationName, organizationLogoUrl }: ConsultationPDFDocumentProps) {
  const age = patient.dateOfBirth
    ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()
    : "N/A";

  const formattedDate = new Date(record.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Extract prescription portion from the description if it contains "**Ordonnance :**"
  const rawDescription = record.description || "";
  let notesText = rawDescription;
  let prescriptionText = "";

  const ordonnanceIndex = rawDescription.indexOf("**Ordonnance :**");
  if (ordonnanceIndex !== -1) {
    notesText = rawDescription.substring(0, ordonnanceIndex).trim();
    prescriptionText = rawDescription.substring(ordonnanceIndex + "**Ordonnance :**".length).trim();
  }

  // Helper to clean markdown headers (e.g. **Symptômes / Observations :**)
  const cleanMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "$1") // remove bold asterisks
      .replace(/-\s/g, "• ") // replace hyphens with bullets
      .trim();
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Letterhead — fixed : répété identique sur chaque page */}
        <View style={styles.letterhead} fixed>
          <View style={styles.clinicInfo}>
            {organizationLogoUrl && <Image src={organizationLogoUrl} style={styles.logoImage} />}
            <Text style={styles.clinicName}>{organizationName || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.clinicSub}>Services de Soins Médicaux Coordonnés</Text>
          </View>
          <View style={styles.docTitleContainer}>
            <Text style={styles.docTitle}>RAPPORT DE CONSULTATION</Text>
            <Text style={styles.docDate}>Date : {formattedDate}</Text>
          </View>
        </View>

        {/* Patient Identity Card */}
        <View style={styles.patientCard}>
          <Text style={styles.patientTitle}>Informations Patient</Text>
          <View style={styles.patientGrid}>
            <View style={styles.patientCol}>
              <Text><Text style={{ fontWeight: "bold" }}>Nom complet :</Text> {patient.user?.lastName?.toUpperCase()} {patient.user?.firstName}</Text>
            </View>
            <View style={styles.patientCol}>
              <Text><Text style={{ fontWeight: "bold" }}>Date de Naissance :</Text> {new Date(patient.dateOfBirth).toLocaleDateString("fr-FR")} ({age} ans)</Text>
            </View>
            <View style={styles.patientCol}>
              <Text><Text style={{ fontWeight: "bold" }}>Niveau de dépendance :</Text> {patient.dependencyLevel} / 5</Text>
            </View>
            <View style={styles.patientCol}>
              <Text><Text style={{ fontWeight: "bold" }}>Contact Urgence :</Text> {patient.emergencyContact || "Aucun"}</Text>
            </View>
          </View>
        </View>

        {/* Clinical Notes Section */}
        <View style={styles.contentSection}>
          <Text style={styles.sectionHeading}>Observations Cliniques & Diagnostic</Text>
          <Text style={styles.bodyText}>{cleanMarkdown(notesText)}</Text>
        </View>

        {/* Prescription Box if medications are found */}
        {prescriptionText ? (
          <View style={styles.prescriptionBox}>
            <Text style={styles.prescriptionHeader}>Ordonnance Médicale</Text>
            <Text style={[styles.bodyText, { marginBottom: 0, fontStyle: "italic" }]}>
              {cleanMarkdown(prescriptionText)}
            </Text>
          </View>
        ) : null}

        {/* Signature Area */}
        <View style={styles.signArea}>
          <View style={styles.signBox}>
            <Text style={styles.signTitle}>Signature du Praticien Coordinateur</Text>
            <Text style={styles.signName}>Visa MedDoc Clinique</Text>
          </View>
        </View>

        {/* Footer — fixed + position absolute : répété identique en bas de chaque page, avec
            un paddingBottom de page assez grand (90, ce footer tenant sur 2 lignes) pour ne
            jamais chevaucher le contenu. */}
        <View style={styles.footer} fixed>
          <Text>Ce document contient des informations médicales confidentielles soumises au secret professionnel.</Text>
          <Text style={{ marginTop: 2 }}>MedDoc SAS - Éditeur de Logiciels Médicaux Certifiés</Text>
        </View>
      </Page>
    </Document>
  );
}
