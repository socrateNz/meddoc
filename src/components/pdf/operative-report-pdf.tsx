"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

// Compte-rendu opératoire — données de getSurgeryCase (src/actions/surgery.ts), avec la trace de
// la check-list de sécurité. Même charte que le compte-rendu d'imagerie. Pas de lineHeight sur la
// Page (il masquerait le pied de page fixe).
const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontFamily: "Helvetica", fontSize: 10, color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#0f766e", paddingBottom: 12, marginBottom: 16 },
  logo: { width: 40, height: 40, objectFit: "contain", marginBottom: 4 },
  orgName: { fontSize: 15, fontWeight: "bold" },
  orgSub: { fontSize: 8, color: "#64748b", marginTop: 3 },
  title: { fontSize: 14, fontWeight: "bold", color: "#0f766e", textTransform: "uppercase", textAlign: "right" },
  ref: { fontSize: 9, fontWeight: "bold", marginTop: 3, textAlign: "right" },
  box: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10, marginBottom: 12, backgroundColor: "#f8fafc" },
  boxTitle: { fontSize: 8, fontWeight: "bold", color: "#475569", textTransform: "uppercase", marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 130, color: "#64748b" },
  value: { flex: 1, fontWeight: "bold" },
  checklistRow: { flexDirection: "row", marginBottom: 2, fontSize: 9 },
  signature: { marginTop: 18, fontSize: 9, color: "#334155" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: "#94a3b8", flexDirection: "row", justifyContent: "space-between" },
});

export interface OperativeReportData {
  reference: string;
  organization: { name?: string | null; logoUrl?: string | null } | null;
  patient: { ipp?: string | null; dateOfBirth?: string | null; sex?: string | null; bloodType?: string | null; user?: { firstName?: string | null; lastName?: string | null } | null } | null;
  procedure: string;
  lateralityLabel: string | null;
  anesthesiaLabel: string;
  indication: string | null;
  roomName: string | null;
  surgeonName: string | null;
  anesthetistName: string | null;
  scrubNurseName: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  operativeReport: string | null;
  complications: string | null;
  postOpInstructions: string | null;
  reportedByName: string | null;
  reportedAt: string | null;
  // Étapes de la check-list signées : libellé, signataire, heure.
  checklist: { label: string; checkedByName: string | null; checkedAt: string }[];
}

const TZ = "Africa/Douala";
const formatDate = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }).format(new Date(d));
const formatDateTime = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d));

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function OperativeReportPDFDocument({ data }: { data: OperativeReportData }) {
  const { patient } = data;
  const name = [patient?.user?.lastName?.toUpperCase(), patient?.user?.firstName].filter(Boolean).join(" ") || "-";
  return (
    <Document title={`Compte-rendu opératoire ${data.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf, sans attribut alt */}
            {data.organization?.logoUrl ? <Image src={data.organization.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.orgName}>{data.organization?.name || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.orgSub}>Bloc opératoire</Text>
          </View>
          <View>
            <Text style={styles.title}>Compte-rendu opératoire</Text>
            <Text style={styles.ref}>{data.reference}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Patient</Text>
          <Row label="Nom" value={name} />
          {patient?.ipp ? <Row label="IPP" value={patient.ipp} /> : null}
          {patient?.dateOfBirth ? <Row label="Date de naissance" value={formatDate(patient.dateOfBirth)} /> : null}
          {patient?.bloodType ? <Row label="Groupe sanguin" value={patient.bloodType} /> : null}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Intervention</Text>
          <Row label="Intervention" value={data.lateralityLabel ? `${data.procedure} (${data.lateralityLabel})` : data.procedure} />
          {data.indication ? <Row label="Indication" value={data.indication} /> : null}
          <Row label="Anesthésie" value={data.anesthesiaLabel} />
          <Row label="Salle" value={data.roomName || "-"} />
          <Row label="Début / fin" value={`${data.actualStart ? formatDateTime(data.actualStart) : "-"}  /  ${data.actualEnd ? formatDateTime(data.actualEnd) : "-"}`} />
          <Row label="Chirurgien" value={data.surgeonName || "-"} />
          <Row label="Anesthésiste" value={data.anesthetistName || "-"} />
          <Row label="Infirmier(e) de bloc" value={data.scrubNurseName || "-"} />
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Compte-rendu</Text>
          <Text>{data.operativeReport || "-"}</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Incidents / complications</Text>
          <Text>{data.complications || "Aucun"}</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Consignes post-opératoires</Text>
          <Text>{data.postOpInstructions || "-"}</Text>
        </View>

        <View style={styles.box} wrap={false}>
          <Text style={styles.boxTitle}>Check-list de sécurité au bloc opératoire</Text>
          {data.checklist.length === 0 ? (
            <Text style={{ fontSize: 9 }}>Aucune étape signée.</Text>
          ) : (
            data.checklist.map((c) => (
              <View key={c.label} style={styles.checklistRow}>
                <Text style={{ width: 200 }}>{c.label}</Text>
                <Text>
                  Signée par {c.checkedByName || "-"} le {formatDateTime(c.checkedAt)}
                </Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.signature}>
          Compte-rendu rédigé par {data.reportedByName || "-"}
          {data.reportedAt ? ` le ${formatDateTime(data.reportedAt)}` : ""}
        </Text>

        <View style={styles.footer} fixed>
          <Text>Document généré via MedDoc • {data.reference}{patient?.ipp ? ` • ${patient.ipp}` : ""}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
