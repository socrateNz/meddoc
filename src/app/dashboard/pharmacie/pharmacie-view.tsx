"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Package,
  ClipboardList,
  Truck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  PackageCheck,
  Info,
  Search,
  History,
  ScanSearch,
} from "lucide-react";
import PharmacyDialog from "@/app/dashboard/finance/pharmacy-dialog";
import StockPurchaseDialog from "@/app/dashboard/finance/stock-purchase-dialog";
import InventoryPanel from "@/app/dashboard/finance/inventory-panel";
import SuppliersPanel from "@/app/dashboard/finance/suppliers-panel";
import { dispensePendingInvoice, findPendingInvoiceByReference } from "@/actions/finance";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

function formatDateTime(dateInput: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateInput));
}

interface PharmacieViewProps {
  pharmacyItems: any[];
  dispenseQueue: any[];
  dispenseHistory: any[];
  organizationId?: string;
  currentUserRole?: string;
}

export default function PharmacieView({ pharmacyItems, dispenseQueue, dispenseHistory, organizationId, currentUserRole }: PharmacieViewProps) {
  const [activeTab, setActiveTab] = useState("queue");
  const [queue, setQueue] = useState<any[]>(dispenseQueue);
  const [history, setHistory] = useState<any[]>(dispenseHistory);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "MEDICATION" | "CONSUMABLE" | "EQUIPMENT">("ALL");
  const [dispensingId, setDispensingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [reference, setReference] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [historySearch, setHistorySearch] = useState("");

  // ADMIN (holding) consulte le stock en lecture seule ; COORDINATOR/PHARMACIST gèrent le catalogue.
  const canWrite = currentUserRole === "COORDINATOR" || currentUserRole === "PHARMACIST";
  // Remise physique des médicaments : réservée au PHARMACIST, plus strict que canWrite — même
  // séparation que côté serveur (dispensePendingInvoice).
  const canDispense = currentUserRole === "PHARMACIST";

  const now = new Date();

  const filteredPharmacyItems = categoryFilter === "ALL"
    ? pharmacyItems
    : pharmacyItems.filter((item: any) => item.category === categoryFilter);

  const handleDispense = async (invoiceId: string) => {
    setDispensingId(invoiceId);
    setMsg(null);
    try {
      const res = await dispensePendingInvoice(invoiceId);
      if (res.success) {
        setQueue((prev) => prev.filter((inv) => inv.id !== invoiceId));
        if (searchResult?.id === invoiceId) {
          setHistory((prev) => [{ ...searchResult, dispensedAt: new Date().toISOString() }, ...prev]);
        }
        setSearchResult(null);
        setReference("");
        setMsg({ type: "success", text: "Médicaments remis au patient avec succès." });
      } else {
        setMsg({ type: "error", text: res.error || "Erreur lors de la remise des médicaments." });
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setDispensingId(null);
    }
  };

  // La remise ne se déclenche qu'après recherche par référence : le pharmacien doit avoir en
  // main le numéro que le patient a récupéré à la caisse, il ne parcourt pas une liste libre.
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await findPendingInvoiceByReference(organizationId, reference.trim());
      if (res.success) {
        setSearchResult(res.data);
      } else {
        setSearchError(res.error || "Ticket introuvable.");
      }
    } catch (err: any) {
      setSearchError(err.message || "Erreur de connexion.");
    } finally {
      setSearching(false);
    }
  };

  const filteredHistory = historySearch.trim()
    ? history.filter((inv: any) => {
        const q = historySearch.trim().toLowerCase();
        const ref = String(inv.id).slice(-6).toLowerCase();
        const name = inv.patient?.user ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}`.toLowerCase() : "";
        return ref.includes(q) || name.includes(q);
      })
    : history;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800/60 pb-3">
          <TabsList className="bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
            <TabsTrigger value="queue" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <PackageCheck className="h-4 w-4 text-emerald-500" />
              File d&apos;attente ({queue.length})
            </TabsTrigger>
            <TabsTrigger value="historique" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <History className="h-4 w-4 text-blue-500" />
              Historique
            </TabsTrigger>
            <TabsTrigger value="stock" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <Package className="h-4 w-4 text-indigo-500" />
              Stock ({pharmacyItems.length})
            </TabsTrigger>
            <TabsTrigger value="inventaire" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <ClipboardList className="h-4 w-4 text-rose-500" />
              Inventaire
            </TabsTrigger>
            <TabsTrigger value="fournisseurs" className="rounded-lg text-xs font-semibold gap-1.5 text-slate-600 dark:text-slate-300 data-active:bg-white dark:data-active:bg-slate-900 data-active:text-slate-900 dark:data-active:text-white">
              <Truck className="h-4 w-4 text-emerald-500" />
              Fournisseurs
            </TabsTrigger>
          </TabsList>

          {activeTab === "stock" && canWrite && (
            <div className="flex gap-2">
              <StockPurchaseDialog pharmacyItems={pharmacyItems} organizationId={organizationId} />
              <PharmacyDialog organizationId={organizationId} />
            </div>
          )}
        </div>

        {/* TAB: File d'attente — coeur opérationnel de cet écran */}
        <TabsContent value="queue" className="pt-6 space-y-4">
          {!canDispense && (
            <div className="p-3 text-xs font-medium rounded-xl border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/30 flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0" />
              Seul un pharmacien peut remettre les médicaments. Vous consultez la file en lecture seule.
            </div>
          )}

          {msg && (
            <div className={`p-3 text-xs font-medium rounded-xl border ${msg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"}`}>
              {msg.text}
            </div>
          )}

          {canDispense && (
            <Card className="rounded-2xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/10 shadow-xs">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                  <ScanSearch className="h-3.5 w-3.5" />
                  Finaliser un ticket
                </p>
                <p className="text-xs text-slate-500">
                  Demandez au patient le numéro de référence remis à la caisse, puis saisissez-le ci-dessous pour retrouver et remettre son ticket.
                </p>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ex: A1B2C3"
                    className="h-9 text-sm font-mono uppercase rounded-xl"
                  />
                  <Button type="submit" disabled={searching || !reference.trim()} className="gap-1.5 shrink-0 rounded-xl">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Rechercher
                  </Button>
                </form>

                {searchError && (
                  <div className="p-2.5 text-xs font-medium rounded-lg border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30">
                    {searchError}
                  </div>
                )}

                {searchResult && (() => {
                  const items = Array.isArray(searchResult.items) ? searchResult.items : [];
                  const total = items.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
                  const pharmacyLines = items.filter((it: any) => it.type === "PHARMACY");
                  const name = searchResult.patient?.user ? `${searchResult.patient.user.lastName} ${searchResult.patient.user.firstName}` : "Client comptant";
                  const ticketNum = String(searchResult.id).slice(-6).toUpperCase();
                  const isDispensing = dispensingId === searchResult.id;
                  return (
                    <Card className="rounded-xl border border-emerald-300/60 dark:border-emerald-800/50 bg-white dark:bg-slate-900">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-slate-800 dark:text-slate-200">{name}</p>
                              <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                #{ticketNum}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Réglé le {searchResult.paidAt ? formatDateTime(searchResult.paidAt) : "-"} • {formatFCFA(total)}
                            </p>
                          </div>
                          <Button
                            onClick={() => handleDispense(searchResult.id)}
                            disabled={isDispensing}
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs shrink-0"
                          >
                            {isDispensing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                            Remettre les médicaments
                          </Button>
                        </div>
                        <div className="rounded-xl border border-slate-100 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                          {pharmacyLines.map((it: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-xs bg-slate-50/60 dark:bg-slate-800/30">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{it.description}</span>
                              <span className="font-bold text-slate-500">x{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-2">
            Tickets réglés en attente ({queue.length}) — aperçu seul, recherchez la référence ci-dessus pour finaliser
          </p>

          {queue.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                Aucun ticket en attente de remise.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {queue.map((inv: any) => {
                const items = Array.isArray(inv.items) ? inv.items : [];
                const total = items.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
                const pharmacyLines = items.filter((it: any) => it.type === "PHARMACY");
                const name = inv.patient?.user ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}` : "Client comptant";
                const ticketNum = String(inv.id).slice(-6).toUpperCase();

                return (
                  <Card key={inv.id} className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-800 dark:text-slate-200">{name}</p>
                            <Badge variant="outline" className="text-[10px] font-mono bg-slate-500/10 text-slate-500 border-slate-500/20">
                              #{ticketNum}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Réglé le {inv.paidAt ? formatDateTime(inv.paidAt) : "-"} • {formatFCFA(total)}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-100 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                        {pharmacyLines.length === 0 ? (
                          <p className="p-3 text-xs text-slate-400">Aucun médicament listé.</p>
                        ) : (
                          pharmacyLines.map((it: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-xs bg-slate-50/60 dark:bg-slate-800/30">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{it.description}</span>
                              <span className="font-bold text-slate-500">x{it.quantity}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB: Historique des tickets finalisés (remis) */}
        <TabsContent value="historique" className="pt-6 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Rechercher par référence ou nom du patient..."
              className="h-9 pl-9 text-sm rounded-xl"
            />
          </div>

          {filteredHistory.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                {history.length === 0 ? "Aucun ticket finalisé pour le moment." : "Aucun résultat pour cette recherche."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((inv: any) => {
                const items = Array.isArray(inv.items) ? inv.items : [];
                const total = items.reduce((sum: number, it: any) => sum + Number(it.amount || 0), 0);
                const pharmacyLines = items.filter((it: any) => it.type === "PHARMACY");
                const name = inv.patient?.user ? `${inv.patient.user.lastName} ${inv.patient.user.firstName}` : "Client comptant";
                const ticketNum = String(inv.id).slice(-6).toUpperCase();

                return (
                  <Card key={inv.id} className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
                    <CardContent className="p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{name}</p>
                          <Badge variant="outline" className="text-[10px] font-mono bg-slate-500/10 text-slate-500 border-slate-500/20">
                            #{ticketNum}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Remis
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {pharmacyLines.map((it: any) => it.description).join(", ") || "Aucun médicament listé"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatFCFA(total)}</p>
                        <p className="text-[10px] text-slate-400">{inv.dispensedAt ? formatDateTime(inv.dispensedAt) : "-"}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB: Stock (catalogue pharmacie) */}
        <TabsContent value="stock" className="pt-6 space-y-4">
          <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/50 w-fit">
            {[
              { value: "ALL", label: `Tous (${pharmacyItems.length})` },
              { value: "MEDICATION", label: `Médicaments (${pharmacyItems.filter((i: any) => i.category === "MEDICATION").length})` },
              { value: "CONSUMABLE", label: `Consommables (${pharmacyItems.filter((i: any) => i.category === "CONSUMABLE").length})` },
              { value: "EQUIPMENT", label: `Matériel (${pharmacyItems.filter((i: any) => i.category === "EQUIPMENT").length})` },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setCategoryFilter(f.value as any)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${categoryFilter === f.value
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-xs">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Produit / Médicament</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Dosage & Emplacement</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">N° Lot & Péremption</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Prix unitaire (FCFA)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">Stock actuel</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold">État & Traçabilité</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPharmacyItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500 font-medium">
                      {pharmacyItems.length === 0
                        ? "Aucun produit en stock. Cliquez sur \"Nouveau produit\" pour ajouter des médicaments."
                        : "Aucun produit dans cette catégorie."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPharmacyItems.map((item: any) => {
                    const isOutOfStock = item.stockQuantity <= 0;
                    const isLowStock = item.stockQuantity <= item.reorderLevel;

                    const expDate = item.expiryDate ? new Date(item.expiryDate) : null;
                    const isExpired = expDate ? expDate < now : false;
                    const daysUntilExp = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : null;
                    const isExpiringSoon = daysUntilExp !== null && daysUntilExp >= 0 && daysUntilExp <= 30;

                    return (
                      <TableRow key={item.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50">
                        <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4" />
                            </div>
                            <div>
                              <span>{item.name}</span>
                              {item.supplier && (
                                <p className="text-[10px] text-slate-400 font-normal">Fournisseur: {item.supplier}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                          <div>{item.dosage || "-"}</div>
                          {item.location && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">{item.location}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-xs font-medium py-3.5">
                          {item.batchNumber ? (
                            <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 block">{item.batchNumber}</span>
                          ) : (
                            <span className="text-slate-400 block">-</span>
                          )}
                          {expDate ? (
                            <span className={`text-[10px] ${isExpired ? "text-rose-600 font-bold" : isExpiringSoon ? "text-amber-600 font-bold" : "text-slate-500"}`}>
                              Exp: {new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(expDate)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Pas de date</span>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-slate-800 dark:text-slate-200 py-3.5">
                          {formatFCFA(item.unitPrice)}
                        </TableCell>
                        <TableCell className="font-extrabold py-3.5">
                          {item.stockQuantity} unités
                        </TableCell>
                        <TableCell className="py-3.5 space-y-1">
                          {isOutOfStock ? (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 gap-1 text-[11px]">
                              <XCircle className="h-3 w-3" />
                              Rupture de stock
                            </Badge>
                          ) : isLowStock ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 text-[11px]">
                              <AlertTriangle className="h-3 w-3" />
                              Stock faible ({item.reorderLevel})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" />
                              En stock
                            </Badge>
                          )}

                          {isExpired ? (
                            <Badge variant="outline" className="bg-rose-600 text-white border-rose-600 gap-1 text-[10px] font-bold block w-fit">
                              ⚠️ Périmé !
                            </Badge>
                          ) : isExpiringSoon ? (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 text-[10px] font-bold block w-fit">
                              ⏳ Péremption ({daysUntilExp}j)
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right py-3.5">
                          {canWrite && <PharmacyDialog item={item} organizationId={organizationId} />}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB: Inventaire (comptage physique vs stock système) */}
        <TabsContent value="inventaire" className="pt-6 space-y-4">
          <InventoryPanel organizationId={organizationId} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="fournisseurs" className="pt-6">
          <SuppliersPanel organizationId={organizationId} pharmacyItems={pharmacyItems} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
