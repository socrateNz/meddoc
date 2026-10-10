import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToFile } from "@react-pdf/renderer";
import path from "node:path";
import fs from "node:fs";

// Palette de couleurs élégante & médicale
const colors = {
  primary: "#1e40af",      // Bleu institutionnel
  primaryDark: "#0f172a",  // Slate 900
  primaryLight: "#eff6ff", // Bleu très clair pour fonds
  secondary: "#0284c7",    // Cyan / Bleu médical
  accent: "#059669",       // Vert réussite / conformité
  warning: "#d97706",      // Orange alerte
  danger: "#dc2626",       // Rouge anomalie / P0
  text: "#1e293b",         // Slate 800
  textMuted: "#64748b",    // Slate 500
  border: "#e2e8f0",       // Gris bordure
  cardBg: "#f8fafc",       // Fond carte léger
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingLeft: 36,
    paddingRight: 36,
    fontFamily: "Helvetica",
    color: colors.text,
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 8,
    marginBottom: 14,
  },
  headerBrand: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
  headerSub: {
    fontSize: 7.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerMeta: {
    textAlign: "right",
    fontSize: 7.5,
    color: colors.textMuted,
  },
  coverTitleContainer: {
    backgroundColor: colors.primaryDark,
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
  },
  mainTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
    letterSpacing: 0.5,
  },
  mainSubTitle: {
    fontSize: 8.5,
    color: "#93c5fd",
    marginTop: 4,
    lineHeight: 1.3,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 5,
    padding: 7,
    textAlign: "center",
  },
  metricValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
  metricLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: colors.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
    paddingLeft: 6,
    marginTop: 10,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  paragraph: {
    fontSize: 8,
    color: colors.text,
    marginBottom: 6,
    textAlign: "justify",
  },
  highlightBox: {
    backgroundColor: "#fef3c7",
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    padding: 7,
    borderRadius: 4,
    marginBottom: 8,
  },
  criticalBox: {
    backgroundColor: "#fee2e2",
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    padding: 7,
    borderRadius: 4,
    marginBottom: 8,
  },
  boxTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: colors.primaryDark,
    marginBottom: 2,
  },
  boxText: {
    fontSize: 7.5,
    color: "#334155",
    lineHeight: 1.3,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    marginBottom: 10,
    overflow: "hidden",
  },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: "#1e3a8a",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableCell: {
    fontSize: 7,
    color: colors.text,
  },
  badgeP0: {
    backgroundColor: "#fecaca",
    color: colors.danger,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    textAlign: "center",
  },
  badgeP1: {
    backgroundColor: "#fed7aa",
    color: "#c2410c",
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    textAlign: "center",
  },
  badgeP2: {
    backgroundColor: "#e0e7ff",
    color: "#3730a3",
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    textAlign: "center",
  },
  badgeOk: {
    backgroundColor: "#d1fae5",
    color: colors.accent,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 5,
    fontSize: 6.5,
    color: colors.textMuted,
  },
});

