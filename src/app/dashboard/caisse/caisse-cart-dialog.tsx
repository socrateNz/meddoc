"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { ShoppingCart, Receipt, Trash2, Loader2, Printer, PlusCircle, CheckCircle2 } from "lucide-react";
import { createCaisseSale, payPendingInvoice } from "@/actions/finance";

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

interface CaisseCartDialogProps {
  mode: "sale" | "pay";
  cashSessionId: string;
  pharmacyItems: any[];
  patients?: any[];
  organizationId?: string;
  pendingInvoice?: {
    id: string;
    items: any[];
    patient?: { user?: { firstName: string; lastName: string } } | null;
    medicalRecord?: { title: string } | null;
  };
  onSuccess: (transaction: any) => void;
}

export default function CaisseCartDialog({ mode, cashSessionId, pharmacyItems, patients = [], organizationId, pendingInvoice, onSuccess }: CaisseCartDialogProps) {
  const [open, setOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>(() =>
    mode === "pay" && pendingInvoice
      ? (pendingInvoice.items || []).map((it: any, i: number) => ({
          id: `pending-${pendingInvoice.id}-${i}`,
          type: it.type,
          pharmacyItemId: it.pharmacyItemId,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          amount: it.amount,
        }))
      : []
  );
  const [cartPatientId, setCartPatientId] = useState("");
  const [customPatientNameInput, setCustomPatientNameInput] = useState("");
  const [customPatientPhoneInput, setCustomPatientPhoneInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Montant réellement remis par le client maintenant — reste synchronisé sur le total du panier
  // tant que le caissier n'y touche pas (comportement actuel inchangé, un clic = paiement
  // intégral) ; baissé, il ouvre une vente à crédit / un paiement partiel.
  const [amountReceivedInput, setAmountReceivedInput] = useState("0");
  const [amountTouched, setAmountTouched] = useState(false);

  const [addItemMode, setAddItemMode] = useState<"PHARMACY" | "SERVICE">(mode === "pay" ? "SERVICE" : "PHARMACY");
  const [addPharmacyItemId, setAddPharmacyItemId] = useState("");
  const [addPharmacyQty, setAddPharmacyQty] = useState<number | string>(1);
  const [addServiceDesc, setAddServiceDesc] = useState("");
  const [addServiceAmount, setAddServiceAmount] = useState("");

  const resetForm = () => {
    setAddPharmacyItemId("");
    setAddPharmacyQty(1);
    setAddServiceDesc("");
    setAddServiceAmount("");
    setMsg(null);
    setAmountTouched(false);
    if (mode === "sale") {
      setCartItems([]);
      setCartPatientId("");
      setCustomPatientNameInput("");
      setCustomPatientPhoneInput("");
    }
  };

  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (addItemMode === "PHARMACY") {
      if (!addPharmacyItemId) return;
      const item = pharmacyItems.find((i) => i.id === addPharmacyItemId);
      if (!item) return;
      const qty = Number(addPharmacyQty) || 1;
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

  const handleRemove = (id: string) => setCartItems((prev) => prev.filter((i) => i.id !== id));

  const grandTotal = cartItems.reduce((sum, i) => sum + i.amount, 0);
  const hasZeroAmountItem = cartItems.some((i) => i.amount <= 0);

  // Reste synchronisé sur le total tant que le caissier n'a pas lui-même modifié le champ.
  useEffect(() => {
    if (!amountTouched) setAmountReceivedInput(String(grandTotal));
  }, [grandTotal, amountTouched]);

  const amountReceived = Math.min(grandTotal, Math.max(0, Number(amountReceivedInput) || 0));
  const remainingAfterPayment = Math.max(0, grandTotal - amountReceived);

  const handleValidate = async () => {
    if (cartItems.length === 0) {
      setMsg({ type: "error", text: "Le panier est vide." });
      return;
    }
    if (mode === "pay" && hasZeroAmountItem) {
      setMsg({ type: "error", text: "Retirez ou corrigez les lignes à 0 FCFA (ex: frais de consultation) avant d'encaisser." });
      return;
    }
    if (mode === "pay" && amountReceived <= 0) {
      setMsg({ type: "error", text: "Indiquez le montant reçu (supérieur à 0)." });
      return;
    }

    setLoading(true);
    setMsg(null);
    try {
      const items = cartItems.map(({ type, pharmacyItemId, description, quantity, unitPrice, amount }) => ({
        type, pharmacyItemId, description, quantity, unitPrice, amount,
      }));

      const res = mode === "pay" && pendingInvoice
        ? await payPendingInvoice(pendingInvoice.id, cashSessionId, amountReceived, items)
        : await createCaisseSale({
            cashSessionId,
            items,
            patientId: cartPatientId || undefined,
            customPatientName: customPatientNameInput.trim() || undefined,
            customPatientPhone: customPatientPhoneInput.trim() || undefined,
            organizationId,
            amountReceived,
          });

      if (res.success) {
        setOpen(false);
        const txn = (res.data as any)?.transaction || res.data;
        const pendingInvoiceId = (res.data as any)?.pendingInvoice?.id;
        // La référence imprimée sur le ticket doit être celle que le pharmacien devra saisir pour
        // finaliser (PendingInvoice.id, cf. dispensePendingInvoice), pas l'id interne de la transaction.
        if (pendingInvoiceId) (txn as any).pendingInvoiceId = pendingInvoiceId;
        // Pour l'affichage "Total facture / Réglé sur ce ticket / Reste à payer" côté ticket
        // quand le paiement n'est pas intégral (cf. invoice-modal.tsx / invoice-pdf.tsx).
        (txn as any).invoiceTotalAmount = (res.data as any)?.invoiceTotalAmount;
        (txn as any).remainingDue = (res.data as any)?.remainingDue;
        onSuccess(txn);
        resetForm();
      } else {
        setMsg({ type: "error", text: res.error || "Erreur lors de la validation." });
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setLoading(false);
    }
  };

  const patientName = pendingInvoice?.patient?.user
    ? `${pendingInvoice.patient.user.lastName} ${pendingInvoice.patient.user.firstName}`
    : ((pendingInvoice as any)?.customPatientName || "Client comptant");

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      {mode === "sale" ? (
        <DialogTrigger render={<Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs" />}>
          <PlusCircle className="h-4 w-4" />
          Nouvelle vente
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs h-8" />}>
          <Receipt className="h-3.5 w-3.5" />
          Encaisser
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-blue-600 dark:text-blue-400">
            <ShoppingCart className="h-5 w-5" />
            {mode === "sale" ? "Vente comptant au guichet" : "Encaisser la facture"}
          </DialogTitle>
          <DialogDescription>
            {mode === "sale"
              ? "Composez le panier (médicaments et/ou frais) puis validez l'encaissement."
              : `${patientName} — ${pendingInvoice?.medicalRecord?.title ? `« ${pendingInvoice.medicalRecord.title} »` : "facture en attente"}. Ajustez les montants avant d'encaisser.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {msg && (
            <div className={`p-3 text-xs font-medium rounded-xl border ${msg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"}`}>
              {msg.text}
            </div>
          )}

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ajouter un article :</span>
              <div className="flex gap-1 ml-auto">
                <button type="button" onClick={() => setAddItemMode("PHARMACY")} className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${addItemMode === "PHARMACY" ? "bg-blue-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                  + Médicament
                </button>
                <button type="button" onClick={() => setAddItemMode("SERVICE")} className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${addItemMode === "SERVICE" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                  + Autres frais
                </button>
              </div>
            </div>

            <form onSubmit={handleAddToCart} className="space-y-3">
              {addItemMode === "PHARMACY" ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-7 space-y-1">
                    <Label htmlFor="addPharmacyItemId" className="text-xs">Médicament en stock *</Label>
                    <SearchableSelect
                      id="addPharmacyItemId"
                      value={addPharmacyItemId}
                      onValueChange={setAddPharmacyItemId}
                      placeholder="-- Rechercher un médicament --"
                      emptyText="Aucun médicament trouvé."
                      options={pharmacyItems.map((item) => ({
                        value: item.id,
                        label: `${item.name}${item.dosage ? ` (${item.dosage})` : ""}`,
                        description: `Stock: ${item.stockQuantity} · ${formatFCFA(item.unitPrice)}`,
                        disabled: item.stockQuantity <= 0,
                      }))}
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="addPharmacyQty" className="text-xs">Qté *</Label>
                    <Input
                      id="addPharmacyQty"
                      type="number"
                      min="1"
                      required
                      value={addPharmacyQty}
                      onChange={(e) => setAddPharmacyQty(e.target.value)}
                      onBlur={() => {
                        if (addPharmacyQty === "" || Number(addPharmacyQty) < 1) {
                          setAddPharmacyQty(1);
                        }
                      }}
                      className="h-9 text-xs rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={!addPharmacyItemId} className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs">+ Ajouter au Panier</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6 space-y-1">
                    <Label htmlFor="addServiceDesc" className="text-xs">Motif / Description de l&apos;acte *</Label>
                    <Input id="addServiceDesc" required placeholder="ex: Frais de consultation" value={addServiceDesc} onChange={(e) => setAddServiceDesc(e.target.value)} className="h-9 text-xs rounded-xl" />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <Label htmlFor="addServiceAmount" className="text-xs">Montant (FCFA) *</Label>
                    <Input id="addServiceAmount" type="number" min="1" required placeholder="5000" value={addServiceAmount} onChange={(e) => setAddServiceAmount(e.target.value)} className="h-9 text-xs rounded-xl" />
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={!addServiceDesc.trim() || !addServiceAmount} className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs">+ Ajouter au Panier</Button>
                  </div>
                </div>
              )}
            </form>
          </div>

          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-slate-100 dark:bg-slate-800/80 p-2.5 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[10px]">
              <div className="col-span-5">Désignation</div>
              <div className="col-span-2 text-center">Qté</div>
              <div className="col-span-2 text-right">P.U (FCFA)</div>
              <div className="col-span-2 text-right">Total FCFA</div>
              <div className="col-span-1 text-center">Retirer</div>
            </div>
            {cartItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-medium">Le panier est vide.</div>
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
                    <button type="button" onClick={() => handleRemove(item.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all" title="Supprimer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {mode === "sale" && (
              <div className="flex-1 max-w-md space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="cartPatientId" className="text-xs">Patient inscrit (Optionnel)</Label>
                  <SearchableSelect
                    id="cartPatientId"
                    value={cartPatientId}
                    onValueChange={(val) => {
                      setCartPatientId(val);
                      if (val) setCustomPatientNameInput("");
                    }}
                    placeholder="-- Aucun (Client comptant) --"
                    emptyText="Aucun patient trouvé."
                    options={patients.map((p) => ({ value: p.id, label: `${p.user.lastName} ${p.user.firstName}` }))}
                  />
                </div>
                {!cartPatientId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="customPatientNameInput" className="text-xs">Nom du client (Manuel)</Label>
                      <Input
                        id="customPatientNameInput"
                        value={customPatientNameInput}
                        onChange={(e) => setCustomPatientNameInput(e.target.value)}
                        placeholder="ex: M. Yao Alain"
                        className="h-8 text-xs rounded-xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="customPatientPhoneInput" className="text-xs">Téléphone (Optionnel)</Label>
                      <Input
                        id="customPatientPhoneInput"
                        value={customPatientPhoneInput}
                        onChange={(e) => setCustomPatientPhoneInput(e.target.value)}
                        placeholder="ex: 07 00 00 00 00"
                        className="h-8 text-xs rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="text-right ml-auto space-y-2">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total du panier</span>
                <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">{formatFCFA(grandTotal)}</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Label htmlFor="amountReceived" className="text-xs whitespace-nowrap">Montant reçu maintenant</Label>
                <Input
                  id="amountReceived"
                  type="number"
                  min="0"
                  max={grandTotal}
                  value={amountReceivedInput}
                  onChange={(e) => { setAmountTouched(true); setAmountReceivedInput(e.target.value); }}
                  className="h-9 w-32 text-sm font-bold text-right rounded-xl"
                />
              </div>
              {remainingAfterPayment > 0 && (
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-500">
                  Vente à crédit — reste à payer : {formatFCFA(remainingAfterPayment)}
                </p>
              )}
            </div>
          </div>

          <Button onClick={handleValidate} disabled={loading || cartItems.length === 0} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-bold shadow-xs text-sm">
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Encaissement...</>
            ) : (
              <><Printer className="h-4 w-4 mr-2" />Encaisser & imprimer le ticket ({formatFCFA(amountReceived)})</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
