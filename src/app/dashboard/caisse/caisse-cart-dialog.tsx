"use client";

import { useState } from "react";
import PaymentMethodSelect from "./payment-method-select";
import { DispenseNowCheckbox, dispenseAfterPayment } from "./dispense-now";
import type { PaymentMethod } from "@/lib/accounting/plan";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { ShoppingCart, Receipt, Trash2, Loader2, Printer, PlusCircle, BadgePercent } from "lucide-react";
import { useCan } from "@/components/permissions-provider";
import { DiscountNote, LineDiscountEditor } from "./line-discount-editor";
import { spreadDiscount } from "@/lib/invoice-discount";
import { createCaisseSale, payPendingInvoice } from "@/actions/finance";
import { submitOrQueueOffline } from "@/lib/offline-submit";
import { useSubmitGuard } from "@/hooks/use-submit-guard";
import { toast } from "sonner";
import { FormMessage } from "@/components/ui/form-message";
import { toErrorMessage } from "@/lib/utils";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface CartItem {
  id: string;
  type: "PHARMACY" | "SERVICE" | "LAB";
  pharmacyItemId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  // Réduction de la ligne (FCFA) et son motif — cf. src/lib/invoice-discount.ts.
  discount?: number;
  discountReason?: string;
}

function cartFromPending(pendingInvoice: { id: string; items: any[] }): CartItem[] {
  return (pendingInvoice.items || []).map((it: any, i: number) => ({
    id: `pending-${pendingInvoice.id}-${i}`,
    type: it.type,
    pharmacyItemId: it.pharmacyItemId,
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    amount: it.amount,
    discount: it.discount,
    discountReason: it.discountReason,
  }));
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
  // Pharmacien qui encaisse : peut remettre les médicaments directement (cf. dispense-now.tsx).
  canDispense?: boolean;
}

