"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";

// Styles
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    color: "#0f172a",
    fontSize: 10,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#3b82f6",
    paddingBottom: 15,
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: "column",
  },
  logoImage: {
    width: 40,
    height: 40,
    objectFit: "contain",
    marginBottom: 4,
  },
  logo: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#3b82f6",
  },
  subtitle: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  headerRight: {
    textAlign: "right",
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0f172a",
  },
  date: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1e3a8a",
    backgroundColor: "#eff6ff",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 5,
  },
  gridCol: {
    width: "50%",
    paddingRight: 10,
    marginBottom: 8,
  },
  label: {
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
  },
  value: {
    fontSize: 10,
    fontWeight: "semibold",
  },
  badgeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 5,
  },
  badge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 5,
    marginBottom: 5,
    fontSize: 8,
    color: "#475569",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  badgeAlert: {
    backgroundColor: "#fef2f2",
    color: "#dc2626",
    borderColor: "#fee2e2",
  },
  table: {
    flexDirection: "column",
    marginTop: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 6,
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1.5,
    borderBottomColor: "#cbd5e1",
    fontWeight: "bold",
  },
  tableCol1: {
    width: "40%",
  },
  tableCol2: {
    width: "30%",
  },
  tableCol3: {
    width: "30%",
  },
  tableText: {
    fontSize: 9,
  },
  recordCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
  },
  recordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
    marginBottom: 6,
  },
  recordTitle: {
    fontWeight: "bold",
    fontSize: 10,
  },
  recordDate: {
    fontSize: 8,
    color: "#64748b",
  },
  recordContent: {
    fontSize: 9,
    color: "#334155",
  },
  // Bloc signature — normal flow (pas fixed) : apparaît une seule fois, là où le contenu se
  // termine réellement, contrairement à l'en-tête/pied de page qui eux se répètent.
  signArea: {
    marginTop: 30,
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

interface PatientPDFDocumentProps {
  patient: any;
  organizationName?: string;
  organizationLogoUrl?: string | null;
}

export default function PatientPDFDocument({ patient, organizationName, organizationLogoUrl }: PatientPDFDocumentProps) {
  const age = patient.dateOfBirth
    ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()
    : "N/A";
    
  const formattedDob = patient.dateOfBirth
    ? new Date(patient.dateOfBirth).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "N/A";

  const exportDate = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header — fixed : répété identique sur chaque page */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {organizationLogoUrl && <Image src={organizationLogoUrl} style={styles.logoImage} />}
            <Text style={styles.logo}>{organizationName || "MedDoc"}</Text>
            <Text style={styles.subtitle}>Plateforme de Gestion Clinique & Hospitalière</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>DOSSIER MÉDICAL</Text>
            <Text style={styles.date}>Exporté le {exportDate}</Text>
          </View>
        </View>

        {/* Patient Identity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>État Civil du Patient</Text>
          <View style={styles.grid}>
            <View style={styles.gridCol}>
              <Text style={styles.label}>Nom complet</Text>
              <Text style={styles.value}>
                {patient.user?.lastName?.toUpperCase()} {patient.user?.firstName}
              </Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={styles.label}>Niveau de dépendance</Text>
              <Text style={styles.value}>{patient.dependencyLevel} sur 5</Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={styles.label}>Date de naissance (Âge)</Text>
              <Text style={styles.value}>
                {formattedDob} ({age} ans)
              </Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={styles.label}>Téléphone</Text>
              <Text style={styles.value}>{patient.user?.phone || "Non spécifié"}</Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={styles.label}>Adresse domicile</Text>
              <Text style={styles.value}>{patient.address || "Non spécifié"}</Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={styles.label}>Contact d'urgence</Text>
              <Text style={styles.value}>{patient.emergencyContact || "Non spécifié"}</Text>
            </View>
          </View>
        </View>

        {/* Medical Profil */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profil Clinique</Text>
          <Text style={styles.label}>Pathologies diagnostiquées</Text>
          <View style={styles.badgeContainer}>
            {patient.pathologies?.length > 0 ? (
              patient.pathologies.map((path: string, i: number) => (
                <View key={i} style={styles.badge}>
                  <Text>{path}</Text>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 9, fontStyle: "italic", color: "#64748b" }}>
                Aucune pathologie signalée.
              </Text>
            )}
          </View>

          <Text style={[styles.label, { marginTop: 8 }]}>Allergies signalées</Text>
          <View style={styles.badgeContainer}>
            {patient.allergies?.length > 0 ? (
              patient.allergies.map((all: string, i: number) => (
                <View key={i} style={[styles.badge, styles.badgeAlert]}>
                  <Text>{all}</Text>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 9, fontStyle: "italic", color: "#64748b" }}>
                Aucune allergie signalée.
              </Text>
            )}
          </View>
        </View>

        {/* Care Plan section */}
        {patient.carePlans?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Plan de Soins Actif</Text>
            {patient.carePlans.map((plan: any, index: number) => {
              if (plan.status !== "ACTIVE" && index > 0) return null; // Only show active/first
              return (
                <View key={plan.id}>
                  <Text style={{ fontSize: 10, fontWeight: "bold", marginBottom: 5 }}>
                    {plan.title} (Depuis le {new Date(plan.startDate).toLocaleDateString("fr-FR")})
                  </Text>
                  
                  {plan.medications?.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={[styles.label, { marginBottom: 3 }]}>Traitements / Médicaments</Text>
                      <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                          <View style={styles.tableCol1}><Text style={{ fontWeight: "bold", fontSize: 8 }}>Médicament</Text></View>
                          <View style={styles.tableCol2}><Text style={{ fontWeight: "bold", fontSize: 8 }}>Dosage</Text></View>
                          <View style={styles.tableCol3}><Text style={{ fontWeight: "bold", fontSize: 8 }}>Fréquence</Text></View>
                        </View>
                        {plan.medications.map((med: any) => (
                          <View key={med.id} style={styles.tableRow}>
                            <View style={styles.tableCol1}><Text style={styles.tableText}>{med.name}</Text></View>
                            <View style={styles.tableCol2}><Text style={styles.tableText}>{med.dosage}</Text></View>
                            <View style={styles.tableCol3}><Text style={styles.tableText}>{med.frequency}</Text></View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {plan.tasks?.length > 0 && (
                    <View>
                      <Text style={[styles.label, { marginBottom: 3 }]}>Protocole & Tâches planifiées</Text>
                      {plan.tasks.slice(0, 5).map((task: any) => (
                        <Text key={task.id} style={{ fontSize: 9, color: "#334155", marginBottom: 2 }}>
                          - [{task.status === "COMPLETED" ? "X" : " "}] {task.title} {task.description ? `(${task.description})` : ""}
                        </Text>
                      ))}
                      {plan.tasks.length > 5 && (
                        <Text style={{ fontSize: 8, color: "#64748b", fontStyle: "italic", marginTop: 2 }}>
                          + {plan.tasks.length - 5} autres tâches planifiées.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Medical History / Records */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Comptes-rendus récents & Historique médical</Text>
          {patient.medicalRecords?.length > 0 ? (
            patient.medicalRecords.slice(0, 3).map((record: any) => (
              <View key={record.id} style={styles.recordCard}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordTitle}>{record.title}</Text>
                  <Text style={styles.recordDate}>
                    {new Date(record.createdAt).toLocaleDateString("fr-FR")}
                  </Text>
                </View>
                <Text style={styles.recordContent}>{record.description}</Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 9, fontStyle: "italic", color: "#64748b" }}>
              Aucun document ou compte-rendu dans le dossier.
            </Text>
          )}
          {patient.medicalRecords?.length > 3 && (
            <Text style={{ fontSize: 8, color: "#64748b", fontStyle: "italic", textAlign: "center" }}>
              Certaines pièces anciennes ont été omises du résumé (total de {patient.medicalRecords.length} documents).
            </Text>
          )}
        </View>

        {/* Signature du médecin */}
        <View style={styles.signArea}>
          <View style={styles.signBox}>
            <Text style={styles.signTitle}>Signature du Médecin</Text>
            <Text style={styles.signName}>Visa {organizationName || "MedDoc"}</Text>
          </View>
        </View>

        {/* Footer — fixed + position absolute : répété identique en bas de chaque page, avec
            un paddingBottom de page assez grand (60) pour que le contenu qui défile ne vienne
            jamais chevaucher cette zone réservée. */}
        <View style={styles.footer} fixed>
          <Text>Document Médical Confidentiel - MedDoc SaaS Platform</Text>
        </View>
      </Page>
    </Document>
  );
}
