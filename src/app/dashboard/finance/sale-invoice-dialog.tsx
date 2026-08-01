"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Trash2, Loader2, Printer, PlusCircle } from "lucide-react";
import { recordMultiItemInvoice } from "@/actions/finance";

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

interface SaleInvoiceDialogProps {
  pharmacyItems: any[];
  patients: any[];
  organizationId?: string;
  onSuccess: (transaction: any) => void;
}

export default function SaleInvoiceDialog({ pharmacyItems, patients, organizationId, onSuccess }: SaleInvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartPatientId, setCartPatientId] = useState("");
  const [cartLoading, setCartLoading] = useState(false);
  const [cartMsg, setCartMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [addItemMode, setAddItemMode] = useState<"PHARMACY" | "SERVICE">("PHARMACY");
  const [addPharmacyItemId, setAddPharmacyItemId] = useState("");
  const [addPharmacyQty, setAddPharmacyQty] = useState(1);
  const [addServiceDesc, setAddServiceDesc] = useState("");
  const [addServiceAmount, setAddServiceAmount] = useState("");

  const resetCart = () => {
    setCartItems([]);
    setCartPatientId("");
    setCartMsg(null);
    setAddPharmacyItemId("");
    setAddPharmacyQty(1);
    setAddServiceDesc("");
    setAddServiceAmount("");
  };

  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    setCartMsg(null);

    if (addItemMode === "PHARMACY") {
      if (!addPharmacyItemId) return;
      const item = pharmacyItems.find((i) => i.id === addPharmacyItemId);
      if (!item) return;

      const qty = Number(addPharmacyQty);
      if (qty <= 0) return;
      if (item.stockQuantity < qty) {
        setCartMsg({ type: "error", text: `Stock insuffisant pour ${item.name}. Disponible: ${item.stockQuantity}` });
        return;
      }

      setCartItems((prev) => [
        ...prev,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
          id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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

  const handleRemoveFromCart = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleLoadPatientPrescriptions = () => {
    if (!cartPatientId) {
      setCartMsg({ type: "error", text: "Veuillez sélectionner un patient ci-dessous avant d'importer une ordonnance." });
      return;
    }
    const patient = patients.find((p) => p.id === cartPatientId);
    if (!patient) return;

    const prescribedList: Array<{ name: string; dosage?: string }> = [];
    if (Array.isArray(patient.carePlans)) {
      patient.carePlans.forEach((plan: any) => {
        if (Array.isArray(plan.medications)) {
          plan.medications.forEach((med: any) => {
            prescribedList.push({ name: med.name, dosage: med.dosage });
          });
        }
      });
    }

    if (prescribedList.length === 0) {
      setCartMsg({ type: "error", text: `Aucune ordonnance/prescription active enregistrée pour ${patient.user?.lastName || "ce patient"}.` });
      return;
    }

    let addedCount = 0;
    const newItems = [...cartItems];
    prescribedList.forEach((med) => {
      const match = pharmacyItems.find((p) =>
        p.name.toLowerCase().includes(med.name.toLowerCase()) || med.name.toLowerCase().includes(p.name.toLowerCase())
      );
      if (match) {
        newItems.push({
          id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: "PHARMACY",
          pharmacyItemId: match.id,
          description: `${match.name}${match.dosage ? ` (${match.dosage})` : ""}`,
          quantity: 1,
          unitPrice: match.unitPrice,
          amount: match.unitPrice,
        });
      } else {
        newItems.push({
          id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: "SERVICE",
          description: `Prescription: ${med.name}${med.dosage ? ` (${med.dosage})` : ""}`,
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
        });
      }
      addedCount++;
    });

    setCartItems(newItems);
    setCartMsg({ type: "success", text: `${addedCount} produit(s) d'ordonnance chargé(s) dans le panier avec succès !` });
  };

  const cartGrandTotal = cartItems.reduce((sum, item) => sum + item.amount, 0);

  const handleValidateCart = async () => {
    if (cartItems.length === 0) return;
    setCartLoading(true);
    setCartMsg(null);

    try {
      const selectedPatient = patients.find((p) => p.id === cartPatientId);
      const res = await recordMultiItemInvoice({
        items: cartItems.map(({ type, pharmacyItemId, description, quantity, unitPrice, amount }) => ({
          type,
          pharmacyItemId,
          description,
          quantity,
          unitPrice,
          amount,
        })),
        patientId: cartPatientId || undefined,
        organizationId,
      });

      if (res.success) {
        const transactionObj = res.data || {
          id: `fac-${Date.now()}`,
          type: "INCOME",
          amount: cartGrandTotal,
          description: `Facture regroupée (${cartItems.length} articles)`,
          items: cartItems,
          patient: selectedPatient || null,
          createdAt: new Date().toISOString(),
        };

        resetCart();
        setOpen(false);
        onSuccess(transactionObj);
      } else {
        setCartMsg({ type: "error", text: res.error || "Erreur lors de la validation." });
      }
    } catch (err: any) {
      setCartMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setCartLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetCart(); }}>
      <DialogTrigger render={<Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs" />}>
        <PlusCircle className="h-4 w-4" />
        Nouvelle vente / Facture
      </DialogTrigger>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-blue-600 dark:text-blue-400">
            <ShoppingCart className="h-5 w-5" />
            Panier de facturation (multi-articles)
          </DialogTitle>
          <DialogDescription>
            Ajoutez plusieurs médicaments et actes médicaux sur la même facture avant de valider l&apos;encaissement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {cartMsg && (
            <div className={`p-3 text-xs font-medium rounded-xl border ${cartMsg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"}`}>
              {cartMsg.text}
            </div>
          )}

          {/* Formulaire d'ajout au panier */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ajouter un article :</span>
              <div className="flex gap-1 ml-auto">
                <button
                  type="button"
                  onClick={() => setAddItemMode("PHARMACY")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${addItemMode === "PHARMACY" ? "bg-blue-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                >
                  + Médicament
                </button>
                <button
                  type="button"
                  onClick={() => setAddItemMode("SERVICE")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${addItemMode === "SERVICE" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                >
                  + Autres frais
                </button>
              </div>
            </div>

            <form onSubmit={handleAddToCart} className="space-y-3">
              {addItemMode === "PHARMACY" ? (
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
                    <Button
                      type="submit"
                      disabled={!addPharmacyItemId}
                      className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs"
                    >
                      + Ajouter au Panier
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6 space-y-1">
                    <Label htmlFor="addServiceDesc" className="text-xs">Motif / Description de l&apos;acte *</Label>
                    <Input
                      id="addServiceDesc"
                      required
                      placeholder="ex: Frais de consultation, Acte pansement..."
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
                    <Button
                      type="submit"
                      disabled={!addServiceDesc.trim() || !addServiceAmount}
                      className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs"
                    >
                      + Ajouter au Panier
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Tableau des articles dans le panier */}
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
                Le panier est vide. Sélectionnez un médicament ou un acte ci-dessus pour composer la facture.
              </div>
            ) : (
              cartItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 p-3 font-medium border-t border-slate-100 dark:border-slate-800 items-center">
                  <div className="col-span-5 font-semibold text-slate-900 dark:text-white">
                    <span className={`inline-block px-1.5 py-0.5 mr-1.5 text-[9px] font-bold rounded ${item.type === "PHARMACY" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                      {item.type === "PHARMACY" ? "Pharma" : "Acte"}
                    </span>
                    {item.description}
                  </div>
                  <div className="col-span-2 text-center">{item.quantity}</div>
                  <div className="col-span-2 text-right">{formatFCFA(item.unitPrice)}</div>
                  <div className="col-span-2 text-right font-bold text-slate-900 dark:text-white">{formatFCFA(item.amount)}</div>
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                      title="Supprimer du panier"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Patient & Grand Total */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex-1 max-w-md space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="cartPatientId" className="text-xs">Patient (Optionnel)</Label>
                {cartPatientId && (
                  <button
                    type="button"
                    onClick={handleLoadPatientPrescriptions}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    ⚡ Importer Ordonnance Patient
                  </button>
                )}
              </div>
              <select
                id="cartPatientId"
                value={cartPatientId}
                onChange={(e) => setCartPatientId(e.target.value)}
                className="w-full h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">-- Aucun (Client comptant) --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.user.lastName} {p.user.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-right">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">TOTAL NET À ENCAISSER</span>
              <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{formatFCFA(cartGrandTotal)}</span>
            </div>
          </div>

          <Button
            onClick={handleValidateCart}
            disabled={cartLoading || cartItems.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-bold shadow-xs text-sm"
          >
            {cartLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Validation et impression...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                Valider la facture & imprimer le reçu ({formatFCFA(cartGrandTotal)})
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
