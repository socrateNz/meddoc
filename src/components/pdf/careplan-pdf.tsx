"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    color: "#334155",
    fontSize: 9,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#10b981", // Emerald theme for care plans
    paddingBottom: 12,
    marginBottom: 20,
  },
  logoContainer: {
    flexDirection: "column",
  },
  logo: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#10b981",
  },
  subtitle: {
    fontSize: 8,
    color: "#64748b",
  },
  titleContainer: {
    textAlign: "right",
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e293b",
  },
  planMeta: {
    fontSize: 8,
    color: "#64748b",
  },
  patientBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  patientName: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e293b",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#065f46",
    backgroundColor: "#ecfdf5",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  table: {
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRowHeader: {
    backgroundColor: "#f1f5f9",
    fontWeight: "bold",
    borderBottomWidth: 1.5,
    borderBottomColor: "#cbd5e1",
  },
  colName: { width: "30%" },
  colDosage: { width: "20%" },
  colFreq: { width: "20%" },
  colInstructions: { width: "30%" },
  
  colTaskTitle: { width: "35%" },
  colTaskDesc: { width: "35%" },
  colTaskDate: { width: "15%" },
  colTaskStatus: { width: "15%" },

  badgeActive: {
    backgroundColor: "#d1fae5",
    color: "#065f46",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 7,
    fontWeight: "bold",
  },
  badgeCompleted: {
    backgroundColor: "#e2e8f0",
    color: "#475569",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 7,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
  },
});

interface CarePlanPDFDocumentProps {
  patient: any;
  plan: any;
}

export default function CarePlanPDFDocument({ patient, plan }: CarePlanPDFDocumentProps) {
  const formattedStartDate = new Date(plan.startDate).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  
  const formattedEndDate = plan.endDate
    ? new Date(plan.endDate).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Indéterminée";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>MedDoc</Text>
            <Text style={styles.subtitle}>Planification et Protocole Clinique</Text>
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>PLAN DE SOINS INDIVIDUEL</Text>
            <Text style={styles.planMeta}>Statut : {plan.status === "ACTIVE" ? "ACTIF" : plan.status}</Text>
          </View>
        </View>

        {/* Patient Identity */}
        <View style={styles.patientBox}>
          <View>
            <Text style={styles.patientName}>
              Patient : {patient.user?.lastName?.toUpperCase()} {patient.user?.firstName}
            </Text>
            <Text style={{ marginTop: 2, color: "#64748b", fontSize: 8 }}>
              Né(e) le : {new Date(patient.dateOfBirth).toLocaleDateString("fr-FR")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8, color: "#64748b" }}>Période de Validité</Text>
            <Text style={{ fontWeight: "bold", fontSize: 8 }}>
              Du {formattedStartDate} au {formattedEndDate}
            </Text>
          </View>
        </View>

        {/* Plan Main Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objectif du protocole</Text>
          <Text style={{ fontSize: 10, fontWeight: "bold", color: "#1e293b", marginBottom: 4 }}>
            {plan.title}
          </Text>
          <Text style={{ color: "#475569" }}>
            Ce plan de soins régit l'ensemble des interventions quotidiennes, des soins et des prises médicamenteuses requises pour la prise en charge clinique du patient au sein de l'établissement dans des conditions de sécurité optimales.
          </Text>
        </View>

        {/* Medications Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Traitements et Médicaments associés</Text>
          {plan.medications?.length > 0 ? (
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableRowHeader]}>
                <View style={styles.colName}><Text style={{ fontWeight: "bold" }}>Médicament</Text></View>
                <View style={styles.colDosage}><Text style={{ fontWeight: "bold" }}>Dosage</Text></View>
                <View style={styles.colFreq}><Text style={{ fontWeight: "bold" }}>Fréquence</Text></View>
                <View style={styles.colInstructions}><Text style={{ fontWeight: "bold" }}>Instructions</Text></View>
              </View>
              {plan.medications.map((med: any) => (
                <View key={med.id} style={styles.tableRow}>
                  <View style={styles.colName}><Text>{med.name}</Text></View>
                  <View style={styles.colDosage}><Text>{med.dosage}</Text></View>
                  <View style={styles.colFreq}><Text>{med.frequency}</Text></View>
                  <View style={styles.colInstructions}><Text>{med.instructions || "N/A"}</Text></View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontStyle: "italic", color: "#64748b", fontSize: 9 }}>
              Aucun traitement ou médicament n'est inscrit dans ce plan.
            </Text>
          )}
        </View>

        {/* Tasks Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tâches et protocole de soins cliniques</Text>
          {plan.tasks?.length > 0 ? (
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableRowHeader]}>
                <View style={styles.colTaskTitle}><Text style={{ fontWeight: "bold" }}>Tâche / Soin</Text></View>
                <View style={styles.colTaskDesc}><Text style={{ fontWeight: "bold" }}>Protocole / Description</Text></View>
                <View style={styles.colTaskDate}><Text style={{ fontWeight: "bold" }}>Date Planifiée</Text></View>
                <View style={styles.colTaskStatus}><Text style={{ fontWeight: "bold" }}>Statut</Text></View>
              </View>
              {plan.tasks.map((task: any) => (
                <View key={task.id} style={styles.tableRow}>
                  <View style={styles.colTaskTitle}><Text>{task.title}</Text></View>
                  <View style={styles.colTaskDesc}><Text>{task.description || "N/A"}</Text></View>
                  <View style={styles.colTaskDate}>
                    <Text>{new Date(task.scheduledFor).toLocaleDateString("fr-FR")}</Text>
                  </View>
                  <View style={styles.colTaskStatus}>
                    <Text style={task.status === "COMPLETED" ? styles.badgeCompleted : styles.badgeActive}>
                      {task.status === "COMPLETED" ? "Terminée" : "À faire"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontStyle: "italic", color: "#64748b", fontSize: 9 }}>
              Aucune tâche de soins planifiée pour le moment.
            </Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Document Médical Confidentiel - Coordination MedDoc</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
