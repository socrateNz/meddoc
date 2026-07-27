"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  PlusCircle, 
  MinusCircle, 
  ShoppingBag, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Loader2, 
  Printer, 
  Receipt,
  FileText,
  User as UserIcon,
  Package,
  ShoppingCart,
  Trash2
} from "lucide-react";
import { recordPharmacySale, recordSpecifiedIncome, recordExpense, recordMultiItemInvoice } from "@/actions/finance";
import PharmacyDialog from "./pharmacy-dialog";
import InvoiceModal from "./invoice-modal";

interface FinanceViewProps {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    cashBalance: number;
    todayIncome: number;
    todayExpenses: number;
    lowStockCount: number;
    transactions: any[];
    pharmacyItems: any[];
  };
  patients: any[];
  organizationId?: string;
  organizationName?: string;
}

export default function FinanceView({ summary, patients, organizationId, organizationName }: FinanceViewProps) {
  const [selectedInvoiceTransaction, setSelectedInvoiceTransaction] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("mouvements");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "INCOME" | "EXPENSE" | "PHARMACY">("ALL");

  // Form states
  const [pharmacySaleData, setPharmacySaleData] = useState({
    pharmacyItemId: "",
    quantity: 1,
    patientId: "",
  });
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleMsg, setSaleMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [incomeData, setIncomeData] = useState({
    description: "",
    amount: "",
    patientId: "",
  });
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeMsg, setIncomeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [expenseData, setExpenseData] = useState({
    description: "",
    amount: "",
  });
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseMsg, setExpenseMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Cart state for multi-item invoicing (Shopping Cart)
  const [cartItems, setCartItems] = useState<Array<{
    id: string;
    type: "PHARMACY" | "SERVICE";
    pharmacyItemId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>>([]);

  const [cartPatientId, setCartPatientId] = useState("");
  const [cartLoading, setCartLoading] = useState(false);
  const [cartMsg, setCartMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form input mode for adding item to cart: 'PHARMACY' or 'SERVICE'
  const [addItemMode, setAddItemMode] = useState<"PHARMACY" | "SERVICE">("PHARMACY");
  const [addPharmacyItemId, setAddPharmacyItemId] = useState("");
  const [addPharmacyQty, setAddPharmacyQty] = useState(1);
  const [addServiceDesc, setAddServiceDesc] = useState("");
  const [addServiceAmount, setAddServiceAmount] = useState("");

  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    setCartMsg(null);

    if (addItemMode === "PHARMACY") {
      if (!addPharmacyItemId) return;
      const item = summary.pharmacyItems.find((i) => i.id === addPharmacyItemId);
      if (!item) return;

      const qty = Number(addPharmacyQty);
      if (qty <= 0) return;
      if (item.stockQuantity < qty) {
        setCartMsg({ type: "error", text: `Stock insuffisant pour ${item.name}. Disponible: ${item.stockQuantity}` });
        return;
      }

      const total = item.unitPrice * qty;
      const newItem = {
        id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: "PHARMACY" as const,
        pharmacyItemId: item.id,
        description: `${item.name}${item.dosage ? ` (${item.dosage})` : ''}`,
        quantity: qty,
        unitPrice: item.unitPrice,
        amount: total,
      };

      setCartItems((prev) => [...prev, newItem]);
      setAddPharmacyItemId("");
      setAddPharmacyQty(1);
    } else {
      if (!addServiceDesc.trim() || !addServiceAmount) return;
      const amt = Number(addServiceAmount);
      if (amt <= 0) return;

      const newItem = {
        id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: "SERVICE" as const,
        description: addServiceDesc.trim(),
        quantity: 1,
        unitPrice: amt,
        amount: amt,
      };

      setCartItems((prev) => [...prev, newItem]);
      setAddServiceDesc("");
      setAddServiceAmount("");
    }
  };

  const handleRemoveFromCart = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
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
          createdAt: new Date().toISOString()
        };

        setSelectedInvoiceTransaction(transactionObj);
        setCartItems([]);
        setCartPatientId("");
        setCartMsg({ type: "success", text: "Facture validée et encaissée avec succès !" });
      } else {
        setCartMsg({ type: "error", text: res.error || "Erreur lors de la validation." });
      }
    } catch (err: any) {
      setCartMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setCartLoading(false);
    }
  };

  // Formatter for FCFA
  const formatFCFA = (val: number) => {
    const num = Math.round(Number(val) || 0);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
  };

  const formatDateTime = (dateInput: string | Date) => {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateInput));
  };

  // Calculate total for selected pharmacy item
  const selectedPharmacyItem = summary.pharmacyItems.find((i) => i.id === pharmacySaleData.pharmacyItemId);
  const saleTotalPrice = selectedPharmacyItem ? selectedPharmacyItem.unitPrice * Number(pharmacySaleData.quantity || 0) : 0;

  // Handlers
  const handlePharmacySale = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaleLoading(true);
    setSaleMsg(null);

    try {
      const selectedItem = summary.pharmacyItems.find((i) => i.id === pharmacySaleData.pharmacyItemId);
      const selectedPatient = patients.find((p) => p.id === pharmacySaleData.patientId);

      const res = await recordPharmacySale({
        pharmacyItemId: pharmacySaleData.pharmacyItemId,
        quantity: Number(pharmacySaleData.quantity),
        patientId: pharmacySaleData.patientId || undefined,
        organizationId,
      });

      if (res.success) {
        setSaleMsg({ type: "success", text: "Vente de médicament enregistrée avec succès !" });
        
        // Construct transaction object for printable receipt modal
        const transactionObj = (res as any).data || {
          id: `tmp-${Date.now()}`,
          type: "INCOME",
          category: "PHARMACY_SALE",
          amount: saleTotalPrice,
          description: `Vente pharmacie: ${pharmacySaleData.quantity}x ${selectedItem?.name || 'Médicament'}${selectedItem?.dosage ? ` (${selectedItem.dosage})` : ''}`,
          quantity: Number(pharmacySaleData.quantity),
          patient: selectedPatient || null,
          pharmacyItem: selectedItem || null,
          createdAt: new Date().toISOString()
        };
        setSelectedInvoiceTransaction(transactionObj);
        setPharmacySaleData({ pharmacyItemId: "", quantity: 1, patientId: "" });
      } else {
        setSaleMsg({ type: "error", text: res.error || "Erreur lors de la vente." });
      }
    } catch (err: any) {
      setSaleMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setSaleLoading(false);
    }
  };

  const handleSpecifiedIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    setIncomeLoading(true);
    setIncomeMsg(null);

    try {
      const selectedPatient = patients.find((p) => p.id === incomeData.patientId);

      const res = await recordSpecifiedIncome({
        description: incomeData.description,
        amount: Number(incomeData.amount),
        patientId: incomeData.patientId || undefined,
        organizationId,
      });

      if (res.success) {
        setIncomeMsg({ type: "success", text: "Encaissement enregistré dans la caisse !" });
        
        const transactionObj = (res as any).data || {
          id: `tmp-${Date.now()}`,
          type: "INCOME",
          category: "SERVICE_FEE",
          amount: Number(incomeData.amount),
          description: incomeData.description.trim(),
          patient: selectedPatient || null,
          createdAt: new Date().toISOString()
        };
        setSelectedInvoiceTransaction(transactionObj);
        setIncomeData({ description: "", amount: "", patientId: "" });
      } else {
        setIncomeMsg({ type: "error", text: res.error || "Erreur d'enregistrement." });
      }
    } catch (err: any) {
      setIncomeMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setIncomeLoading(false);
    }
  };

  const handleExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseLoading(true);
    setExpenseMsg(null);

    try {
      const res = await recordExpense({
        description: expenseData.description,
        amount: Number(expenseData.amount),
        organizationId,
      });

      if (res.success) {
        setExpenseMsg({ type: "success", text: "Retrait / Dépense de caisse enregistré(e) !" });

        const transactionObj = (res as any).data || {
          id: `tmp-${Date.now()}`,
          type: "EXPENSE",
          category: "OPERATIONAL_EXPENSE",
          amount: Number(expenseData.amount),
          description: expenseData.description.trim(),
          createdAt: new Date().toISOString()
        };
        setSelectedInvoiceTransaction(transactionObj);
        setExpenseData({ description: "", amount: "" });
      } else {
        setExpenseMsg({ type: "error", text: res.error || "Erreur d'enregistrement." });
      }
    } catch (err: any) {
      setExpenseMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setExpenseLoading(false);
    }
  };

  // Filter transactions
  const filteredTransactions = summary.transactions.filter((t) => {
    if (filterType === "INCOME" && t.type !== "INCOME") return false;
    if (filterType === "EXPENSE" && t.type !== "EXPENSE") return false;
    if (filterType === "PHARMACY" && t.category !== "PHARMACY_SALE") return false;

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const desc = (t.description || "").toLowerCase();
    const patientName = t.patient?.user ? `${t.patient.user.firstName} ${t.patient.user.lastName}`.toLowerCase() : "";
    const recorderName = t.recordedBy ? `${t.recordedBy.firstName} ${t.recordedBy.lastName}`.toLowerCase() : "";

    return desc.includes(q) || patientName.includes(q) || recorderName.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up">
        {/* Solde de Caisse */}
        <Card className="rounded-2xl border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/40 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 text-emerald-500/20 pointer-events-none">
            <Wallet className="h-20 w-20 -mr-4 -mt-4" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Wallet className="h-4 w-4" />
              Solde de Caisse Actuel
            </CardDescription>
            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-1">
              {formatFCFA(summary.cashBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-emerald-700/80 dark:text-emerald-400/80 font-medium">
            Entrées totales : {formatFCFA(summary.totalIncome)}
          </CardContent>
        </Card>

        {/* Recettes du jour */}
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Recettes du Jour
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              +{formatFCFA(summary.todayIncome)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500 font-medium">
            Encaissements enregistrés aujourd'hui
          </CardContent>
        </Card>

        {/* Dépenses du jour */}
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              Dépenses / Retraits du Jour
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              -{formatFCFA(summary.todayExpenses)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500 font-medium">
            Sorties de caisse aujourd'hui
          </CardContent>
        </Card>

        {/* Alertes Stock Pharmacie */}
        <Card className={`rounded-2xl border ${summary.lowStockCount > 0 ? "border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20" : "border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60"} backdrop-blur-md shadow-xs`}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <AlertTriangle className={`h-4 w-4 ${summary.lowStockCount > 0 ? "text-amber-500 animate-pulse" : "text-slate-400"}`} />
              Alertes Stock Pharmacie
            </CardDescription>
            <CardTitle className={`text-2xl font-bold mt-1 ${summary.lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
              {summary.lowStockCount} {summary.lowStockCount > 1 ? "produits" : "produit"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500 font-medium">
            {summary.lowStockCount > 0 ? "Stock faible ou rupture imminente !" : "Tous les stocks sont suffisants"}
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800/60 pb-3">
          <TabsList className="bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
            <TabsTrigger value="mouvements" className="rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
              <PlusCircle className="h-4 w-4 text-emerald-500" />
              Saisie Mouvement Caisse
            </TabsTrigger>
            <TabsTrigger value="journal" className="rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
              <Receipt className="h-4 w-4 text-blue-500" />
              Journal de Caisse ({summary.transactions.length})
            </TabsTrigger>
            <TabsTrigger value="pharmacie" className="rounded-lg text-xs font-semibold gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
              <Package className="h-4 w-4 text-indigo-500" />
              Stock Pharmacie ({summary.pharmacyItems.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === "pharmacie" && (
            <PharmacyDialog organizationId={organizationId} />
          )}
        </div>

        {/* TAB 1: Saisie des Mouvements & Panier de Facturation */}
        <TabsContent value="mouvements" className="pt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* PANIER DE FACTURATION MULTI-LIGNES (2 Colonnes sur grand écran) */}
            <Card className="lg:col-span-2 rounded-2xl border border-blue-500/30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs flex flex-col justify-between">
              <div>
                <CardHeader className="pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <ShoppingCart className="h-5 w-5" />
                      Panier de Facturation (Multi-Articles)
                    </CardTitle>
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs font-semibold">
                      {cartItems.length} {cartItems.length > 1 ? "éléments" : "élément"}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Ajoutez plusieurs médicaments et actes médicaux sur la même facture avant de valider l'encaissement.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6 pt-4">
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
                          + Acte / Frais Spécifié
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
                              {summary.pharmacyItems.map((item) => (
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
                            <Label htmlFor="addServiceDesc" className="text-xs">Motif / Description de l'acte *</Label>
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
                </CardContent>
              </div>

              {/* Pied du Panier : Patient & Grand Total */}
              <div className="p-6 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div className="flex-1 max-w-sm space-y-1">
                    <Label htmlFor="cartPatientId" className="text-xs">Patient (Optionnel)</Label>
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
                      Validation et Impression...
                    </>
                  ) : (
                    <>
                      <Printer className="h-4 w-4 mr-2" />
                      Valider la Facture & Imprimer le Reçu ({formatFCFA(cartGrandTotal)})
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {/* DÉPENSE / RETRAIT DE CAISSE (1 Colonne sur grand écran) */}
            <Card className="rounded-2xl border border-rose-500/20 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md shadow-xs flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <MinusCircle className="h-5 w-5" />
                    Dépense / Retrait de Caisse
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Sortie de trésorerie (achats de fournitures, retraits d'urgence, frais opérationnels).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {expenseMsg && (
                    <div className={`p-3 text-xs font-medium rounded-xl border ${expenseMsg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"}`}>
                      {expenseMsg.text}
                    </div>
                  )}

                  <form id="expense-form" onSubmit={handleExpense} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="expenseDescription">Motif du retrait / dépense *</Label>
                      <Input
                        id="expenseDescription"
                        required
                        placeholder="ex: Achat fournitures de bureau, Carburant..."
                        value={expenseData.description}
                        onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })}
                        className="rounded-xl"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="expenseAmount">Montant du retrait (FCFA) *</Label>
                      <Input
                        id="expenseAmount"
                        type="number"
                        min="1"
                        required
                        placeholder="ex: 2000"
                        value={expenseData.amount}
                        onChange={(e) => setExpenseData({ ...expenseData, amount: e.target.value })}
                        className="rounded-xl"
                      />
                    </div>
                  </form>
                </CardContent>
              </div>
              <div className="p-6 pt-0">
                <Button
                  form="expense-form"
                  type="submit"
                  disabled={expenseLoading}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs"
                >
                  {expenseLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MinusCircle className="h-4 w-4 mr-2" />}
                  Valider le Retrait (-{expenseData.amount ? formatFCFA(Number(expenseData.amount)) : "0 FCFA"})
                </Button>
              </div>
            </Card>

          </div>
        </TabsContent>

        {/* TAB 2: Journal de Caisse & Historique */}
        <TabsContent value="journal" className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Rechercher par motif, patient ou caissier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2.5 h-10 rounded-xl"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "ALL" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs" : "text-slate-500"}`}
              >
                Tous ({summary.transactions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("INCOME")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "INCOME" ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xs" : "text-slate-500"}`}
              >
                Encaissements (+)
              </button>
              <button
                type="button"
                onClick={() => setFilterType("EXPENSE")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "EXPENSE" ? "bg-white dark:bg-slate-900 text-rose-600 shadow-xs" : "text-slate-500"}`}
              >
                Dépenses (-)
              </button>
              <button
                type="button"
                onClick={() => setFilterType("PHARMACY")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${filterType === "PHARMACY" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-xs" : "text-slate-500"}`}
              >
                Ventes Pharmacie
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xs">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Date & Heure</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold max-w-[280px]">Motif / Description</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Patient / Rattaché</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Enregistré par</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Montant (FCFA)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500 font-medium">
                      Aucune transaction trouvée.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((t) => {
                    const isIncome = t.type === "INCOME";
                    const isPharmacy = t.category === "PHARMACY_SALE";

                    return (
                      <TableRow key={t.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50">
                        <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400 py-3.5">
                          {formatDateTime(t.createdAt)}
                        </TableCell>
                        <TableCell className="py-3.5">
                          {isIncome ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[11px] font-semibold">
                              {isPharmacy ? "Vente Pharmacie" : "Encaissement"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 text-[11px] font-semibold">
                              Dépense / Retrait
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5 max-w-[280px] truncate" title={t.description}>
                          {t.description}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                          {t.patient?.user ? `${t.patient.user.lastName} ${t.patient.user.firstName}` : "-"}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                          {t.recordedBy ? `${t.recordedBy.firstName} ${t.recordedBy.lastName}` : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-extrabold text-sm py-3.5 ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {isIncome ? "+" : "-"}{formatFCFA(t.amount)}
                        </TableCell>
                        <TableCell className="text-right py-3.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedInvoiceTransaction(t)}
                            className="h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50/50 rounded-lg gap-1.5 text-xs font-medium"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Facture
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 3: Stock Pharmacie & Alertes */}
        <TabsContent value="pharmacie" className="pt-6 space-y-4">
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xs">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Produit / Médicament</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Dosage / Forme</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Prix unitaire (FCFA)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Stock actuel</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">État du stock</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.pharmacyItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-500 font-medium">
                      Aucun produit en stock. Cliquez sur "Nouveau produit" pour ajouter des médicaments.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.pharmacyItems.map((item) => {
                    const isOutOfStock = item.stockQuantity <= 0;
                    const isLowStock = item.stockQuantity <= item.reorderLevel;

                    return (
                      <TableRow key={item.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50">
                        <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4" />
                            </div>
                            <span>{item.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                          {item.dosage || "-"}
                        </TableCell>
                        <TableCell className="font-bold text-slate-800 dark:text-slate-200 py-3.5">
                          {formatFCFA(item.unitPrice)}
                        </TableCell>
                        <TableCell className="font-extrabold py-3.5">
                          {item.stockQuantity} unités
                        </TableCell>
                        <TableCell className="py-3.5">
                          {isOutOfStock ? (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 gap-1 text-xs">
                              <XCircle className="h-3 w-3" />
                              Rupture de stock
                            </Badge>
                          ) : isLowStock ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 text-xs">
                              <AlertTriangle className="h-3 w-3" />
                              Stock faible (Seuil: {item.reorderLevel})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              En stock
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-3.5">
                          <PharmacyDialog item={item} organizationId={organizationId} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Invoice Modal for Printable Receipt & PDF */}
      <InvoiceModal
        transaction={selectedInvoiceTransaction}
        organizationName={organizationName}
        open={!!selectedInvoiceTransaction}
        onOpenChange={(open) => !open && setSelectedInvoiceTransaction(null)}
      />
    </div>
  );
}
