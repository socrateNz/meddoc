"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2, Receipt, CheckCircle2 } from "lucide-react";
import { finalizePendingInvoice } from "@/actions/finance";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface CartItem {
  id: string;
  type: "PHARMACY" | "SERVICE";
  pharmacyItemId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface FinalizePendingInvoiceDialogProps {
  pendingInvoice: {
    id: string;
    items: any[];
    patient?: { user?: { firstName: string; lastName: string } } | null;
    medicalRecord?: { title: string } | null;
    createdAt: string | Date;
  };
  pharmacyItems: any[];
  onSuccess: (transaction: any) => void;
}

export default function FinalizePendingInvoiceDialog({ pendingInvoice, pharmacyItems, onSuccess }: FinalizePendingInvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>(() =>
    (pendingInvoice.items || []).map((it: any, i: number) => ({
      id: `pending-${pendingInvoice.id}-${i}`,
      type: it.type,
      pharmacyItemId: it.pharmacyItemId,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      amount: it.amount,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [addItemMode, setAddItemMode] = useState<"PHARMACY" | "SERVICE">("SERVICE");
  const [addPharmacyItemId, setAddPharmacyItemId] = useState("");
  const [addPharmacyQty, setAddPharmacyQty] = useState(1);
  const [addServiceDesc, setAddServiceDesc] = useState("");
  const [addServiceAmount, setAddServiceAmount] = useState("");

  const resetForm = () => {
    setAddPharmacyItemId("");
    setAddPharmacyQty(1);
    setAddServiceDesc("");
    setAddServiceAmount("");
    setMsg(null);
  };

  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (addItemMode === "PHARMACY") {
      if (!addPharmacyItemId) return;
      const item = pharmacyItems.find((i) => i.id === addPharmacyItemId);
      if (!item) return;
      const qty = Number(addPharmacyQty);
      if (qty <= 0) return;
      if (item.stockQuantity < qty) {
        setMsg({ type: "error", text: `Stock insuffisant pour ${item.name}. Disponible: ${item.stockQuantity}` });
        return;
      }
      setCartItems((prev) => [
        ...prev,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "PHARMACY",
          pharmacyItemId: item.id,
          description: `${item.name}${item.dosage ? ` (${item.dosage})` : ""}`,
          quantity: qty,
          unitPrice: item.unitPrice,
          amount: item.unitPrice * qty,
        },
      ]);
      setAddPharmacyItemId("");
      setAddPharmacyQty(1);
    } else {
      if (!addServiceDesc.trim() || !addServiceAmount) return;
      const amt = Number(addServiceAmount);
      if (amt <= 0) return;
      setCartItems((prev) => [
        ...prev,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "SERVICE",
          description: addServiceDesc.trim(),
          quantity: 1,
          unitPrice: amt,
          amount: amt,
        },
      ]);
      setAddServiceDesc("");
      setAddServiceAmount("");
    }
  };

  const handleRemove = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const grandTotal = cartItems.reduce((sum, i) => sum + i.amount, 0);
  const hasZeroAmountItem = cartItems.some((i) => i.amount <= 0);

  const handleFinalize = async () => {
    if (cartItems.length === 0) {
      setMsg({ type: "error", text: "La facture ne peut pas être vide." });
      return;
    }
    if (hasZeroAmountItem) {
      setMsg({ type: "error", text: "Retirez ou corrigez les lignes à 0 FCFA (ex: frais de consultation) avant de finaliser." });
      return;
    }

    setLoading(true);
    setMsg(null);
    try {
      const res = await finalizePendingInvoice(
        pendingInvoice.id,
        cartItems.map(({ type, pharmacyItemId, description, quantity, unitPrice, amount }) => ({
          type,
          pharmacyItemId,
          description,
          quantity,
          unitPrice,
          amount,
        }))
      );

      if (res.success) {
        setOpen(false);
        onSuccess(res.data);
      } else {
        setMsg({ type: "error", text: res.error || "Erreur lors de la finalisation." });
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setLoading(false);
    }
  };

  const patientName = pendingInvoice.patient?.user
    ? `${pendingInvoice.patient.user.lastName} ${pendingInvoice.patient.user.firstName}`
    : "Client comptant";

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs h-8" />}>
        <Receipt className="h-3.5 w-3.5" />
        Finaliser
      </DialogTrigger>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-blue-600 dark:text-blue-400">
            <Receipt className="h-5 w-5" />
            Finaliser la facture
          </DialogTitle>
          <DialogDescription>
            {patientName} — issue de la consultation {pendingInvoice.medicalRecord?.title ? `« ${pendingInvoice.medicalRecord.title} »` : ""}.
            Ajustez les montants (notamment les frais de consultation) avant de valider l&apos;encaissement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {msg && (
            <div className={`p-3 text-xs font-medium rounded-xl border ${msg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"}`}>
              {msg.text}
            </div>
          )}

          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-800/80 p-2.5 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[10px]">
              <div className="col-span-5">Désignation</div>
              <div className="col-span-2 text-center">Qté</div>
              <div className="col-span-2 text-right">P.U (FCFA)</div>
              <div className="col-span-2 text-right">Total FCFA</div>
              <div className="col-span-1 text-center">Retirer</div>
            </div>

            {cartItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-medium">
                Aucun article. Ajoutez au moins un acte ou un médicament ci-dessous.
              </div>
            ) : (
              cartItems.map((item) => (
                <div key={item.id} className={`grid grid-cols-12 p-3 font-medium border-t border-slate-100 dark:border-slate-800 items-center ${item.amount <= 0 ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                  <div className="col-span-5 font-semibold text-slate-900 dark:text-white">
                    <span className={`inline-block px-1.5 py-0.5 mr-1.5 text-[9px] font-bold rounded ${item.type === "PHARMACY" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                      {item.type === "PHARMACY" ? "Pharma" : "Acte"}
                    </span>
                    {item.description}
                  </div>
                  <div className="col-span-2 text-center">{item.quantity}</div>
                  <div className="col-span-2 text-right">{formatFCFA(item.unitPrice)}</div>
                  <div className={`col-span-2 text-right font-bold ${item.amount <= 0 ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>
                    {item.amount <= 0 ? "À définir" : formatFCFA(item.amount)}
                  </div>
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ajouter un article :</span>
              <div className="flex gap-1 ml-auto">
                <button
                  type="button"
                  onClick={() => setAddItemMode("SERVICE")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${addItemMode === "SERVICE" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                >
                  + Frais / Acte
                </button>
                <button
                  type="button"
                  onClick={() => setAddItemMode("PHARMACY")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${addItemMode === "PHARMACY" ? "bg-blue-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                >
                  + Médicament
                </button>
              </div>
            </div>

            <form onSubmit={handleAddToCart} className="space-y-3">
              {addItemMode === "SERVICE" ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6 space-y-1">
                    <Label htmlFor="addServiceDesc" className="text-xs">Motif / Description *</Label>
                    <Input
                      id="addServiceDesc"
                      required
                      placeholder="ex: Frais de consultation"
                      value={addServiceDesc}
                      onChange={(e) => setAddServiceDesc(e.target.value)}
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <Label htmlFor="addServiceAmount" className="text-xs">Montant (FCFA) *</Label>
                    <Input
                      id="addServiceAmount"
                      type="number"
                      min="1"
                      required
                      placeholder="5000"
                      value={addServiceAmount}
                      onChange={(e) => setAddServiceAmount(e.target.value)}
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={!addServiceDesc.trim() || !addServiceAmount} className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs">
                      + Ajouter
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-7 space-y-1">
                    <Label htmlFor="addPharmacyItemId" className="text-xs">Médicament en stock *</Label>
                    <select
                      id="addPharmacyItemId"
                      required
                      value={addPharmacyItemId}
                      onChange={(e) => setAddPharmacyItemId(e.target.value)}
                      className="w-full h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="">-- Choisir un médicament --</option>
                      {pharmacyItems.map((item) => (
                        <option key={item.id} value={item.id} disabled={item.stockQuantity <= 0}>
                          {item.name} {item.dosage ? `(${item.dosage})` : ""} - Stock: {item.stockQuantity} - {formatFCFA(item.unitPrice)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="addPharmacyQty" className="text-xs">Qté *</Label>
                    <Input
                      id="addPharmacyQty"
                      type="number"
                      min="1"
                      required
                      value={addPharmacyQty}
                      onChange={(e) => setAddPharmacyQty(Math.max(1, Number(e.target.value)))}
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={!addPharmacyItemId} className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs">
                      + Ajouter
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">TOTAL NET À ENCAISSER</span>
            <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{formatFCFA(grandTotal)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
            Annuler
          </Button>
          <Button onClick={handleFinalize} disabled={loading} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Valider la facture ({formatFCFA(grandTotal)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