export const AuditPdfDocument = () => (
  <Document
    title="Rapport d'Audit d'Évolution — Tacynt MedDoc"
    author="Architecte Logiciel Senior HIS/EMR"
    subject="Audit et trajectoire vers un Système d'Information Hospitalier (HIS) complet"
  >
    {/* ─── PAGE 1 : Couverture, Résumé Exécutif & Pharmacie ─── */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>Tacynt MedDoc · EMR & HIS</Text>
          <Text style={styles.headerSub}>Plateforme Médicale & Hospitalière Multi-Établissements</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text>AUDIT D'ÉVOLUTION ARCHITECTURALE</Text>
          <Text>Version 1.0 · Octobre 2026 · Confidentiel Médical</Text>
        </View>
      </View>

      <View style={styles.coverTitleContainer}>
        <Text style={styles.mainTitle}>AUDIT TECHNIQUE ET FONCTIONNEL DE TACYNT MEDDOC</Text>
        <Text style={styles.mainSubTitle}>
          Partir du socle existant éprouvé en pharmacie pour consolider et déployer un Système d'Information Hospitalier (HIS) complet
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>422 / 422</Text>
          <Text style={styles.metricLabel}>Tests Passants (100%)</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>57</Text>
          <Text style={styles.metricLabel}>Modèles Prisma</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>19</Text>
          <Text style={styles.metricLabel}>Modules Dashboard</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>8</Text>
          <Text style={styles.metricLabel}>Générateurs PDF</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>PWA + RxDB</Text>
          <Text style={styles.metricLabel}>Mode Hors-Ligne</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>1. Résumé Exécutif & Directive Fondamentale</Text>
      <Text style={styles.paragraph}>
        L'analyse approfondie du code source et l'exécution de la suite de tests Vitest confirment que Tacynt MedDoc dispose déjà d'un socle applicatif extrêmement robuste et structuré. L'application intègre nativement la gestion multi-tenant (Holdings & Cliniques), le secret médical strict interdisant au Super Admin l'accès aux dossiers patients, et une suite de tests unitaires et d'intégration validant les parcours critiques.
      </Text>
      <View style={styles.highlightBox}>
        <Text style={styles.boxTitle}>RÈGLE FONDAMENTALE : AUCUNE RÉÉCRITURE GLOBALE</Text>
        <Text style={styles.boxText}>
          Le périmètre métier de la Pharmacie et de la Caisse est déjà en exploitation active. La mission d'évolution consiste à préserver rigoureusement ce qui fonctionne, corriger une anomalie comptable identifiée, connecter les flux transversaux et ajouter uniquement les modules hospitaliers manquants (Imagerie et Urgences).
        </Text>
      </View>

      <Text style={styles.sectionTitle}>2. Audit du Périmètre Pharmacie & Caisse (Sanctuarisé)</Text>
      <Text style={styles.paragraph}>
        • <Text style={{ fontFamily: "Helvetica-Bold" }}>Traçabilité FEFO groupée :</Text> Résolution en mémoire de la consommation des lots par date de péremption puis écriture groupée par updateMany. Évite tout timeout sur Vercel/Mongo.
      </Text>
      <Text style={styles.paragraph}>
        • <Text style={{ fontFamily: "Helvetica-Bold" }}>Séparation Caissier / Pharmacien :</Text> Encaissement à la caisse générant un code de retrait à 6 caractères, contrôle obligatoire par le pharmacien à la remise des médicaments. Interdiction stricte de délivrance hors-ligne.
      </Text>
      <Text style={styles.paragraph}>
        • <Text style={{ fontFamily: "Helvetica-Bold" }}>Verrouillage atomique de caisse :</Text> Ouverture de session protégée par réclamation conditionnelle hasOpenSession=false empêchant deux sessions concurrentes.
      </Text>

      <View style={styles.criticalBox}>
        <Text style={{ ...styles.boxTitle, color: colors.danger }}>ANOMALIE CRITIQUE DÉTECTÉE (P0) — ANNULATION DE FACTURE</Text>
        <Text style={styles.boxText}>
          Dans finance.ts (changeInvoiceStatus), l'option withdrawPayments exécute un deleteMany sur FinancialTransaction. Cette suppression physique détruit rétroactivement l'historique des sessions de caisse déjà clôturées et crée de faux écarts de caisse.
          Correction obligatoire : Remplacer par une écriture de contrepassation / remboursement (EXPENSE) sans suppression de données.
        </Text>
      </View>

      <View style={styles.footer} fixed>
        <Text>Tacynt MedDoc — Rapport d'Audit & Feuille de Route HIS</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>

    {/* ─── PAGE 2 : Matrice des Écarts & Couverture Hospitalière ─── */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>Tacynt MedDoc · EMR & HIS</Text>
          <Text style={styles.headerSub}>Matrice d'Évaluation Fonctionnelle</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text>SECTION TECHNIQUE & MÉTIER</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>3. Matrice des Écarts par Statut Réglementaire</Text>

      <View style={styles.table}>
        <View style={styles.tableRowHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: "18%" }}>Module</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "30%" }}>Fonctionnalité</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "16%" }}>Statut Audit</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "26%" }}>Constat / Action</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "10%", textAlign: "center" }}>Prio</Text>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Pharmacie</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Gestion lots FEFO & Ruptures</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: colors.accent }}>1. Vérifiée</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Batching groupé performant</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeOk}>OK</Text></View>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Caisse</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Annulation de facture / Paiements</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: colors.danger }}>2. À renforcer</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Suppression physique de transaction</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP0}>P0</Text></View>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Patient / DPI</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Création patient & Admission</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: "#ea580c" }}>2. À renforcer</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>E-mail obligatoire bloquant, pas d'IPP</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP1}>P1</Text></View>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Hospitalisation</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Facturation des séjours / lits</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: "#ea580c" }}>3. Partielle</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Lits gérés, pas de calcul nuitée auto</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP1}>P1</Text></View>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Urgences</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Triage & Orientation clinique</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: "#ea580c" }}>3. Partielle</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Ward EMERGENCY sans échelle tri</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP1}>P1</Text></View>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Laboratoire</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Ordres, saisie, validation, stock</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: colors.accent }}>1. Vérifiée</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Complet. Manque étiquettes code-barre</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP2}>P2</Text></View>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Radiologie</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Imagerie médicale & Comptes rendus</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: colors.danger }}>5. Absente</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Module à créer de zéro</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP2}>P2</Text></View>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Bloc Opératoire</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Programmation & Checklists chir.</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: colors.textMuted }}>5. Absente</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Extension selon activité chirurgicale</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP2}>P3</Text></View>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold" }}>Banque de Sang</Text>
          <Text style={{ ...styles.tableCell, width: "30%" }}>Poches, cross-match, hémovigilance</Text>
          <Text style={{ ...styles.tableCell, width: "16%", color: colors.textMuted }}>5. Absente</Text>
          <Text style={{ ...styles.tableCell, width: "26%" }}>Extension selon décision métier</Text>
          <View style={{ width: "10%", alignItems: "center" }}><Text style={styles.badgeP2}>P3</Text></View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>4. Analyse des Domaines Hospitaliers Clés</Text>
      <Text style={styles.paragraph}>
        • <Text style={{ fontFamily: "Helvetica-Bold" }}>Hospitalisation & Rondes :</Text> Gestion exemplaire des pavillons, chambres et lits avec verrouillage atomique de l'attribution. Les rondes médicales quotidiennes (RoundSession) permettent la visite au lit avec saisie des constats soignants et décisions médicales. Le seul ajout nécessaire est l'automatisation de la facturation des séjours.
      </Text>
      <Text style={styles.paragraph}>
        • <Text style={{ fontFamily: "Helvetica-Bold" }}>Laboratoire biomédical :</Text> Intégration remarquable avec la pharmacie : chaque examen consommant des tubes ou réactifs décompte automatiquement les stocks lors de la délivrance et répercute le prix sur la facture patient.
      </Text>
      <Text style={styles.paragraph}>
        • <Text style={{ fontFamily: "Helvetica-Bold" }}>Maternité & Obstétrique :</Text> Suivi complet de la grossesse (Pregnancy), consultations prénatales et délivrance (Newborn). Module parfaitement adapté à conserver sans modification structurelle.
      </Text>

      <View style={styles.footer} fixed>
        <Text>Tacynt MedDoc — Rapport d'Audit & Feuille de Route HIS</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>

    {/* ─── PAGE 3 : Feuille de Route & Décisions Métier ─── */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>Tacynt MedDoc · EMR & HIS</Text>
          <Text style={styles.headerSub}>Feuille de Route Stratégique d'Évolution</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text>PLAN D'EXÉCUTION 5 ÉTAPES</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>5. Feuille de Route Opérationnelle (5 Étapes)</Text>

      <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.primary }}>
          ÉTAPE A · Corrections Critiques & Intégrité Comptable (P0 — 1.5 jours)
        </Text>
        <Text style={styles.paragraph}>
          Remplacement du deleteMany par une écriture de contrepassation / remboursement pour préserver les sessions fermées. Sécurisation de l'écouteur d'événement stock.low contre les erreurs de client Prisma.
        </Text>
      </View>

      <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.primary }}>
          ÉTAPE B · Consolidation Patient & Logistique (P1 — 7 jours)
        </Text>
        <Text style={styles.paragraph}>
          Suppression de l'e-mail obligatoire pour la création de dossier patient et mise en place d'un IPP séquentiel (ex: MED-2026-001248). Ajout des réceptions partielles fournisseurs avec suivi des reliquats. Impression d'étiquettes code-barres pour les prélèvements de laboratoire.
        </Text>
      </View>

      <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.primary }}>
          ÉTAPE C · Intégration des Flux Hospitaliers Transversaux (P1-P2 — 10 jours)
        </Text>
        <Text style={styles.paragraph}>
          Calcul et injection automatique des frais de séjour journalier à la libération du lit d'hospitalisation. Création d'un écran d'accueil avec gestion de la file d'attente ambulatoire. Formalisation du protocole de sortie hospitalière avec compte-rendu médical obligatoire.
        </Text>
      </View>

      <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.primary }}>
          ÉTAPE D · Couverture Hospitalière Complémentaire (P2 — 11 jours)
        </Text>
        <Text style={styles.paragraph}>
          Création du module Imagerie Médicale (catalogue, prescription, compte-rendu radiologique, stockage d'images sécurisé). Module de Triage des Urgences avec classification de gravité (CIMU / Manchester). Visionneuse et archivage sécurisé de documents externes scannés.
        </Text>
      </View>

      <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.primary }}>
          ÉTAPE E · Extensions Spécialisées & Optimisations (P3 — 15 jours — Sur Décision)
        </Text>
        <Text style={styles.paragraph}>
          Gestion du bloc opératoire et programmation chirurgicale. Banque de sang et traçabilité transfusionnelle. Connecteurs d'interopérabilité HL7 / FHIR.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>6. Arbitrages Métier Requis</Text>
      <View style={{ ...styles.table, marginBottom: 12 }}>
        <View style={styles.tableRowHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: "35%" }}>Arbitrage Métier</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "35%" }}>Options Envisagées</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "30%" }}>Recommandation Architecte</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "35%", fontFamily: "Helvetica-Bold" }}>Format Identifiant Patient (IPP)</Text>
          <Text style={{ ...styles.tableCell, width: "35%" }}>Numéro national vs Séquentiel annuel</Text>
          <Text style={{ ...styles.tableCell, width: "30%", color: colors.primary }}>Séquentiel : [CLI]-[ANNÉE]-[SEQ]</Text>
        </View>
        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "35%", fontFamily: "Helvetica-Bold" }}>Activité Chirurgicale</Text>
          <Text style={{ ...styles.tableCell, width: "35%" }}>Ambulatoire seul vs Bloc lourd</Text>
          <Text style={{ ...styles.tableCell, width: "30%", color: colors.primary }}>Ambulatoire d'abord, bloc en phase E</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "35%", fontFamily: "Helvetica-Bold" }}>Stockage Imagerie Médicale</Text>
          <Text style={{ ...styles.tableCell, width: "35%" }}>Serveur PACS DICOM vs Cloud HD</Text>
          <Text style={{ ...styles.tableCell, width: "30%", color: colors.primary }}>Stockage Cloud HD sécurisé (pragmatique)</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>7. Documents de Référence Disponibles</Text>
      <Text style={{ fontSize: 7.5, color: colors.textMuted }}>
        L'ensemble de l'audit et des plans d'action détaillés sont consignés dans les fichiers Markdown à la racine du dépôt :
        {"\n"}• AUDIT_EVOLUTION_MEDDOC.md (Rapport général complet)
        {"\n"}• AUDIT_PHARMACIE_MEDDOC.md (Audit approfondi pharmacie et caisse)
        {"\n"}• MATRICE_ECARTS_MEDDOC.md (Matrice complète 6 statuts)
        {"\n"}• MATRICE_ROLES_MEDDOC.md (Permissions et multi-tenancy)
        {"\n"}• PLAN_NON_REGRESSION_MEDDOC.md (422 tests et scénarios critiques)
        {"\n"}• ROADMAP_EVOLUTION_MEDDOC.md (Planning détaillé des 5 étapes)
      </Text>

      <View style={styles.footer} fixed>
        <Text>Tacynt MedDoc — Rapport d'Audit & Feuille de Route HIS</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  </Document>
);

async function main() {
  const auditDir = path.resolve(process.cwd(), "Audit");
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
  const outputPath = path.resolve(auditDir, "AUDIT_EVOLUTION_MEDDOC.pdf");
  console.log(`Génération du PDF vers ${outputPath}...`);
  await renderToFile(React.createElement(AuditPdfDocument), outputPath);
  console.log(`PDF généré avec succès (${fs.statSync(outputPath).size} octets) !`);
}

main().catch((err) => {
  console.error("Erreur lors de la génération du PDF:", err);
  process.exit(1);
});
