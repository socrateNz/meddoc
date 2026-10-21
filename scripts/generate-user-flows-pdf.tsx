import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToFile } from "@react-pdf/renderer";
import path from "node:path";
import fs from "node:fs";

// Palette institutionnelle médicale MedDoc
const colors = {
  primary: "#0f766e",       // Teal médical profond
  primaryDark: "#042f2e",   // Teal 950
  primaryLight: "#f0fdfa",  // Teal 50
  primaryBorder: "#99f6e4", // Teal 200
  secondary: "#0284c7",     // Bleu ciel médical
  secondaryDark: "#0369a1", // Bleu 700
  secondaryLight: "#f0f9ff",// Bleu 50
  navy: "#0f172a",          // Slate 900
  darkSlate: "#1e293b",     // Slate 800
  text: "#334155",          // Slate 700
  textMuted: "#64748b",     // Slate 500
  border: "#cbd5e1",        // Slate 300
  borderLight: "#e2e8f0",   // Slate 200
  cardBg: "#f8fafc",        // Slate 50
  accentGreen: "#059669",   // Émeraude
  accentGreenBg: "#ecfdf5",
  accentAmber: "#d97706",   // Ambre
  accentAmberBg: "#fffbeb",
  accentRed: "#dc2626",     // Rouge
  accentRedBg: "#fef2f2",
  accentPurple: "#7c3aed",  // Violet
  accentPurpleBg: "#f5f3ff",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 44,
    paddingLeft: 36,
    paddingRight: 36,
    fontFamily: "Helvetica",
    color: colors.darkSlate,
    fontSize: 8,
    lineHeight: 1.35,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 7,
    marginBottom: 12,
  },
  headerBrand: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 7.5,
    color: colors.textMuted,
    marginTop: 1.5,
  },
  headerMeta: {
    textAlign: "right",
    fontSize: 7.5,
    color: colors.textMuted,
  },
  coverBanner: {
    backgroundColor: colors.primaryDark,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  coverTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
    letterSpacing: 0.4,
  },
  coverSub: {
    fontSize: 8.5,
    color: "#a7f3d0",
    marginTop: 3,
    lineHeight: 1.3,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 4,
    padding: 6,
    textAlign: "center",
  },
  metricValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
  metricLabel: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: colors.textMuted,
    marginTop: 1.5,
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
    paddingLeft: 5,
    marginTop: 8,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionSubtitle: {
    fontSize: 7.5,
    color: colors.textMuted,
    marginBottom: 6,
    fontStyle: "italic",
  },
  flowCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    padding: 8,
    marginBottom: 7,
  },
  flowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    paddingBottom: 3,
  },
  flowTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: colors.navy,
  },
  flowBadge: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  flowDesc: {
    fontSize: 7.5,
    color: colors.text,
    marginBottom: 4,
    lineHeight: 1.3,
  },
  stepList: {
    marginTop: 2,
  },
  stepItem: {
    flexDirection: "row",
    marginBottom: 2.5,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 14,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: colors.secondaryDark,
  },
  stepText: {
    flex: 1,
    fontSize: 7.2,
    color: colors.darkSlate,
    lineHeight: 1.25,
  },
  ruleBox: {
    backgroundColor: colors.accentAmberBg,
    borderLeftWidth: 2.5,
    borderLeftColor: colors.accentAmber,
    padding: 4,
    marginTop: 3,
    borderRadius: 3,
  },
  ruleText: {
    fontSize: 6.8,
    color: "#92400e",
    fontFamily: "Helvetica-Bold",
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    marginBottom: 8,
    overflow: "hidden",
  },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: colors.primaryDark,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    fontSize: 6.8,
    fontFamily: "Helvetica-Bold",
    color: colors.white,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: colors.cardBg,
  },
  tableCell: {
    fontSize: 6.8,
    color: colors.text,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 5,
    fontSize: 6.5,
    color: colors.textMuted,
  },
});

