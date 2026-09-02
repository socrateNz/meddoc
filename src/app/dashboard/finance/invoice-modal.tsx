"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, Receipt, FileText, CheckCircle2 } from "lucide-react";
import PDFDownloadButton from "@/components/pdf/pdf-download-button";

interface InvoiceModalProps {
  transaction: any;
  organizationName?: string;
  organizationLogoUrl?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerBtn?: React.ReactNode;
}

export default function InvoiceModal({ transaction, organizationName, organizationLogoUrl, open: externalOpen, onOpenChange: externalOnOpenChange, triggerBtn }: InvoiceModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [viewFormat, setViewFormat] = useState<"thermal" | "a4">("thermal");

  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isControlled && externalOnOpenChange) {
      externalOnOpenChange(val);
    } else {
      setInternalOpen(val);
    }
  };

  if (!transaction) return null;

  const formatFCFA = (val: number) => {
    const num = Math.round(Number(val) || 0);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  };

  const isIncome = transaction.type === "INCOME";
  const isPharmacy = transaction.category === "PHARMACY_SALE";
  const docTitle = isIncome ? (isPharmacy ? "FACTURE VENTE PHARMACIE" : "REÇU DE CAISSE") : "PIÈCE DE SORTIE";
  const invoiceNum = `FAC-${(transaction.id || "000000").slice(-6).toUpperCase()}`;

  const qty = transaction.quantity || 1;
  const unitPrice = transaction.pharmacyItem?.unitPrice || (transaction.amount / qty);

  const rawDate = transaction.createdAt ? new Date(transaction.createdAt) : new Date();

  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(rawDate);

  const formattedTime = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(rawDate);

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerBtn && (
        <DialogTrigger render={triggerBtn as any}>
          {triggerBtn}
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[580px] max-h-[92vh] rounded-3xl p-0 overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex flex-col text-slate-100">
        {/* Header with Format Switcher */}
        <DialogHeader className="p-5 pb-3 bg-slate-950 border-b border-slate-800 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-white">
              <Receipt className="h-5 w-5 text-emerald-400" />
              Ticket / Facture de Caisse
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 mt-0.5">
              Format ticket thermique 80mm de caisse & export PDF.
            </DialogDescription>
          </div>

          {/* Toggle format buttons */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewFormat("thermal")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                viewFormat === "thermal"
                  ? "bg-emerald-500 text-slate-950 shadow-xs font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              Ticket 80mm
            </button>
            <button
              onClick={() => setViewFormat("a4")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                viewFormat === "a4"
                  ? "bg-emerald-500 text-slate-950 shadow-xs font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Format A4
            </button>
          </div>
        </DialogHeader>

        {/* Printable View Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/60 flex justify-center items-start">
          {viewFormat === "thermal" ? (
            /* POS Thermal Receipt Ticket 80mm (Matches User's Picture) */
            <div
              id="printable-receipt"
              className="w-full max-w-[330px] bg-[#fbfbfa] text-slate-900 font-mono p-5 rounded-sm shadow-2xl border border-slate-300 relative text-xs select-none tracking-tight"
              style={{
                boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 0 100px rgba(0,0,0,0.02)",
              }}
            >
              {/* Receipt Top Jagged Effect / Header */}
              <div className="text-center space-y-1 mb-3">
                <h3 className="text-sm font-extrabold tracking-wider uppercase text-black">*** REÇU DE CAISSE ***</h3>
                {organizationLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={organizationLogoUrl} alt="" className="h-10 w-10 object-contain mx-auto" />
                )}
                <p className="text-xs font-extrabold uppercase text-slate-800">{organizationName || "MEDDOC - CENTRE MÉDICAL"}</p>
                <p className="text-[10px] text-slate-600">Plateforme Médicale & Pharmacie</p>
                <p className="text-[10px] text-slate-600">Tél: +241 01 02 03 04</p>
              </div>

              {/* Dashed Separator */}
              <div className="border-b border-dashed border-slate-800 my-2" />

              {/* Metadata Info */}
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between font-bold">
                  <span>TICKET: {invoiceNum}</span>
                  <span>DATE: {formattedDate}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>CAISSE: {transaction.recordedBy ? `${transaction.recordedBy.lastName}` : "Caissier 01"}</span>
                  <span>HEURE: {formattedTime}</span>
                </div>
                {transaction.patient?.user && (
                  <div className="text-slate-800 font-medium truncate pt-0.5">
                    CLIENT: {transaction.patient.user.lastName} {transaction.patient.user.firstName}
                  </div>
                )}
              </div>

              {/* Dashed Separator */}
              <div className="border-b border-dashed border-slate-800 my-2.5" />

              {/* Table Headers */}
              <div className="flex font-bold text-[10px] uppercase border-b border-dashed border-slate-800 pb-1 mb-2">
                <span className="w-10">QTE</span>
                <span className="flex-1">DESIGNATION</span>
                <span className="w-16 text-right">P.U</span>
                <span className="w-18 text-right">TOTAL</span>
              </div>

              {/* Items List */}
              <div className="space-y-2 mb-3">
                {itemList.map((item: any, idx: number) => (
                  <div key={idx} className="flex text-[11px] items-start">
                    <span className="w-10 font-bold text-slate-800">{item.quantity || 1}</span>
                    <span className="flex-1 font-medium text-slate-900 pr-1 break-words">{item.description}</span>
                    <span className="w-16 text-right text-slate-700">{formatFCFA(item.unitPrice || item.amount).replace(" FCFA", "")}</span>
                    <span className="w-18 text-right font-bold text-slate-900">{formatFCFA(item.amount).replace(" FCFA", "")}</span>
                  </div>
                ))}
              </div>

              {/* Dashed Separator */}
              <div className="border-b border-dashed border-slate-800 my-2" />

              {/* Totals */}
              <div className="space-y-1 my-2">
                <div className="flex justify-between items-center text-sm font-extrabold pt-1">
                  <span>TOTAL NET :</span>
                  <span className="text-base text-black">{formatFCFA(transaction.amount)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-700 font-semibold">
                  <span>MODE PAIEMENT:</span>
                  <span>ESPECES / CAISSE</span>
                </div>
              </div>

              {/* Dashed Separator */}
              <div className="border-b border-dashed border-slate-800 my-3" />

              {/* Barcode representation */}
              <div className="text-center my-3 space-y-1">
                <div className="font-bold text-lg tracking-widest text-black select-none">
                  ||||| | |||| || ||||| ||| ||||
                </div>
                <p className="text-[10px] font-bold tracking-wider text-slate-700">*{invoiceNum}*</p>
              </div>

              {/* Footer text */}
              <div className="text-center text-[11px] font-bold text-slate-800 mt-4 uppercase tracking-wider">
                * THANK YOU / MERCI *
              </div>
              {hasPharmacyItem && (
                <div className="text-center text-[11px] font-extrabold text-slate-900 mt-2 uppercase tracking-wider">
                  À PRÉSENTER AU COMPTOIR PHARMACIE
                </div>
              )}
            </div>
          ) : (
            /* Standard A4 Preview */
            <div id="printable-receipt" className="w-full bg-white text-slate-900 p-6 rounded-2xl shadow-xl text-xs space-y-5">
              <div className="flex items-start justify-between border-b-2 border-blue-600 pb-4">
                <div className="flex items-center gap-3">
                  {organizationLogoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={organizationLogoUrl} alt="" className="h-12 w-12 object-contain shrink-0" />
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-blue-700 uppercase tracking-tight">{organizationName || "ÉTABLISSEMENT MÉDICAL"}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Plateforme de Gestion Médicale & Pharmacie</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold tracking-tight uppercase block text-slate-900">{docTitle}</span>
                  <span className="text-xs font-bold text-blue-600 block mt-0.5">N° {invoiceNum}</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">{formattedDate} - {formattedTime}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px] mb-1">Client / Patient</span>
                  {transaction.patient?.user ? (
                    <div>
                      <p className="font-bold text-slate-900">{transaction.patient.user.lastName} {transaction.patient.user.firstName}</p>
                      <p className="text-slate-500">{transaction.patient.user.email}</p>
                    </div>
                  ) : (
                    <p className="font-medium text-slate-700">Client comptant / Vente directe</p>
                  )}
                </div>

                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px] mb-1">Émis par</span>
                  <p className="font-bold text-slate-900">
                    {transaction.recordedBy ? `${transaction.recordedBy.firstName} ${transaction.recordedBy.lastName}` : "Personnel de caisse"}
                  </p>
                  <p className="text-slate-500">Mode : Espèces / Caisse Directe</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                  <div className="col-span-6">Désignation / Motif</div>
                  <div className="col-span-2 text-center">Qté</div>
                  <div className="col-span-2 text-right">P.U (FCFA)</div>
                  <div className="col-span-2 text-right">Total FCFA</div>
                </div>

                {itemList.map((item: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-12 p-3 font-medium border-t border-slate-100 items-center">
                    <div className="col-span-6 font-semibold text-slate-900">{item.description}</div>
                    <div className="col-span-2 text-center">{item.quantity || 1}</div>
                    <div className="col-span-2 text-right">{formatFCFA(item.unitPrice || item.amount)}</div>
                    <div className="col-span-2 text-right font-bold text-slate-900">{formatFCFA(item.amount)}</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <div className="w-full sm:w-1/2 p-3.5 rounded-xl border border-blue-500/30 bg-blue-50 text-blue-950 flex justify-between items-center">
                  <span className="font-bold text-sm uppercase">TOTAL NET :</span>
                  <span className="text-xl font-extrabold text-blue-700">{formatFCFA(transaction.amount)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl border-slate-800 text-slate-300 hover:bg-slate-900">
            Fermer
          </Button>

          <div className="flex items-center gap-2">
            <PDFDownloadButton
              documentName={`Ticket_${invoiceNum}`}
              type="invoice"
              data={{ transaction, organizationName, organizationLogoUrl, format: viewFormat }}
              buttonText="Télécharger PDF"
              variant="outline"
              size="default"
              className="rounded-xl border-slate-700 text-slate-200 hover:bg-slate-800"
            />
            <Button
              onClick={handlePrint}
              className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-lg"
            >
              <Printer className="h-4 w-4" />
              Imprimer Ticket ({viewFormat === "thermal" ? "80mm" : "A4"})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
