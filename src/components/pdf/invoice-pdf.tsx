"use client";

import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

// Styles for standard A4 Invoice
const a4Styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Helvetica",
    color: "#1e293b",
    fontSize: 9,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    paddingBottom: 15,
    marginBottom: 20,
  },
  clinicInfo: {
    flexDirection: "column",
  },
  logoImage: {
    width: 42,
    height: 42,
    objectFit: "contain",
    marginBottom: 4,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e40af",
  },
  companySub: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  invoiceMeta: {
    textAlign: "right",
  },
  invoiceTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e293b",
    textTransform: "uppercase",
  },
  invoiceNumber: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#2563eb",
    marginTop: 2,
  },
  invoiceDate: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 10,
    marginBottom: 20,
  },
  infoBox: {
    flexDirection: "column",
    width: "48%",
  },
  infoTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 2,
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    marginBottom: 20,
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
    padding: 8,
  },
  colDesc: {
    width: "50%",
    fontWeight: "bold",
  },
  colQty: {
    width: "15%",
    textAlign: "center",
  },
  colUnitPrice: {
    width: "17.5%",
    textAlign: "right",
  },
  colTotal: {
    width: "17.5%",
    textAlign: "right",
    fontWeight: "bold",
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 30,
  },
  totalBox: {
    width: "45%",
    borderWidth: 1,
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    padding: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e40af",
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e40af",
  },
  footer: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 15,
  },
  signatureBox: {
    width: "40%",
    textAlign: "center",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    marginTop: 35,
    paddingTop: 4,
    fontSize: 8,
    color: "#64748b",
  },
  // Petit pied de page répété identique sur chaque page (fixed) — distinct du bloc signature
  // ci-dessus, qui n'apparaît qu'une fois là où le contenu se termine réellement.
  pageFooter: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
});

// Styles for 80mm Thermal Receipt (POS Ticket)
const thermalStyles = StyleSheet.create({
  page: {
    padding: 10,
    fontFamily: "Courier",
    fontSize: 7.5,
    color: "#000000",
    backgroundColor: "#ffffff",
  },
  header: {
    alignItems: "center",
    textAlign: "center",
    marginBottom: 4,
  },
  receiptTitle: {
    fontSize: 11,
    fontFamily: "Courier-Bold",
    textTransform: "uppercase",
    marginBottom: 2,
    textAlign: "center",
  },
  logoImage: {
    width: 32,
    height: 32,
    objectFit: "contain",
    marginBottom: 2,
  },
  companyName: {
    fontSize: 9,
    fontFamily: "Courier-Bold",
    textAlign: "center",
  },
  companySub: {
    fontSize: 6.5,
    textAlign: "center",
    marginTop: 1,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    borderBottomStyle: "dashed",
    marginVertical: 4,
  },
  metaLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    marginBottom: 2,
  },
  tableHeader: {
    flexDirection: "row",
    fontFamily: "Courier-Bold",
    fontSize: 6.5,
    paddingBottom: 2,
    marginBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    borderBottomStyle: "dashed",
  },
  tableRow: {
    flexDirection: "row",
    fontSize: 6.5,
    marginBottom: 3,
  },
  colQty: {
    width: "12%",
  },
  colDesc: {
    width: "48%",
  },
  colPrice: {
    width: "20%",
    textAlign: "right",
  },
  colTotal: {
    width: "20%",
    textAlign: "right",
  },
  totalSection: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    borderTopStyle: "dashed",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontFamily: "Courier-Bold",
    fontSize: 9,
    marginTop: 2,
  },
  totalAmount: {
    fontSize: 10,
    fontFamily: "Courier-Bold",
  },
  barcodeBox: {
    alignItems: "center",
    marginTop: 8,
  },
  barcodeText: {
    fontSize: 6.5,
    fontFamily: "Courier",
    letterSpacing: 1,
    marginTop: 2,
  },
  footerMessage: {
    textAlign: "center",
    fontSize: 7.5,
    fontFamily: "Courier-Bold",
    marginTop: 8,
  }
});