const MedDocUserFlowsDocument = () => (
  <Document title="MedDoc - Cartographie des User Flows" author="Équipe MedDoc HIS">
    {/* ============================================================== */}
    {/* PAGE 1 : PRÉSENTATION GLOBALE & MATRICE DES RÔLES (RBAC)        */}
    {/* ============================================================== */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <View>
          <Text style={styles.headerBrand}>MedDoc EMR & HIS SaaS</Text>
          <Text style={styles.headerSub}>Plateforme Hospitalière & Coordination Médicale Multi-Cliniques</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark }}>DOCUMENTATION FONCTIONNELLE</Text>
          <Text>Version 2.0 • Octobre 2026</Text>
        </View>
      </View>

      <View style={styles.coverBanner}>
        <Text style={styles.coverTitle}>Guide Officiel des Parcours Utilisateurs (User Flows)</Text>
        <Text style={styles.coverSub}>
          Description exhaustive des flux opérationnels, cliniques, médico-techniques, financiers et administratifs pour chaque profil d&apos;utilisateur.
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>8 Rôles</Text>
          <Text style={styles.metricLabel}>Profils d&apos;utilisateurs</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>15 Flows</Text>
          <Text style={styles.metricLabel}>Parcours Métier Clés</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>12 Modules</Text>
          <Text style={styles.metricLabel}>Licence & Gating</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>Offline-Ready</Text>
          <Text style={styles.metricLabel}>PWA Résiliente</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>100% Tracé</Text>
          <Text style={styles.metricLabel}>AuditLog HDS / RGPD</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>1. Rôles Applicatifs & Matrice des Habilitations (RBAC)</Text>
      <Text style={styles.sectionSubtitle}>
        L&apos;application sépare rigoureusement la gouvernance de holding, l&apos;administration de clinique et les actes soignants.
      </Text>

      <View style={styles.table}>
        <View style={styles.tableRowHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: "18%" }}>Rôle</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "20%" }}>Niveau d&apos;Action</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "42%" }}>Missions & Prérogatives Opérationnelles</Text>
          <Text style={{ ...styles.tableHeaderCell, width: "20%" }}>Restrictions Clés</Text>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.primaryDark }}>SUPER_ADMIN</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Plateforme SaaS Global</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Création des holdings, paramétrage des licences, quotas de cliniques/utilisateurs, gestion des modules activés.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.textMuted }}>Pas d&apos;accès clinique direct</Text>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.secondaryDark }}>ADMIN</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Holding / Réseau</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Création des cliniques, affectation du coordinateur, audit, supervision et consultation financière du réseau.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.accentAmber }}>Lecture seule sur l&apos;opérationnel</Text>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.accentPurple }}>COORDINATOR</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Clinique Locale</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Gestion du personnel médical, lits/chambres, paramètres, plannings de garde, forçage motivé de sortie d&apos;hospitalisation.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.textMuted }}>Limité à sa clinique</Text>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.primary }}>MEDECIN</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Autorité Clinique</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Consultations, diagnostic CIM-10, prescriptions d&apos;ordonnances et examens, validation bio/radio, chirurgies, rondes.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.textMuted }}>Pas de gestion d&apos;équipe</Text>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.accentGreen }}>CAREGIVER</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Soins Terrain (Infirmier)</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Prise des constantes vitales, exécution des tâches de soins, prélèvements labo, tri urgences CIMU, check-list bloc, transfusion.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.accentAmber }}>Prescription interdite</Text>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.accentAmber }}>PHARMACIST</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Pharmacie & Stock</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Délivrance de médicaments sur ticket/code de retrait (FEFO), achats, inventaires physiques, gestion des lots et péremptions.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.accentRed }}>Dossier clinique masqué</Text>
        </View>

        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.secondaryDark }}>CASHIER</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Caisse & Encaissement</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Ouverture/clôture de session, encaissement des factures d&apos;actes en attente, ventes directes, impression tickets, mode offline.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.accentRed }}>Pas d&apos;accès médical/messages</Text>
        </View>

        <View style={{ ...styles.tableRow, ...styles.tableRowAlt }}>
          <Text style={{ ...styles.tableCell, width: "18%", fontFamily: "Helvetica-Bold", color: colors.textMuted }}>PATIENT / FAMILY</Text>
          <Text style={{ ...styles.tableCell, width: "20%" }}>Espace Usagers</Text>
          <Text style={{ ...styles.tableCell, width: "42%" }}>Consultation sécurisée du résumé du dossier, suivi des constantes, historique des RDV, rappels automatiques, messagerie.</Text>
          <Text style={{ ...styles.tableCell, width: "20%", color: colors.textMuted }}>Lecture seule de leur dossier</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>2. Principes Fondamentaux d&apos;Architecture Fonctionnelle</Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
        <View style={{ flex: 1, backgroundColor: colors.secondaryLight, borderWidth: 1, borderColor: colors.borderLight, padding: 6, borderRadius: 4 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.secondaryDark, fontSize: 7.5, marginBottom: 2 }}>Séparation Caisse / Pharmacie</Text>
          <Text style={{ fontSize: 6.8, color: colors.text, lineHeight: 1.25 }}>
            Le caissier encaisse le règlement et produit un reçu contenant un code de retrait unique. Le pharmacien vérifie ce code dans sa file de délivrance avant de déstocker et remettre le médicament.
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.accentGreenBg, borderWidth: 1, borderColor: colors.borderLight, padding: 6, borderRadius: 4 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.accentGreen, fontSize: 7.5, marginBottom: 2 }}>Immutabilité & Contrepassation</Text>
          <Text style={{ fontSize: 6.8, color: colors.text, lineHeight: 1.25 }}>
            Aucune écriture financière ou médicale validée n&apos;est écrasée en base de données. L&apos;annulation d&apos;un encaissement s&apos;effectue par contrepassation stricte, garantissant une conformité d&apos;audit absolue.
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.accentPurpleBg, borderWidth: 1, borderColor: colors.borderLight, padding: 6, borderRadius: 4 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.accentPurple, fontSize: 7.5, marginBottom: 2 }}>Résilience Offline-First</Text>
          <Text style={{ fontSize: 6.8, color: colors.text, lineHeight: 1.25 }}>
            En cas d&apos;interruption réseau, la caisse continue d&apos;enregistrer les ventes et les infirmiers saisissent les constantes dans un cache local chiffré, resynchronisé dès le retour d&apos;Internet.
          </Text>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>MedDoc EMR — Cartographie Officielle des User Flows</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>

    {/* ============================================================== */}
    {/* PAGE 2 : ACCUEIL, GUICHET, URGENCES & CONSULTATION MÉDICALE     */}
    {/* ============================================================== */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <View>
          <Text style={styles.headerBrand}>MedDoc EMR & HIS SaaS</Text>
          <Text style={styles.headerSub}>Filière Patient : Admission, Urgences & Soins Ambulatoires</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark }}>PARCOURS CLINIQUES (1/3)</Text>
          <Text>Accueil & Prise en Charge</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 1 : Accueil, Guichet & File d&apos;Attente</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Admission du patient & Régulation des flux d&apos;entrée</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.secondaryLight, color: colors.secondaryDark }}>
            Acteurs : Caissier, Infirmier(e), Coordinateur
          </Text>
        </View>
        <Text style={styles.flowDesc}>
          Point d&apos;entrée unique de l&apos;établissement assurant l&apos;identification sécurisée du patient et son aiguillage vers les services de soins.
        </Text>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Recherche ou Création Patient :</Text> Recherche par Nom, Téléphone ou Identifiant Permanent du Patient (IPP). Si nouveau patient, saisie de l&apos;état civil complet, des allergies connues et des antécédents médicaux.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Génération Automatique de l&apos;IPP :</Text> Attribution irréversible d&apos;un IPP séquentiel (ex. IPP-2026-001248), repris sur tous les documents officiels imprimés.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Création de la Visite & Orientation :</Text> Sélection du motif d&apos;arrivée, de l&apos;orientation (Consultation Médecin, Urgences, Laboratoire, Imagerie, Caisse) et de la priorité initiale (Basse, Normale, Urgente).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Émission du Ticket du Jour :</Text> Le patient reçoit son numéro de passage. La file d&apos;attente se met à jour en temps réel avec calcul du temps d&apos;attente estimé.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>5.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Appel & Prise en Charge :</Text> Le praticien ou soignant appelle le ticket suivant, bascule le statut en cours, puis termine la visite à la fin de l&apos;acte.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 2 : Urgences & Triage (Échelle CIMU)</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Prise en charge des urgences vitales & Tri médico-soignant</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentRedBg, color: colors.accentRed }}>
            Acteurs : Infirmier(e) d&apos;Accueil et d&apos;Orientation (IAO), Médecin urgentiste
          </Text>
        </View>
        <Text style={styles.flowDesc}>
          Système de régulation des urgences fondé sur la Classification Infirmière des Malades aux Urgences (CIMU) à 5 niveaux avec compte à rebours critique.
        </Text>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Affichage Immédiat au Dashboard :</Text> Dès l&apos;orientation aux Urgences à l&apos;accueil, le patient apparaît en tête du tableau de tri (mise à jour automatique toutes les 20 secondes).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Saisie des Constantes Vitales :</Text> Pression Artérielle, Fréquence Cardiaque, Fréquence Respiratoire, Saturation en O₂, Température, Glycémie capillaire, Échelle visuelle douleur (EVA), Score de Glasgow.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Attribution du Niveau CIMU (1 à 5) :</Text> Du Niveau 1 (Détresse vitale immédiate - délai 0 min) au Niveau 5 (Consultation non urgente - délai cible 120 min). Un badge coloré pulse en cas de dépassement du délai cible.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Surveillance & Retriage :</Text> En cas d&apos;évolution clinique négative, l&apos;IAO ou le médecin re-trie immédiatement le patient avec historique horodaté des motifs d&apos;aggravation.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>5.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Orientation Post-Urgences :</Text> Sortie après soins, transfert vers le bloc opératoire, ou admission directe en hospitalisation.
            </Text>
          </View>
        </View>
        <View style={styles.ruleBox}>
          <Text style={styles.ruleText}>
            Règle de sécurité : Un patient classé en CIMU 1 ou 2 remonte automatiquement en priorité absolue dans la file d&apos;attente globale de l&apos;établissement.
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 3 : Consultation Médicale & Dossier Patient</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Examen clinique, diagnostic, prescriptions & support IA</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.primaryLight, color: colors.primary }}>
            Acteurs : Médecin, Coordinateur
          </Text>
        </View>
        <Text style={styles.flowDesc}>
          Espace de consultation clinique complet avec historique médical, codification internationale et prescriptions intégrées.
        </Text>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Anamnèse & Revue Clinique :</Text> Consultation des antécédents, allergies, consultations passées et constantes récentes.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Dictée Vocale IA :</Text> Le médecin peut dicter ses observations cliniques : l&apos;IA transcrit et structure les notes (relecture et validation obligatoires avant enregistrement).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Diagnostic CIM-10 :</Text> Codage du diagnostic avec moteur de recherche intégré dans la nomenclature officielle CIM-10.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Prescriptions d&apos;Ordonnances :</Text> Saisie structurée (DCI/médicament, posologie, fréquence, durée). Contrôle automatique des contre-indications et génération du PDF officiel.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>5.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Demande d&apos;Analyses & Imagerie :</Text> Prescription d&apos;actes techniques générant instantanément une facture en attente à la caisse de l&apos;établissement.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>6.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Assistant Clinique IA (Gemini) :</Text> Requêtes d&apos;aide à la décision sur les interactions médicamenteuses complexes et synthèses cliniques.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>MedDoc EMR — Cartographie Officielle des User Flows</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>

    {/* ============================================================== */}
    {/* PAGE 3 : HOSPITALISATION, RONDE MÉDICALE & MATERNITÉ            */}
    {/* ============================================================== */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <View>
          <Text style={styles.headerBrand}>MedDoc EMR & HIS SaaS</Text>
          <Text style={styles.headerSub}>Filière Patient : Hospitalisation, Ronde Médicale & Maternité</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark }}>PARCOURS CLINIQUES (2/3)</Text>
          <Text>Séjours & Spécialités</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 4 : Hospitalisation, Chambres & Plan de Soins</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Gestion des lits, séjours hospitaliers & exécution soignante</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentPurpleBg, color: colors.accentPurple }}>
            Acteurs : Coordinateur, Infirmier(e), Médecin
          </Text>
        </View>
        <Text style={styles.flowDesc}>
          Supervision des services d&apos;hospitalisation, gestion dynamique des lits et suivi rigoureux des actes infirmiers prescrits.
        </Text>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Attribution du Lit & Ouverture de Séjour :</Text> Choix du Service, de la Chambre et du Lit libre. L&apos;attribution déclenche l&apos;ouverture officielle du séjour avec horodatage d&apos;admission.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Conception du Plan de Soins :</Text> Définition des tâches infirmières quotidiennes (perfusions, pansements, surveillance horaire, score de dépendance de 1 à 5).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Exécution Soignante Terrain :</Text> Les infirmier(e)s pointent les tâches réalisées au lit du patient avec horodatage, observations de relève et relevé des constantes vitales (fonctionnel offline).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Clôture de Séjour & Facturation des Nuitées :</Text> Calcul automatique des nuitées passées (chaque minuit franchi avec minimum d&apos;une nuitée). Génération du bulletin de sortie officiel en PDF.
            </Text>
          </View>
        </View>
        <View style={styles.ruleBox}>
          <Text style={styles.ruleText}>
            Verrou financier : En cas de reste à payer non soldé à la caisse, la sortie est bloquée. Seul le Coordinateur peut forcer la sortie en saisissant un motif obligatoire tracé à l&apos;audit.
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 5 : Ronde Médicale Quotidienne</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Visite collégiale quotidienne au chevet des hospitalisés</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentGreenBg, color: colors.accentGreen }}>
            Acteurs : Médecin, Infirmier(e), Coordinateur
          </Text>
        </View>
        <Text style={styles.flowDesc}>
          Revue systématique de chaque lit par le binôme médecin/infirmier pour adapter les conduites thérapeutiques.
        </Text>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Ouverture de la Ronde du Jour :</Text> Sélection du service hospitalier et enregistrement des membres présents de l&apos;équipe soignante.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Affichage Panoramique (Liste ou Grille des Lits) :</Text> Visualisation immédiate des dernières constantes, des soins en attente, des bilans de labo en cours et des alertes incident.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Visite Patient par Patient :</Text> L&apos;infirmier(e) expose les constats (tolérance, évolution de la douleur) ; le médecin enregistre la décision clinique (Poursuivre, Adapter, Examens, Sortie envisagée, Transfert) et les consignes.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Clôture de la Ronde :</Text> Synthèse complète des patients visités et rapport sur les patients reportés (avec motifs obligatoires).
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 6 : Maternité & Suivi Obstétrique</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Surveillance prénatale, accouchement & santé néonatale</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.secondaryLight, color: colors.secondaryDark }}>
            Acteurs : Médecin / Obstétricien, Sage-femme, Infirmier(e)
          </Text>
        </View>
        <Text style={styles.flowDesc}>
          Prise en charge intégrée de la femme enceinte de la déclaration de grossesse jusqu&apos;à la délivrance néonatale.
        </Text>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Déclaration de Grossesse :</Text> Date des dernières règles (DDR), calcul automatique du terme prévisionnel, recueil de la gestité, parité et des facteurs de risque obstétricaux.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Consultations Prénatales :</Text> Suivi mensuel de la hauteur utérine, bruits du cœur fœtal, prise pondérale, protéinurie et tension artérielle.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Enregistrement de l&apos;Accouchement :</Text> Mode d&apos;accouchement (voie basse, césarienne), complications éventuelles, délivrance placentaire.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Dossier Nouveau-né :</Text> Enregistrement immédiat : Poids, Taille, Périmètre crânien, et calcul du score d&apos;Apgar (à 1 min, 5 min et 10 min).
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>MedDoc EMR — Cartographie Officielle des User Flows</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>

    {/* ============================================================== */}
    {/* PAGE 4 : PLATEAU TECHNIQUE & SÉCURITÉ MÉDICALE                  */}
    {/* ============================================================== */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <View>
          <Text style={styles.headerBrand}>MedDoc EMR & HIS SaaS</Text>
          <Text style={styles.headerSub}>Plateau Technique : Laboratoire, Imagerie, Bloc & Transfusion</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark }}>PARCOURS CLINIQUES (3/3)</Text>
          <Text>Sécurité & Actes Techniques</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 7 : Laboratoire d&apos;Analyses Médicales</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Circuit complet de l&apos;échantillon biologique & Interopérabilité</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentAmberBg, color: colors.accentAmber }}>
            Acteurs : Médecin, Préleveur/Infirmier, Biologiste
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Prescription & Facturation Automatique :</Text> Le médecin prescrit depuis la consultation ➔ Création de la demande d&apos;examen et de la facture en attente à la caisse.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Prélèvement & Étiquetage :</Text> L&apos;infirmier réalise le prélèvement et imprime les étiquettes tubes avec code-barres (référence LAB-XXXX).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Réception & Analyse (Manuelle ou Automate HL7/FHIR) :</Text> Transmission directe des automates connectés ou saisie manuelle des résultats bruts par le technicien.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Alerte Valeurs Critiques & Validation :</Text> Alerte visuelle immédiate en cas de valeur hors normes. Validation biologique par le médecin ➔ Verrouillage immuable du résultat et export PDF.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 8 : Imagerie Médicale (Radiologie, Échographie, Scanner, IRM)</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Gestion du catalogue, téléversement de clichés & compte-rendu</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.secondaryLight, color: colors.secondaryDark }}>
            Acteurs : Médecin, Manipulateur radio / Infirmier
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Prescription sur Catalogue :</Text> Choix de l&apos;examen au tarif figé à la commande ➔ Notification à la caisse.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Réalisation & Dépôt des Clichés :</Text> Le soignant réalise l&apos;acte et téléverse les clichés haute définition (JPEG, PNG ou PDF jusqu&apos;à 20 Mo).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Compte-Rendu Radiologique & Validation :</Text> Le radiologue rédige observations et conclusions médicales, valide l&apos;examen et génère le compte-rendu signé.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 9 : Bloc Opératoire & Check-list de Sécurité Chirurgicale</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Programmation d&apos;intervention & Check-list OMS en 3 temps</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentPurpleBg, color: colors.accentPurple }}>
            Acteurs : Chirurgien, Anesthésiste, Infirmier de Bloc (IBODE)
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Programmation sans conflit :</Text> Réservation de la salle, du chirurgien, anesthésiste et IBODE avec contrôle anti-chevauchement de créneaux.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Check-list OMS en 3 Phases Strictes :</Text> Signature numérique obligatoire des 3 étapes : (1) Avant induction anesthésique, (2) Avant incision cutanée, (3) Avant sortie de salle. L&apos;intervention est bloquée si une étape préalable manque.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Compte-Rendu Opératoire & Suites :</Text> Rédaction du protocole opératoire par le chirurgien et consignes post-opératoires immédiates.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 10 : Banque de Sang & Transfusions (Hémovigilance)</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Traçabilité des poches sanguines & Sécurité transfusionnelle</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentRedBg, color: colors.accentRed }}>
            Acteurs : Médecin, Infirmier(e)
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Gestion des Stocks de Sang :</Text> Enregistrement des poches (groupe ABO, rhésus, numéro de lot, date de péremption avec alertes d&apos;urgence à J-3).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Réservation Médicale :</Text> Le médecin réserve une poche : contrôle strict de compatibilité ABO/Rhésus, RAI et cross-match. Tout groupe discordant bloque la réservation.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Contrôle Ultime Obligatoire au Lit :</Text> Avant pose par l&apos;infirmier : vérification de concordance d&apos;identité, test de la carte de contrôle ABO et constantes de départ.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Hémovigilance & Déclaration d&apos;Incident :</Text> Saisie des constantes de fin de transfusion. Toute réaction adverse génère automatiquement un incident d&apos;hémovigilance.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>MedDoc EMR — Cartographie Officielle des User Flows</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>

    {/* ============================================================== */}
    {/* PAGE 5 : CAISSE, PHARMACIE, LOGISTIQUE & INCIDENTS              */}
    {/* ============================================================== */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <View>
          <Text style={styles.headerBrand}>MedDoc EMR & HIS SaaS</Text>
          <Text style={styles.headerSub}>Filière Support : Caisse, Pharmacie, Alertes & Coordination</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark }}>FINANCE & LOGISTIQUE</Text>
          <Text>Opérations Quotidiennes</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 11 : Caisse, Encaissements & Rapprochements</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Gestion des sessions de caisse & Encaissement multi-modes</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentGreenBg, color: colors.accentGreen }}>
            Acteurs : Caissier, Coordinateur
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Ouverture de Session :</Text> Déclaration du fond de caisse initial par le caissier avant tout encaissement.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Encaissement Factures en Attente & Ventes Comptoir :</Text> Règlement des actes cliniques (consultations, labo, radio, bloc, séjours) ou vente directe d&apos;articles avec règlement partiel possible.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Émission du Ticket avec Code de Retrait :</Text> Impression du reçu contenant le code de retrait nécessaire pour la pharmacie.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Mode Hors-Ligne (PWA) :</Text> En cas de panne internet, encaissement local résilient et synchronisation différée avec réconciliation.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>5.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Clôture de Session & Contrepassation :</Text> Comptage physique final et calcul des écarts. Annulation d&apos;écriture exclusivement par contrepassation (audit permanent).
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 12 : Pharmacie, Délivrance & Gestion des Stocks</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Dispensation rigoureuse (FEFO) & Approvisionnements</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentAmberBg, color: colors.accentAmber }}>
            Acteurs : Pharmacien(ne), Coordinateur
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>File de Délivrance :</Text> Le patient présente son ticket ➔ Le pharmacien valide le code de retrait et contrôle l&apos;ordonnance.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Déstockage FEFO Automatique :</Text> Sortie prioritaire des lots les plus proches de la date de péremption (*First Expired, First Out*).
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Achats & Bons de Commande Fournisseurs :</Text> Commandes groupées, réceptions partielles ou totales avec réajustement de stock et prix moyen pondéré.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>4.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Campagnes d&apos;Inventaire Physique :</Text> Comptage physique régulier, enregistrement des écarts et traçabilité des pertes.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 13 : Incidents & Signalement des Événements Indésirables</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Qualité, gestion des risques & vigilances sanitaires</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.accentRedBg, color: colors.accentRed }}>
            Acteurs : Tout le personnel, Coordinateur
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Déclaration Rapide :</Text> Signalement par n&apos;importe quel soignant (chute de patient, erreur de médicament, panne matériel, agression) avec niveau de gravité.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Alerte Temps Réel :</Text> Notification prioritaire avec pastille animée sur le tableau de bord du Coordinateur et du Médecin d&apos;astreinte.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Traitement & Résolution :</Text> Investigation, mesures correctives mises en œuvre et archivage de l&apos;incident résolu.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 14 : Calendrier Unifié & Rappels Automatiques</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Planning des consultations, gardes d&apos;équipe & alertes péremption</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.secondaryLight, color: colors.secondaryDark }}>
            Acteurs : Médecins, Infirmiers, Pharmaciens, Caissiers, Patients
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Rendez-vous & Rappels SMS/Notifications :</Text> Rappels automatiques envoyés aux patients et soignants à J-1, H-2 et H-1.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Planning des Gardes :</Text> Planification des astreintes et gardes de l&apos;équipe soignante par le coordinateur.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Échéances Logistiques :</Text> Affichage automatique sur le calendrier des lots de médicaments expirant dans les 90 jours et des fins de contrats aidants.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>MedDoc EMR — Cartographie Officielle des User Flows</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>

    {/* ============================================================== */}
    {/* PAGE 6 : PATIENT, GOUVERNANCE SAAS & AUDIT DE CONFORMITÉ       */}
    {/* ============================================================== */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <View>
          <Text style={styles.headerBrand}>MedDoc EMR & HIS SaaS</Text>
          <Text style={styles.headerSub}>Gouvernance Multi-Tenant, Espace Patient & Conformité HDS</Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark }}>GOUVERNANCE & CONFORMITÉ</Text>
          <Text>Normes & Sécurité</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 15 : Portail Patient & Espace Famille</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Transparence, autonomie & communication soignants-familles</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.secondaryLight, color: colors.secondaryDark }}>
            Acteurs : Patient, Famille autorisée
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Consultation du Dossier Médical Partagé :</Text> Synthèse de santé, allergies, antécédents, traitements en cours et ordonnances téléchargeables.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Suivi de l&apos;Évolution Physiologique :</Text> Consultation des courbes de constantes vitales et suivi du niveau de dépendance du proche hospitalisé.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Messagerie Sécurisée :</Text> Canal de communication direct avec la clinique pour les questions administratives ou d&apos;organisation des soins.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow 16 : Gouvernance SaaS Multi-Tenant & Licences</Text>
      <View style={styles.flowCard}>
        <View style={styles.flowHeader}>
          <Text style={styles.flowTitle}>Administration des holdings, cliniques et modules activés</Text>
          <Text style={{ ...styles.flowBadge, backgroundColor: colors.primaryLight, color: colors.primary }}>
            Acteurs : SUPER_ADMIN, ADMIN Holding
          </Text>
        </View>
        <View style={styles.stepList}>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>1.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Création & Quotas Holding (SUPER_ADMIN) :</Text> Création des groupes hospitaliers, attribution du forfait (TRIAL, BASIC, PREMIUM, ENTERPRISE) et des limites de comptes.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>2.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Activation Granulaire des Modules (Module-Gating) :</Text> Activation/désactivation par holding : Accueil, Urgences, Hospitalisation, Laboratoire, Imagerie, Bloc opératoire, Banque de sang, Pharmacie, Maternité, IA, Interopérabilité.
            </Text>
          </View>
          <View style={styles.stepItem}>
            <Text style={styles.stepNumber}>3.</Text>
            <Text style={styles.stepText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Création des Cliniques & Coordinateurs (ADMIN) :</Text> L&apos;administrateur de holding structure son réseau et nomme le coordinateur opérationnel de chaque établissement.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Synthèse des Règles de Sécurité & Conformité Sanitaire</Text>
      <View style={{ gap: 5, marginBottom: 8 }}>
        <View style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.borderLight, padding: 6, borderRadius: 4 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark, fontSize: 7.5 }}>
            • Journal d&apos;Audit Immuable (AuditLog HDS / RGPD)
          </Text>
          <Text style={{ fontSize: 6.8, color: colors.text, marginTop: 1.5 }}>
            Chaque consultation de dossier médical, modification de droits, transmission de résultats, ouverture de document scanné ou annulation financière fait l&apos;objet d&apos;un enregistrement chiffré infalsifiable avec horodatage et adresse IP.
          </Text>
        </View>

        <View style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.borderLight, padding: 6, borderRadius: 4 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark, fontSize: 7.5 }}>
            • Continuité de Service & Résilience Opérationnelle
          </Text>
          <Text style={{ fontSize: 6.8, color: colors.text, marginTop: 1.5 }}>
            Le retrait d&apos;un module applicatif masque les interfaces sans jamais détruire les données historiques. Le désengagement d&apos;un module d&apos;hospitalisation ou de transfusion est rigoureusement bloqué tant qu&apos;un séjour ou qu&apos;une transfusion est active.
          </Text>
        </View>

        <View style={{ backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.borderLight, padding: 6, borderRadius: 4 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: colors.primaryDark, fontSize: 7.5 }}>
            • Standards Hospitaliers Internationaux
          </Text>
          <Text style={{ fontSize: 6.8, color: colors.text, marginTop: 1.5 }}>
            Intégration native des standards mondiaux de santé : codage nosologique CIM-10, tri des urgences CIMU, check-list de sécurité opératoire OMS, et protocoles d&apos;interopérabilité biomédicale HL7 / FHIR.
          </Text>
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text>MedDoc EMR — Cartographie Officielle des User Flows</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  </Document>
);

async function main() {
  const rootDir = process.cwd();
  const auditDir = path.resolve(rootDir, "Audit");
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

  const rootPdfPath = path.resolve(rootDir, "MEDDOC_USER_FLOWS.pdf");
  const auditPdfPath = path.resolve(auditDir, "MEDDOC_USER_FLOWS.pdf");

  console.log(`Génération du PDF MedDoc User Flows...`);
  await renderToFile(React.createElement(MedDocUserFlowsDocument), rootPdfPath);
  fs.copyFileSync(rootPdfPath, auditPdfPath);

  const stats = fs.statSync(rootPdfPath);
  console.log(`PDF généré avec succès !`);
  console.log(`- Chemin racine : ${rootPdfPath} (${stats.size} octets)`);
  console.log(`- Chemin Audit  : ${auditPdfPath}`);
}

main().catch((err) => {
  console.error("Erreur lors de la génération du PDF:", err);
  process.exit(1);
});
