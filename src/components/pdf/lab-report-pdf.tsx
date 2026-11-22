"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { isFieldAbnormal, parseStoredResult, referenceText, SUSCEPTIBILITY_LABELS, type StoredResultData, type Susceptibility } from "@/lib/lab-templates";

const styles = StyleSheet.create({
  page: {
    paddingTop: 45,
    paddingBottom: 65,
    paddingLeft: 45,
    paddingRight: 45,
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
  logoImage: {
    width: 38,
    height: 38,
    objectFit: "contain",
    marginBottom: 4,
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
  reportNumber: {
    fontSize: 8,
    color: "#94a3b8",
    marginTop: 2,
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0284c7",
    marginBottom: 8,
  },
  testBlock: {
    marginBottom: 14,
  },
  testName: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0f172a",
    backgroundColor: "#f1f5f9",
    padding: 6,
    borderRadius: 4,
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    marginTop: 4,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    padding: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    padding: 8,
  },
  colValue: { width: "25%", color: "#0f172a", fontWeight: "bold" },
  colUnit: { width: "15%", color: "#334155" },
  colRange: { width: "30%", color: "#64748b" },
  colFlag: { width: "30%", color: "#dc2626" },
  tableHeaderText: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  footer: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 15,
  },
  signatureBox: {
    width: "55%",
  },
  signatureLine: {
    fontSize: 8,
    color: "#334155",
    marginTop: 2,
  },
  qrBox: {
    alignItems: "center",
  },
  qrImage: {
    width: 70,
    height: 70,
  },
  qrLabel: {
    fontSize: 6,
    color: "#94a3b8",
    marginTop: 3,
    textAlign: "center",
  },
  // Petit pied de page répété identique sur chaque page (fixed) — distinct du bloc
  // signature/QR ci-dessus, qui lui n'apparaît qu'une fois, là où le contenu se termine
  // réellement (généralement la dernière page), comme une signature de document classique.
  pageFooter: {
    position: "absolute",
    bottom: 20,
    left: 45,
    right: 45,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
});

const sx = StyleSheet.create({
  reportTitle: { fontSize: 9, fontWeight: "bold", textAlign: "center", marginTop: 6, marginBottom: 4, textTransform: "uppercase" },
  technique: { fontSize: 8, color: "#475569", marginBottom: 4 },
  sectionTitle: { fontSize: 8, fontWeight: "bold", color: "#0284c7", textTransform: "uppercase", marginTop: 6, marginBottom: 2 },
  line: { flexDirection: "row", fontSize: 9, paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", borderBottomStyle: "dashed" },
  lineLabel: { width: "55%", color: "#334155" },
  lineValue: { width: "45%", fontWeight: "bold" },
  tRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3, paddingHorizontal: 4 },
  tHead: { flexDirection: "row", backgroundColor: "#f8fafc", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingVertical: 3, paddingHorizontal: 4 },
  cParam: { width: "38%" },
  cValue: { width: "22%", fontWeight: "bold" },
  cRef: { width: "25%", color: "#64748b" },
  cUnit: { width: "15%", color: "#64748b" },
  headText: { fontSize: 7, fontWeight: "bold", color: "#475569", textTransform: "uppercase" },
  abnormal: { color: "#dc2626" },
  conclusion: { fontSize: 9, marginTop: 6 },
  note: { fontSize: 7.5, color: "#92400e", marginTop: 4 },
  susRow: { flexDirection: "row", marginTop: 2 },
  susCol: { width: "33%", fontSize: 8, paddingRight: 4 },
});

// Compte rendu structuré (modèle du catalogue) : sections en tableau ou en lignes, germe,
// antibiogramme / antifongigramme, conclusion et note.
function StructuredResultPdf({ result }: { result: StoredResultData }) {
  const { template } = result;
  const sus = (title: string, values?: Record<string, Susceptibility>) => {
    if (!values || Object.keys(values).length === 0) return null;
    const by = (k: Susceptibility) => Object.entries(values).filter(([, v]) => v === k).map(([d]) => d);
    return (
      <View wrap={false}>
        <Text style={sx.sectionTitle}>{title}</Text>
        <View style={sx.susRow}>
          {(["S", "I", "R"] as const).map((k) => (
            <View key={k} style={sx.susCol}>
              <Text style={{ fontWeight: "bold", fontSize: 7.5 }}>{SUSCEPTIBILITY_LABELS[k].toUpperCase()}</Text>
              {by(k).map((d) => (
                <Text key={d}>{d}</Text>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  };
  return (
    <View>
      {template.title ? <Text style={sx.reportTitle}>{template.title}</Text> : null}
      {template.technique ? <Text style={sx.technique}>Technique : {template.technique}</Text> : null}
      {template.sections.map((section, si) => {
        const rows = section.fields.filter((f) => (result.values[f.key] ?? "").trim() !== "");
        if (rows.length === 0) return null;
        if (section.layout === "table") {
          return (
            <View key={si} wrap={false}>
              {section.title ? <Text style={sx.sectionTitle}>{section.title}</Text> : null}
              <View style={sx.tHead}>
                <Text style={[sx.cParam, sx.headText]}>Paramètre</Text>
                <Text style={[sx.cValue, sx.headText]}>Résultat</Text>
                <Text style={[sx.cRef, sx.headText]}>Valeurs de référence</Text>
                <Text style={[sx.cUnit, sx.headText]}>Unité</Text>
              </View>
              {rows.map((f) => {
                const v = result.values[f.key];
                return (
                  <View key={f.key} style={sx.tRow}>
                    <Text style={sx.cParam}>{f.label}</Text>
                    <Text style={isFieldAbnormal(f, v) ? [sx.cValue, sx.abnormal] : sx.cValue}>{v}</Text>
                    <Text style={sx.cRef}>{referenceText(f) || "-"}</Text>
                    <Text style={sx.cUnit}>{f.type !== "text" && f.unit ? f.unit : "-"}</Text>
                  </View>
                );
              })}
            </View>
          );
        }
        return (
          <View key={si}>
            {section.title ? <Text style={sx.sectionTitle}>{section.title}</Text> : null}
            {rows.map((f) => {
              const v = result.values[f.key];
              const unit = f.type !== "text" && f.unit ? ` ${f.unit}` : "";
              const ref = referenceText(f);
              return (
                <View key={f.key} style={sx.line} wrap={false}>
                  <Text style={sx.lineLabel}>{f.label}</Text>
                  <Text style={isFieldAbnormal(f, v) ? [sx.lineValue, sx.abnormal] : sx.lineValue}>
                    {v}
                    {unit}
                    {ref ? ` (réf. ${ref})` : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
      {result.germ ? (
        <Text style={sx.conclusion}>
          <Text style={{ fontWeight: "bold" }}>Germe(s) identifié(s) : </Text>
          {result.germ}
        </Text>
      ) : null}
      {sus("Antibiogramme", result.antibiogram)}
      {sus("Antifongigramme", result.antifungigram)}
      {result.conclusion ? (
        <Text style={sx.conclusion}>
          <Text style={{ fontWeight: "bold" }}>CONCLUSION : </Text>
          {result.conclusion}
        </Text>
      ) : null}
      {template.note ? <Text style={sx.note}>N.B. : {template.note}</Text> : null}
    </View>
  );
}

function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function calculateAge(birthDate: Date) {
  const today = new Date();
  let age = today.getFullYear() - new Date(birthDate).getFullYear();
  const m = today.getMonth() - new Date(birthDate).getMonth();
  if (m < 0 || (m === 0 && today.getDate() < new Date(birthDate).getDate())) age--;
  return age;
}

interface LabReportPDFProps {
  order: any;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  reportNumber: string;
  qrDataUrl?: string;
}

export default function LabReportPDFDocument({ order, organizationName, organizationLogoUrl, reportNumber, qrDataUrl }: LabReportPDFProps) {
  const patient = order.patient;
  // Examen d'une clinique partenaire : le rapport sort à SON en-tête (nom, logo, coordonnées), la
  // clinique qui a réalisé les analyses n'apparaissant qu'en mention.
  const partner = order.partner as { name: string; logoUrl?: string | null; address?: string | null; phone?: string | null; email?: string | null } | null | undefined;
  const headerName = partner?.name || organizationName || "MEDDOC - CENTRE MÉDICAL";
  const headerLogo = partner ? partner.logoUrl : organizationLogoUrl;
  const partnerContact = partner ? [partner.address, partner.phone, partner.email].filter(Boolean).join(" • ") : "";
  const resultsByTest = (order.results || []).reduce((acc: Record<string, any[]>, r: any) => {
    (acc[r.testName] ||= []).push(r);
    return acc;
  }, {});
  const lastValidation = (order.results || [])
    .filter((r: any) => r.validatedAt)
    .sort((a: any, b: any) => new Date(b.validatedAt).getTime() - new Date(a.validatedAt).getTime())[0];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* fixed : répété identique sur chaque page */}
        <View style={styles.letterhead} fixed>
          <View style={styles.clinicInfo}>
            {headerLogo && <Image src={headerLogo} style={styles.logoImage} />}
            <Text style={styles.clinicName}>{headerName}</Text>
            {partnerContact ? <Text style={styles.clinicSub}>{partnerContact}</Text> : null}
            <Text style={styles.clinicSub}>
              {partner ? `Analyses réalisées par ${organizationName || "le laboratoire"}` : "Laboratoire d'Analyses Médicales"}
            </Text>
          </View>
          <View style={styles.docTitleContainer}>
            <Text style={styles.docTitle}>Rapport d&apos;Analyses</Text>
            <Text style={styles.docDate}>Édité le : {formatDateTime(new Date())}</Text>
            <Text style={styles.reportNumber}>N° {reportNumber}</Text>
          </View>
        </View>

        <View style={styles.patientCard}>
          <Text style={styles.patientTitle}>Informations Patient</Text>
          <View style={styles.patientGrid}>
            <View style={styles.patientCol}>
              <Text style={{ fontWeight: "bold" }}>
                Patient : {patient?.user ? `${patient.user.lastName} ${patient.user.firstName}` : "Non spécifié"}
              </Text>
              {patient?.ipp ? <Text>IPP : {patient.ipp}</Text> : null}
              {patient?.dateOfBirth && (
                <Text style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                  {calculateAge(patient.dateOfBirth)} ans{patient?.sex ? ` • ${patient.sex}` : ""}
                </Text>
              )}
              {patient?.bloodType && (
                <Text style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>Groupe sanguin : {patient.bloodType}</Text>
              )}
            </View>
            <View style={styles.patientCol}>
              <Text style={{ fontWeight: "bold", textAlign: "right" }}>
                {partner
                  ? `Demande de : ${partner.name}`
                  : `Prescripteur : ${order.orderedBy?.firstName ?? ""} ${order.orderedBy?.lastName ?? ""}`}
              </Text>
              {partner && order.partnerReference ? (
                <Text style={{ fontSize: 9, color: "#64748b", textAlign: "right", marginTop: 2 }}>Bon n° {order.partnerReference}</Text>
              ) : null}
              {order.notes ? (
                <Text style={{ fontSize: 9, color: "#64748b", textAlign: "right", marginTop: 2 }}>Renseignement clinique : {order.notes}</Text>
              ) : null}
              {order.sampleCollectedAt && (
                <Text style={{ fontSize: 9, color: "#64748b", textAlign: "right", marginTop: 2 }}>
                  Prélevé le : {formatDateTime(order.sampleCollectedAt)}
                </Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Résultats des Analyses</Text>

        {order.tests.map((testName: string) => {
          const results: any[] = resultsByTest[testName] || [];
          if (results.length === 0) return null;
          // Compte rendu structuré : rendu selon son modèle (il peut s'étendre sur plusieurs pages).
          const structured = results.map((r) => parseStoredResult(r.data)).find(Boolean);
          if (structured) {
            return (
              <View key={testName} style={styles.testBlock}>
                <Text style={styles.testName} minPresenceAhead={60}>{testName}</Text>
                <StructuredResultPdf result={structured} />
              </View>
            );
          }
          return (
            <View key={testName} style={styles.testBlock} wrap={false}>
              <Text style={styles.testName}>{testName}</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.colValue, styles.tableHeaderText]}>Résultat</Text>
                  <Text style={[styles.colUnit, styles.tableHeaderText]}>Unité</Text>
                  <Text style={[styles.colRange, styles.tableHeaderText]}>Valeurs de référence</Text>
                  <Text style={[styles.colFlag, styles.tableHeaderText]}>Observation</Text>
                </View>
                {results.map((r) => (
                  <View key={r.id} style={styles.tableRow}>
                    <Text style={styles.colValue}>{r.value}</Text>
                    <Text style={styles.colUnit}>{r.unit || "-"}</Text>
                    <Text style={styles.colRange}>{r.referenceRange || "-"}</Text>
                    <Text style={styles.colFlag}>{r.isAbnormal ? "Anormal" : "Normal"}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.footer}>
          <View style={styles.signatureBox}>
            <Text style={{ fontSize: 8, fontWeight: "bold", color: "#475569" }}>Validation biologique</Text>
            <Text style={styles.signatureLine}>
              {lastValidation ? `Validé par ${lastValidation.validatedBy?.firstName || ""} ${lastValidation.validatedBy?.lastName || ""} le ${formatDateTime(lastValidation.validatedAt)}` : "Résultats en attente de validation"}
            </Text>
          </View>
          {qrDataUrl && (
            <View style={styles.qrBox}>
              <Image src={qrDataUrl} style={styles.qrImage} />
              <Text style={styles.qrLabel}>Vérification du document</Text>
            </View>
          )}
        </View>

        {/* fixed : répété identique en bas de chaque page (distinct du bloc signature/QR
            ci-dessus, qui n'apparaît qu'une fois à la fin réelle du contenu) */}
        <View style={styles.pageFooter} fixed>
          <Text>Rapport officiel généré via MedDoc • Document sécurisé • {reportNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}