export default function CaisseCartDialog({ mode, cashSessionId, pharmacyItems, patients = [], organizationId, pendingInvoice, onSuccess, canDispense = false }: CaisseCartDialogProps) {
  const [open, setOpen] = useState(false);
  const [dispenseNow, setDispenseNow] = useState(true);
  const [cartItems, setCartItems] = useState<CartItem[]>(() => (mode === "pay" && pendingInvoice ? cartFromPending(pendingInvoice) : []));
  // Réduction par ligne : réservée au responsable (« invoices.discount »).
  const canDiscount = useCan("invoices.discount");
  const [discountingId, setDiscountingId] = useState<string | null>(null);
  const [cartPatientId, setCartPatientId] = useState("");
  const [customPatientNameInput, setCustomPatientNameInput] = useState("");
  const [customPatientPhoneInput, setCustomPatientPhoneInput] = useState("");
  const { submitting: loading, guard } = useSubmitGuard();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Montant réellement remis par le client maintenant — reste synchronisé sur le total du panier
  // tant que le caissier n'y touche pas (comportement actuel inchangé, un clic = paiement
  // intégral) ; baissé, il ouvre une vente à crédit / un paiement partiel.
  const [amountReceivedInput, setAmountReceivedInput] = useState("0");
  const [amountTouched, setAmountTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

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
    setPaymentMethod("CASH");
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
      // Doublon volontaire du contrôle serveur (createCaisseSale/payPendingInvoice) : la
      // sélection est déjà grisée plus bas, ceci n'est que le filet si elle a été posée avant le
      // blocage (dialogue resté ouvert pendant que le coordinateur bloquait le produit).
      if (item.saleBlockedAt) {
        setMsg({
          type: "error",
          text: `Vente bloquée par le coordinateur pour ${item.name}${item.saleBlockedReason ? ` — motif : ${item.saleBlockedReason}` : ""}.`,
        });
        return;
      }
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

  const grossOf = (item: CartItem) => Math.round(item.quantity * item.unitPrice);
  const applyDiscount = (id: string, discount: number, reason: string) => {
    setCartItems((prev) =>
      prev.map((it) =>
        it.id !== id
          ? it
          : discount > 0
            ? { ...it, discount, discountReason: reason, amount: grossOf(it) - discount }
            : { ...it, discount: undefined, discountReason: undefined, amount: it.discount ? grossOf(it) : it.amount }
      )
    );
    setDiscountingId(null);
  };

  // Tout le panier : réduction répartie sur les lignes au prorata de leur prix (cf. spreadDiscount).
  const applyDiscountToAll = (discount: number, reason: string) => {
    const parts = spreadDiscount(cartItems.map(grossOf), discount);
    setCartItems((prev) =>
      prev.map((it, i) =>
        parts[i] > 0
          ? { ...it, discount: parts[i], discountReason: reason, amount: grossOf(it) - parts[i] }
          : { ...it, discount: undefined, discountReason: undefined, amount: it.discount ? grossOf(it) : it.amount }
      )
    );
    setDiscountingId(null);
  };
  const cartDiscount = cartItems.reduce((sum, it) => sum + (Number(it.discount) || 0), 0);

  const grandTotal = cartItems.reduce((sum, i) => sum + i.amount, 0);
  // Ligne à 0 « à définir » (ex : frais de consultation non renseignés) — pas une ligne offerte
  // par une réduction de 100 %.
  const hasZeroAmountItem = cartItems.some((i) => i.amount <= 0 && !(Number(i.discount) > 0));

  // Calculé directement pendant le rendu plutôt que synchronisé par un effet (schéma recommandé
  // par React pour une valeur purement dérivée — cf. chat-panel.tsx pour le même principe) :
  // reste collé au total tant que le caissier n'a pas lui-même modifié le champ, y compris après
  // resetForm() (amountTouched repasse à false, grandTotal à 0, donc "0" sans aucune action
  // supplémentaire).
  const amountReceivedDisplay = amountTouched ? amountReceivedInput : String(grandTotal);
  const amountReceived = Math.min(grandTotal, Math.max(0, Number(amountReceivedDisplay) || 0));
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

    setMsg(null);
    try {
      const items = cartItems.map(({ type, pharmacyItemId, description, quantity, unitPrice, amount, discount, discountReason }) => ({
        type, pharmacyItemId, description, quantity, unitPrice, amount,
        ...(discount && discount > 0 ? { discount, discountReason } : {}),
      }));

      const isPay = mode === "pay" && !!pendingInvoice;
      const payPayload = isPay ? { pendingInvoiceId: pendingInvoice!.id, cashSessionId, amount: amountReceived, items, paymentMethod } : null;
      const salePayload = !isPay
        ? {
            cashSessionId,
            items,
            patientId: cartPatientId || undefined,
            customPatientName: customPatientNameInput.trim() || undefined,
            customPatientPhone: customPatientPhoneInput.trim() || undefined,
            organizationId,
            amountReceived,
            paymentMethod,
          }
        : null;

      // La clé d'idempotence est posée dans la charge utile ET passée à l'action : un rejeu de la
      // file hors-ligne réutilise la même clé, donc une vente déjà reçue par le serveur n'est pas
      // créée une seconde fois.
      const result = await guard((idempotencyKey) =>
        isPay
          ? submitOrQueueOffline({
              action: () => payPendingInvoice(payPayload!.pendingInvoiceId, payPayload!.cashSessionId, payPayload!.amount, payPayload!.items, idempotencyKey, payPayload!.paymentMethod),
              queueType: "CAISSE_PAY",
              payload: { ...payPayload!, idempotencyKey },
              label: `Paiement — ${patientName}`,
            })
          : submitOrQueueOffline({
              action: () => createCaisseSale({ ...salePayload!, idempotencyKey }),
              queueType: "CAISSE_SALE",
              payload: { ...salePayload!, idempotencyKey },
              label: `Vente — ${salePayload!.customPatientName || "client comptant"}`,
            })
      );
      if (!result) return;

      if (!result.success) {
        setMsg({ type: "error", text: result.error || "Erreur lors de la validation." });
        return;
      }

      if (result.queued) {
        // Pas de ticket imprimable immédiatement : pour une VENTE, la facture n'existe pas encore
        // côté serveur tant qu'elle n'est pas synchronisée (le code de retrait que le patient
        // devra donner au pharmacien, cf. dispensePendingInvoice, en dépend directement) — pour un
        // PAIEMENT, la facture existe déjà, seul le règlement est en attente. On ne passe donc
        // PAS cette réponse à onSuccess (qui attend une vraie transaction à afficher/imprimer,
        // cf. caisse-view.tsx:handleMutationSuccess) — juste un avertissement persistant, le
        // temps que le caissier le lise vraiment avant de fermer le dialogue.
        toast.warning(
          isPay
            ? "Hors-ligne : paiement enregistré localement, sera synchronisé au retour du réseau."
            : "Hors-ligne : vente enregistrée localement. Le ticket imprimable ne sera disponible qu'après synchronisation (Journal de caisse) — prévenez le patient.",
          { duration: 10000 }
        );
        setOpen(false);
        resetForm();
        return;
      }

      setOpen(false);
      // La référence imprimée sur le ticket doit être celle que le pharmacien devra saisir pour
      // finaliser (PendingInvoice.id, cf. dispensePendingInvoice), pas l'id interne de la
      // transaction ; invoiceTotalAmount/remainingDue alimentent l'affichage "Total facture /
      // Réglé sur ce ticket / Reste à payer" quand le paiement n'est pas intégral (cf.
      // invoice-modal.tsx / invoice-pdf.tsx).
      const txn = {
        ...result.data?.transaction,
        pendingInvoiceId: result.data?.pendingInvoice?.id,
        invoiceTotalAmount: result.data?.invoiceTotalAmount,
        remainingDue: result.data?.remainingDue,
      };
      onSuccess(txn);
      resetForm();
      if (canDispense && dispenseNow && items.some((i) => i.type === "PHARMACY")) {
        await dispenseAfterPayment(isPay ? pendingInvoice!.id : result.data?.pendingInvoice?.id);
      }
    } catch (err: any) {
      setMsg({ type: "error", text: toErrorMessage(err, "Erreur de connexion.") });
    }
  };

  const patientName = pendingInvoice?.patient?.user
    ? `${pendingInvoice.patient.user.lastName} ${pendingInvoice.patient.user.firstName}`
    : ((pendingInvoice as any)?.customPatientName || "Client comptant");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
        // Ticket à encaisser : rechargé à chaque ouverture (une réduction a pu y être posée depuis).
        if (v && mode === "pay" && pendingInvoice) setCartItems(cartFromPending(pendingInvoice));
        setDiscountingId(null);
      }}
    >
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
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-[760px] sm:p-6">
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

        <div className="space-y-4 pt-1 sm:space-y-6 sm:pt-2">
          {msg && (
            <FormMessage type={msg.type} text={msg.text} />
          )}

          <div className="p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
              <span className="hidden text-xs font-bold text-slate-500 uppercase tracking-wider sm:inline">Ajouter un article :</span>
              <div className="grid w-full grid-cols-2 gap-1 sm:ml-auto sm:flex sm:w-auto">
                <button type="button" onClick={() => setAddItemMode("PHARMACY")} className={`px-3 py-2 sm:py-1 text-sm sm:text-sm font-semibold rounded-lg transition-all ${addItemMode === "PHARMACY" ? "bg-blue-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                  + Médicament
                </button>
                <button type="button" onClick={() => setAddItemMode("SERVICE")} className={`px-3 py-2 sm:py-1 text-sm sm:text-sm font-semibold rounded-lg transition-all ${addItemMode === "SERVICE" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                  + Autres frais
                </button>
              </div>
            </div>

            <form onSubmit={handleAddToCart} className="space-y-3">
              {addItemMode === "PHARMACY" ? (
                <div className="grid grid-cols-3 sm:grid-cols-12 gap-3 items-end">
                  <div className="col-span-3 sm:col-span-7 space-y-1">
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
                        description: item.saleBlockedAt
                          ? `Vente bloquée${item.saleBlockedReason ? ` — ${item.saleBlockedReason}` : ""}`
                          : `Stock: ${item.stockQuantity} · ${formatFCFA(item.unitPrice)}`,
                        disabled: item.stockQuantity <= 0 || !!item.saleBlockedAt,
                      }))}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2 space-y-1">
                    <Label htmlFor="addPharmacyQty" className="text-xs">Qté *</Label>
                    <Input
                      id="addPharmacyQty"
                      type="number"
                      min="1"
                      required
                      value={addPharmacyQty}
                      onChange={(e) => setAddPharmacyQty(e.target.value)}
                      className="h-11 text-base sm:h-9 sm:text-sm rounded-xl"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <Button type="submit" disabled={!addPharmacyItemId} className="w-full h-11 sm:h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs">+ Ajouter au Panier</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-3 items-end">
                  <div className="col-span-2 sm:col-span-6 space-y-1">
                    <Label htmlFor="addServiceDesc" className="text-xs">Motif / Description de l&apos;acte *</Label>
                    <Input id="addServiceDesc" required placeholder="ex: Frais de consultation" value={addServiceDesc} onChange={(e) => setAddServiceDesc(e.target.value)} className="h-11 text-base sm:h-9 sm:text-sm rounded-xl" />
                  </div>
                  <div className="col-span-1 sm:col-span-3 space-y-1">
                    <Label htmlFor="addServiceAmount" className="text-xs">Montant (FCFA) *</Label>
                    <Input id="addServiceAmount" type="number" min="1" required placeholder="5000" value={addServiceAmount} onChange={(e) => setAddServiceAmount(e.target.value)} className="h-11 text-base sm:h-9 sm:text-sm rounded-xl" />
                  </div>
                  <div className="col-span-1 sm:col-span-3">
                    <Button type="submit" disabled={!addServiceDesc.trim() || !addServiceAmount} className="w-full h-11 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs">+ Ajouter au Panier</Button>
                  </div>
                </div>
              )}
            </form>
          </div>

          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden text-xs">
            <div className="hidden sm:grid grid-cols-12 bg-slate-100 dark:bg-slate-800/80 p-2.5 font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-xs">
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
                <div key={item.id} className={`grid grid-cols-[1fr_auto] sm:grid-cols-12 gap-x-2 gap-y-1 p-3 font-medium border-t first:border-t-0 sm:first:border-t border-slate-100 dark:border-slate-800 items-center ${item.amount <= 0 ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                  {/* Mobile : designation + corbeille, puis qte x P.U et total */}
                  <div className="min-w-0 break-words text-sm sm:text-sm sm:col-span-5 font-semibold text-slate-900 dark:text-white">
                    <span className={`inline-block px-1.5 py-0.5 mr-1.5 text-xs font-bold rounded ${item.type === "PHARMACY" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                      {item.type === "PHARMACY" ? "Pharma" : item.type === "LAB" ? "Labo" : "Acte"}
                    </span>
                    {item.description}
                    <DiscountNote discount={item.discount} reason={item.discountReason} />
                    {canDiscount && item.amount > 0 && discountingId !== item.id && (
                      <button type="button" onClick={() => setDiscountingId(item.id)} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
                        <BadgePercent className="h-3 w-3" />
                        {item.discount ? "Modifier la réduction" : "Réduction"}
                      </button>
                    )}
                    {canDiscount && !!item.discount && discountingId !== item.id && (
                      <button type="button" onClick={() => applyDiscount(item.id, 0, "")} className="text-xs text-muted-foreground hover:underline">
                        Retirer la réduction
                      </button>
                    )}
                  </div>
                  <div className="col-start-1 row-start-2 text-slate-500 sm:hidden">
                    {item.quantity} × {formatFCFA(item.unitPrice)}
                  </div>
                  <div className="hidden sm:block sm:col-span-2 text-center">{item.quantity}</div>
                  <div className="hidden sm:block sm:col-span-2 text-right">{formatFCFA(item.unitPrice)}</div>
                  <div className={`col-start-2 row-start-2 sm:row-start-auto sm:col-start-auto sm:col-span-2 text-sm sm:text-sm text-right font-bold ${item.amount <= 0 ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>
                    {item.amount <= 0 && !item.discount ? "À définir" : formatFCFA(item.amount)}
                  </div>
                  <div className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto sm:col-span-1 text-right sm:text-center">
                    <button type="button" onClick={() => handleRemove(item.id)} className="p-2 sm:p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all" title="Supprimer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {discountingId === item.id && (
                    <div className="col-span-2 sm:col-span-12">
                      <LineDiscountEditor
                        gross={grossOf(item)}
                        initialDiscount={item.discount}
                        initialReason={item.discountReason}
                        onCancel={() => setDiscountingId(null)}
                        onApply={(discount, reason) => applyDiscount(item.id, discount, reason)}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Deux colonnes égales : client à gauche, encaissement à droite ; la remise en dessous. */}
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {mode === "sale" && (
              <div className="min-w-0 space-y-2">
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="customPatientNameInput" className="text-xs">Nom du client (Manuel)</Label>
                      <Input
                        id="customPatientNameInput"
                        value={customPatientNameInput}
                        onChange={(e) => setCustomPatientNameInput(e.target.value)}
                        placeholder="ex: M. Yao Alain"
                        className="h-11 text-base sm:h-9 sm:text-sm rounded-xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="customPatientPhoneInput" className="text-xs">Téléphone (Optionnel)</Label>
                      <Input
                        id="customPatientPhoneInput"
                        value={customPatientPhoneInput}
                        onChange={(e) => setCustomPatientPhoneInput(e.target.value)}
                        placeholder="ex: 07 00 00 00 00"
                        className="h-11 text-base sm:h-9 sm:text-sm rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="min-w-0 space-y-2 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:col-start-2">
              {canDiscount && cartItems.length > 0 && discountingId !== "all" && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-violet-700 dark:text-violet-300">{cartDiscount > 0 ? `Réductions : −${formatFCFA(cartDiscount)}` : ""}</span>
                  <span className="flex gap-3">
                    <button type="button" onClick={() => setDiscountingId("all")} className="flex items-center gap-1 font-semibold text-violet-700 hover:underline dark:text-violet-300">
                      <BadgePercent className="h-3 w-3" />
                      Réduire tout le panier
                    </button>
                    {cartDiscount > 0 && (
                      <button type="button" onClick={() => applyDiscountToAll(0, "")} className="text-muted-foreground hover:underline">
                        Tout retirer
                      </button>
                    )}
                  </span>
                </div>
              )}
              {discountingId === "all" && (
                <LineDiscountEditor
                  gross={cartItems.reduce((sum, it) => sum + grossOf(it), 0)}
                  initialDiscount={cartDiscount}
                  initialReason={cartItems.find((it) => it.discountReason)?.discountReason}
                  onCancel={() => setDiscountingId(null)}
                  onApply={(discount, reason) => applyDiscountToAll(discount, reason)}
                />
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total du panier</span>
                <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-200">{formatFCFA(grandTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="amountReceived" className="text-xs whitespace-nowrap">Montant reçu maintenant</Label>
                <Input
                  id="amountReceived"
                  type="number"
                  min="0"
                  max={grandTotal}
                  value={amountReceivedDisplay}
                  onChange={(e) => { setAmountTouched(true); setAmountReceivedInput(e.target.value); }}
                  className="h-11 w-36 text-base font-bold text-right rounded-xl sm:h-9 sm:text-sm"
                />
              </div>
              {amountReceived > 0 && <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />}
              {remainingAfterPayment > 0 && (
                <p className="text-right text-xs font-semibold text-amber-600 dark:text-amber-500">
                  Vente à crédit — reste à payer : {formatFCFA(remainingAfterPayment)}
                </p>
              )}
            </div>
          </div>

          {/* Mobile : remise + bouton Encaisser toujours visibles en bas de la fenêtre */}
          <div className="sticky -bottom-4 -mx-4 space-y-2 border-t border-slate-200/70 bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:space-y-4 sm:border-0 sm:bg-transparent sm:p-0 dark:border-slate-800">
          {canDispense && cartItems.some((i) => i.type === "PHARMACY") && <DispenseNowCheckbox checked={dispenseNow} onChange={setDispenseNow} id={`dispenseNow-${mode}`} />}
          <Button onClick={handleValidate} disabled={loading || cartItems.length === 0} className="w-full h-12 sm:h-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-bold shadow-xs text-sm">
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Encaissement...</>
            ) : (
              <><Printer className="h-4 w-4 mr-2" />Encaisser & imprimer le ticket ({formatFCFA(amountReceived)})</>
            )}
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
