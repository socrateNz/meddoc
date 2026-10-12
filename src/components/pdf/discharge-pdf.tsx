"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

// Bulletin de sortie — données renvoyées par closeCarePlan (src/actions/careplans.ts). Même charte
// que les autres documents patient (en-tête établissement, encadrés, signatures).
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1e293b" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#059669",
    paddingBottom: 12,
    marginBottom: 18,
  },
  logo: { width: 40, height: 40, objectFit: "contain", marginBottom: 4 },
  orgName: { fontSize: 15, fontWeight: "bold" },
  orgSub: { fontSize: 8, color: "#64748b", marginTop: 3 },
  title: { fontSize: 15, fontWeight: "bold", color: "#059669", textTransform: "uppercase", textAlign: "right" },
  titleSub: { fontSize: 9, color: "#64748b", marginTop: 3, textAlign: "right" },
  box: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10, marginBottom: 12, backgroundColor: "#f8fafc" },
  boxTitle: { fontSize: 8, fontWeight: "bold", color: "#475569", textTransform: "uppercase", marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 130, color: "#64748b" },
  value: { flex: 1, fontWeight: "bold" },
  summary: { marginTop: 2 },
  balanceOk: { color: "#059669", fontWeight: "bold" },
  balanceDue: { color: "#dc2626", fontWeight: "bold" },
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  signatureBox: { width: "42%", borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 4, fontSize: 8, color: "#64748b", textAlign: "center" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

export interface DischargeBulletin {
  patient: {
    ipp?: string | null;
    dateOfBirth?: string | Date | null;
    sex?: string | null;
    user?: { firstName?: string | null; lastName?: string | null } | null;
    organization?: { name?: string | null; logoUrl?: string | null } | null;
  } | null;
  dischargeSummary: string;
  dischargedAt: string;
  dischargedBy: string;
  stay: { admittedAt: string; nightsBilled: number; beds: { wardName: string; roomName: string; bedLabel: string }[] } | null;
  outstanding: number;
  overrideReason: string | null;
}

const formatDate = (d: string | Date) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
const formatDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const formatFCFA = (v: number) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function DischargePDFDocument({ bulletin }: { bulletin: DischargeBulletin }) {
  const { patient, stay } = bulletin;
  const name = [patient?.user?.lastName?.toUpperCase(), patient?.user?.firstName].filter(Boolean).join(" ") || "-";
  // « puis » plutôt qu'une flèche : absente de la police Helvetica intégrée au PDF.
  const beds = stay?.beds.map((b) => `${b.wardName} / ${b.roomName} (lit ${b.bedLabel})`).join(", puis ");

  return (
    <Document title={`Bulletin de sortie — ${name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {patient?.organization?.logoUrl ? <Image src={patient.organization.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.orgName}>{patient?.organization?.name || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={styles.orgSub}>Plateforme de Gestion Médicale & Pharmacie</Text>
          </View>
          <View>
            <Text style={styles.title}>Bulletin de sortie</Text>
            <Text style={styles.titleSub}>Le {formatDateTime(bulletin.dischargedAt)}</Text>
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
          <Text style={styles.boxTitle}>Séjour</Text>
          {stay ? (
            <>
              <Row label="Admission" value={formatDateTime(stay.admittedAt)} />
              <Row label="Sortie" value={formatDateTime(bulletin.dischargedAt)} />
              <Row label="Nuitées facturées" value={String(stay.nightsBilled)} />
              {beds ? <Row label="Hébergement" value={beds} /> : null}
            </>
          ) : (
            <Row label="Prise en charge" value="Ambulatoire (sans hospitalisation)" />
          )}
          <Row label="Sortie autorisée par" value={bulletin.dischargedBy} />
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Compte-rendu de sortie</Text>
          <Text style={styles.summary}>{bulletin.dischargeSummary}</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Situation financière à la sortie</Text>
          {bulletin.outstanding > 0 ? (
            <>
              <Text style={styles.balanceDue}>Reste à payer : {formatFCFA(bulletin.outstanding)}</Text>
              {bulletin.overrideReason ? <Text style={{ marginTop: 3 }}>Sortie autorisée sans règlement complet — motif : {bulletin.overrideReason}</Text> : null}
            </>
          ) : (
            <Text style={styles.balanceOk}>Aucun montant dû — compte soldé.</Text>
          )}
        </View>

        <View style={styles.signatures}>
          <Text style={styles.signatureBox}>Signature du médecin / responsable</Text>
          <Text style={styles.signatureBox}>Signature du patient ou de son représentant</Text>
        </View>

        <Text style={styles.footer} fixed>
          Document généré via MedDoc • Bulletin de sortie{patient?.ipp ? ` • ${patient.ipp}` : ""}
        </Text>
      </Page>
    </Document>
  );
}
