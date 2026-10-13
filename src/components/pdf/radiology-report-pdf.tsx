"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

// Compte-rendu d'imagerie validé — données de getRadiologyOrder (src/actions/radiology.ts). Même
// charte que le compte-rendu de laboratoire. Pas de lineHeight sur la Page (il masquerait le pied
// de page fixe, cf. finance-journal-pdf.tsx).
const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontFamily: "Helvetica", fontSize: 10, color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#2563eb", paddingBottom: 12, marginBottom: 16 },
  logo: { width: 40, height: 40, objectFit: "contain", marginBottom: 4 },
  orgName: { fontSize: 15, fontWeight: "bold" },
  orgSub: { fontSize: 8, color: "#64748b", marginTop: 3 },
  title: { fontSize: 14, fontWeight: "bold", color: "#2563eb", textTransform: "uppercase", textAlign: "right" },
  ref: { fontSize: 9, fontWeight: "bold", marginTop: 3, textAlign: "right" },
  box: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10, marginBottom: 12, backgroundColor: "#f8fafc" },
  boxTitle: { fontSize: 8, fontWeight: "bold", color: "#475569", textTransform: "uppercase", marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 120, color: "#64748b" },
  value: { flex: 1, fontWeight: "bold" },
  conclusion: { borderWidth: 1, borderColor: "#2563eb", borderRadius: 6, padding: 10, marginBottom: 12 },
  validation: { marginTop: 18, fontSize: 9, color: "#334155" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: "#94a3b8", flexDirection: "row", justifyContent: "space-between" },
});

export interface RadiologyReportData {
  reference: string;
  organization: { name?: string | null; logoUrl?: string | null } | null;
  patient: { ipp?: string | null; dateOfBirth?: string | null; sex?: string | null; user?: { firstName?: string | null; lastName?: string | null } | null } | null;
  exams: { name: string; modality: string }[];
  modalityLabels: Record<string, string>;
  clinicalIndication: string | null;
  orderedByName: string | null;
  createdAt: string;
  performedAt: string | null;
  report: string | null;
  conclusion: string | null;
  reportedByName: string | null;
  validatedByName: string | null;
  validatedAt: string | null;
}

const formatDate = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
const formatDateTime = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function RadiologyReportPDFDocument({ data }: { data: RadiologyReportData }) {
  const { patient } = data;
  const name = [patient?.user?.lastName?.toUpperCase(), patient?.user?.firstName].filter(Boolean).join(" ") || "-";
  return (
    <Document title={`Compte-rendu d'imagerie ${data.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {data.organization?.logoUrl ? <Image src={data.organization.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.orgName}>{data.organization?.name || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.orgSub}>Service d&apos;imagerie médicale</Text>
          </View>
          <View>
            <Text style={styles.title}>Compte-rendu d&apos;imagerie</Text>
            <Text style={styles.ref}>{data.reference}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Patient</Text>
          <Row label="Nom" value={name} />
          {patient?.ipp ? <Row label="IPP" value={patient.ipp} /> : null}
          {patient?.dateOfBirth ? <Row label="Date de naissance" value={formatDate(patient.dateOfBirth)} /> : null}
          {patient?.sex ? <Row label="Sexe" value={patient.sex} /> : null}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Examen</Text>
          <Row label="Examen(s)" value={data.exams.map((e) => `${e.name} (${data.modalityLabels[e.modality] || e.modality})`).join(", ")} />
          <Row label="Prescrit par" value={`${data.orderedByName || "-"} le ${formatDate(data.createdAt)}`} />
          {data.performedAt ? <Row label="Réalisé le" value={formatDateTime(data.performedAt)} /> : null}
          {data.clinicalIndication ? <Row label="Indication" value={data.clinicalIndication} /> : null}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Compte-rendu</Text>
          <Text>{data.report || "-"}</Text>
        </View>

        <View style={styles.conclusion}>
          <Text style={styles.boxTitle}>Conclusion</Text>
          <Text style={{ fontWeight: "bold" }}>{data.conclusion || "-"}</Text>
        </View>

        <Text style={styles.validation}>
          Compte-rendu rédigé par {data.reportedByName || "-"}
          {data.validatedAt ? ` — validé par ${data.validatedByName || "-"} le ${formatDateTime(data.validatedAt)}` : " — en attente de validation"}
        </Text>

        <View style={styles.footer} fixed>
          <Text>Document généré via MedDoc • {data.reference}{patient?.ipp ? ` • ${patient.ipp}` : ""}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