interface InvoicePDFProps {
  transaction: any;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  format?: "thermal" | "a4";
}

export default function InvoicePDFDocument({ transaction, organizationName, organizationLogoUrl, format = "thermal" }: InvoicePDFProps) {
  const formatFCFA = (val: number) => {
    const num = Math.round(Number(val) || 0);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  };

  const isIncome = transaction.type === "INCOME";
  const isPharmacy = transaction.category === "PHARMACY_SALE";
  const docTitle = isIncome ? (isPharmacy ? "FACTURE VENTE PHARMACIE" : "REÇU DE CAISSE") : "PIÈCE DE SORTIE";
  // Même référence que côté écran (invoice-modal.tsx) : celle que la pharmacie recherche
  // (PendingInvoice.id), pas l'id interne de la transaction.
  const referenceId = transaction.pendingInvoiceId || transaction.id || "000000";
  const invoiceNum = `FAC-${String(referenceId).slice(-6).toUpperCase()}`;

  const qty = transaction.quantity || 1;
  const unitPrice = transaction.pharmacyItem?.unitPrice || (transaction.amount / qty);

  const formattedDate = transaction.createdAt 
    ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(transaction.createdAt))
    : new Date().toLocaleDateString("fr-FR");

  const formattedTime = transaction.createdAt
    ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(transaction.createdAt))
    : new Date().toLocaleTimeString("fr-FR");

  let itemList: any[] = [];
  if (Array.isArray(transaction.items) && transaction.items.length > 0) {
    itemList = transaction.items;
  } else if (transaction.itemsJson) {
    try {
      const parsed = JSON.parse(transaction.itemsJson);
      if (Array.isArray(parsed) && parsed.length > 0) itemList = parsed;
    } catch (e) {}
  }

  const rawDesc = transaction.description || "";

  // Parse multi-item summary strings if items list is empty or single summary
  if (itemList.length <= 1 && rawDesc.includes("articles :")) {
    const afterArticles = rawDesc.split("articles :")[1] || "";
    const itemsPart = afterArticles.replace(/\)$/, "").trim();
    if (itemsPart) {
      const itemTokens = itemsPart.split(/,\s*(?=[A-Za-z0-9])/);
      const parsedList: any[] = [];
      for (const token of itemTokens) {
        let clean = token.replace(/^Vente pharmacie:\s*/i, "").trim();
        const match = clean.match(/^(\d+)\s*x\s+(.+)$/i);
        if (match) {
          const q = parseInt(match[1], 10);
          const name = match[2].trim();
          parsedList.push({
            description: name,
            quantity: q,
            unitPrice: Math.round(transaction.amount / (itemTokens.length * q)) || 0,
            amount: Math.round(transaction.amount / itemTokens.length)
          });
        } else {
          parsedList.push({
            description: clean,
            quantity: 1,
            unitPrice: Math.round(transaction.amount / itemTokens.length),
            amount: Math.round(transaction.amount / itemTokens.length)
          });
        }
      }
      if (parsedList.length > 0) itemList = parsedList;
    }
  }

  if (itemList.length === 0) {
    let desc = rawDesc || "Prestation / Produit";
    desc = desc.replace(/^Vente pharmacie:\s*/i, "").replace(/^\d+\s*x\s*/i, "").trim() || desc;
    itemList = [{
      description: desc,
      quantity: qty,
      unitPrice: unitPrice,
      amount: transaction.amount
    }];
  } else {
    itemList = itemList.map((item: any) => {
      let desc = item.description || "";
      desc = desc.replace(/^Vente pharmacie:\s*/i, "").trim();
      if (item.quantity && item.quantity > 1) {
        desc = desc.replace(new RegExp(`^${item.quantity}\\s*x\\s*`, "i"), "").trim();
      }
      const itemQty = item.quantity || 1;
      const itemPu = item.unitPrice || (item.amount ? Math.round(item.amount / itemQty) : 0);
      return {
        ...item,
        description: desc,
        quantity: itemQty,
        unitPrice: itemPu,
        amount: item.amount || (itemPu * itemQty)
      };
    });
  }

  const hasPharmacyItem = itemList.some((item: any) => item.type === "PHARMACY");

  // Thermal 80mm format (default)
  if (format === "thermal") {
    const pageHeight = Math.max(320, 220 + itemList.length * 18);

    return (
      <Document>
        <Page size={[226.77, pageHeight]} style={thermalStyles.page}>
          {/* Header */}
          <View style={thermalStyles.header}>
            <Text style={thermalStyles.receiptTitle}>*** REÇU DE CAISSE ***</Text>
            {organizationLogoUrl && <Image src={organizationLogoUrl} style={thermalStyles.logoImage} />}
            <Text style={thermalStyles.companyName}>{organizationName || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={thermalStyles.companySub}>Plateforme Médicale & Pharmacie</Text>
          </View>

          <View style={thermalStyles.divider} />

          {/* Metadata */}
          <View style={thermalStyles.metaLine}>
            <Text>TICKET: {invoiceNum}</Text>
            <Text>DATE: {formattedDate}</Text>
          </View>
          <View style={thermalStyles.metaLine}>
            <Text>CAISSE: {transaction.recordedBy ? `${transaction.recordedBy.lastName}` : "Caissier 01"}</Text>
            <Text>HEURE: {formattedTime}</Text>
          </View>

          {transaction.patient?.user && (
            <View style={thermalStyles.metaLine}>
              <Text>CLIENT: {transaction.patient.user.lastName} {transaction.patient.user.firstName}</Text>
            </View>
          )}

          <View style={thermalStyles.divider} />

          {/* Table Header */}
          <View style={thermalStyles.tableHeader}>
            <Text style={thermalStyles.colQty}>QTE</Text>
            <Text style={thermalStyles.colDesc}>DESIGNATION</Text>
            <Text style={thermalStyles.colPrice}>P.U</Text>
            <Text style={thermalStyles.colTotal}>TOTAL</Text>
          </View>

          {/* Items */}
          {itemList.map((item: any, idx: number) => (
            <View key={idx} style={thermalStyles.tableRow}>
              <Text style={thermalStyles.colQty}>{item.quantity || 1}</Text>
              <Text style={thermalStyles.colDesc}>{item.description}</Text>
              <Text style={thermalStyles.colPrice}>{formatFCFA(item.unitPrice || item.amount)}</Text>
              <Text style={thermalStyles.colTotal}>{formatFCFA(item.amount)}</Text>
            </View>
          ))}

          {/* Total */}
          <View style={thermalStyles.totalSection}>
            <View style={thermalStyles.totalRow}>
              <Text>TOTAL NET :</Text>
              <Text style={thermalStyles.totalAmount}>{formatFCFA(transaction.amount)}</Text>
            </View>
            <View style={thermalStyles.metaLine}>
              <Text>PAYEMENT: ESPECES / CAISSE</Text>
            </View>
          </View>

          <View style={thermalStyles.divider} />

          {/* Barcode & Footer */}
          <View style={thermalStyles.barcodeBox}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14 }}>||||| | |||| || ||||| |||</Text>
            <Text style={thermalStyles.barcodeText}>*{invoiceNum}*</Text>
          </View>

          <Text style={thermalStyles.footerMessage}>* MERCI DE VOTRE CONFIANCE *</Text>
          {hasPharmacyItem && (
            <Text style={thermalStyles.footerMessage}>À PRÉSENTER AU COMPTOIR PHARMACIE</Text>
          )}
        </Page>
      </Document>
    );
  }

  // A4 Format fallback
  return (
    <Document>
      <Page size="A4" style={a4Styles.page}>
        {/* En-tête — fixed : répété identique sur chaque page */}
        <View style={a4Styles.header} fixed>
          <View style={a4Styles.clinicInfo}>
            {organizationLogoUrl && <Image src={organizationLogoUrl} style={a4Styles.logoImage} />}
            <Text style={a4Styles.companyName}>{organizationName || "MEDDOC - CENTRE MÉDICAL"}</Text>
            <Text style={a4Styles.companySub}>Plateforme de Gestion Médicale & Pharmacie</Text>
          </View>
          <View style={a4Styles.invoiceMeta}>
            <Text style={a4Styles.invoiceTitle}>{docTitle}</Text>
            <Text style={a4Styles.invoiceNumber}>N° {invoiceNum}</Text>
            <Text style={a4Styles.invoiceDate}>Date: {formattedDate}</Text>
          </View>
        </View>

        {/* Informatives */}
        <View style={a4Styles.infoSection}>
          <View style={a4Styles.infoBox}>
            <Text style={a4Styles.infoTitle}>Client / Patient</Text>
            {transaction.patient?.user ? (
              <>
                <Text style={a4Styles.infoText}>Nom: {transaction.patient.user.lastName} {transaction.patient.user.firstName}</Text>
                <Text style={a4Styles.infoText}>Email: {transaction.patient.user.email}</Text>
              </>
            ) : (
              <Text style={a4Styles.infoText}>Client comptant / Anonyme</Text>
            )}
          </View>

          <View style={a4Styles.infoBox}>
            <Text style={a4Styles.infoTitle}>Émis par</Text>
            <Text style={a4Styles.infoText}>Caissier / Agent: {transaction.recordedBy ? `${transaction.recordedBy.firstName} ${transaction.recordedBy.lastName}` : "Personnel de caisse"}</Text>
            <Text style={a4Styles.infoText}>Mode de règlement: Espèces / Caisse Directe</Text>
          </View>
        </View>

        {/* Tableau de facturation */}
        <View style={a4Styles.table}>
          <View style={a4Styles.tableHeader}>
            <Text style={[a4Styles.colDesc, a4Styles.tableHeaderText]}>Désignation / Motif</Text>
            <Text style={[a4Styles.colQty, a4Styles.tableHeaderText]}>Qté</Text>
            <Text style={[a4Styles.colUnitPrice, a4Styles.tableHeaderText]}>Prix Unit.</Text>
            <Text style={[a4Styles.colTotal, a4Styles.tableHeaderText]}>Total FCFA</Text>
          </View>

          {itemList.map((item: any, idx: number) => (
            <View key={idx} style={a4Styles.tableRow}>
              <Text style={a4Styles.colDesc}>{item.description}</Text>
              <Text style={a4Styles.colQty}>{item.quantity || 1}</Text>
              <Text style={a4Styles.colUnitPrice}>{formatFCFA(item.unitPrice || item.amount)}</Text>
              <Text style={a4Styles.colTotal}>{formatFCFA(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Total Net */}
        <View style={a4Styles.totalSection}>
          <View style={a4Styles.totalBox}>
            <View style={a4Styles.totalRow}>
              <Text style={a4Styles.totalLabel}>TOTAL NET À PAYER :</Text>
              <Text style={a4Styles.totalAmount}>{formatFCFA(transaction.amount)}</Text>
            </View>
          </View>
        </View>

        {/* Signatures */}
        <View style={a4Styles.footer}>
          <View style={a4Styles.signatureBox}>
            <Text style={a4Styles.signatureLine}>Signature du Client</Text>
          </View>
          <View style={a4Styles.signatureBox}>
            <Text style={a4Styles.signatureLine}>Cachet & Signature Caissier</Text>
          </View>
        </View>

        {/* fixed : répété identique en bas de chaque page (distinct des signatures
            ci-dessus, qui n'apparaissent qu'une fois à la fin réelle du contenu) */}
        <View style={a4Styles.pageFooter} fixed>
          <Text>Document officiel généré via MedDoc • Merci pour votre confiance</Text>
        </View>
      </Page>
    </Document>
  );
}
