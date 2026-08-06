"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, ClipboardList, Loader2, Send, XCircle, Phone, Mail } from "lucide-react";
import { listSuppliers } from "@/actions/suppliers";
import { listPurchaseOrders, updatePurchaseOrderStatus } from "@/actions/purchase-orders";
import NewSupplierDialog from "./new-supplier-dialog";
import NewPurchaseOrderDialog from "./new-purchase-order-dialog";
import ReceivePurchaseOrderDialog from "./receive-purchase-order-dialog";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Brouillon", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  SENT: { label: "Envoyée", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  PARTIALLY_RECEIVED: { label: "Reçue partiellement", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  RECEIVED: { label: "Reçue", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  CANCELLED: { label: "Annulée", className: "bg-red-500/10 text-red-600 border-red-500/20" },
};

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

export default function SuppliersPanel({ organizationId, pharmacyItems, canWrite }: { organizationId?: string; pharmacyItems: any[]; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers", organizationId],
    queryFn: async () => {
      const res = await listSuppliers(organizationId);
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["purchaseOrders", organizationId],
    queryFn: async () => {
      const res = await listPurchaseOrders({ organizationId });
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
  });

  const loading = suppliersLoading || ordersLoading;

  const handleSend = async (orderId: string) => {
    setBusyOrderId(orderId);
    try {
      const res = await updatePurchaseOrderStatus(orderId, "SENT");
      if (res.success) {
        toast.success("Commande envoyée au fournisseur.");
        queryClient.setQueryData(["purchaseOrders", organizationId], (prev: any[] = []) => prev.map((o) => (o.id === orderId ? res.data : o)));
      } else {
        toast.error(res.error || "Erreur.");
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    setBusyOrderId(orderId);
    try {
      const res = await updatePurchaseOrderStatus(orderId, "CANCELLED");
      if (res.success) {
        toast.success("Commande annulée.");
        queryClient.setQueryData(["purchaseOrders", organizationId], (prev: any[] = []) => prev.map((o) => (o.id === orderId ? res.data : o)));
      } else {
        toast.error(res.error || "Erreur.");
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Chargement...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Fournisseurs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Truck className="h-5 w-5 text-indigo-500" />
            Fournisseurs ({suppliers.length})
          </h3>
          {canWrite && (
            <NewSupplierDialog
              organizationId={organizationId}
              onSuccess={(s) =>
                queryClient.setQueryData(["suppliers", organizationId], (prev: any[] = []) =>
                  [...prev, s].sort((a, b) => a.name.localeCompare(b.name))
                )
              }
            />
          )}
        </div>
        {suppliers.length === 0 ? (
          <div className="border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground">Aucun fournisseur enregistré.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {suppliers.map((s) => (
              <Card key={s.id} className="rounded-2xl">
                <CardContent className="py-4">
                  <p className="font-semibold text-sm">{s.name}</p>
                  {s.contactName && <p className="text-xs text-muted-foreground">{s.contactName}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
                    {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Commandes fournisseurs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-indigo-500" />
            Commandes fournisseurs ({orders.length})
          </h3>
          {canWrite && suppliers.length > 0 && (
            <NewPurchaseOrderDialog
              suppliers={suppliers}
              pharmacyItems={pharmacyItems}
              organizationId={organizationId}
              onSuccess={(o) => queryClient.setQueryData(["purchaseOrders", organizationId], (prev: any[] = []) => [o, ...prev])}
            />
          )}
        </div>
        {suppliers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ajoutez un fournisseur pour pouvoir créer une commande.</p>
        ) : orders.length === 0 ? (
          <div className="border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground">Aucune commande fournisseur pour le moment.</div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const status = STATUS_LABELS[order.status] || STATUS_LABELS.DRAFT;
              const total = order.lines.reduce((sum: number, l: any) => sum + l.quantityOrdered * l.unitCost, 0);
              return (
                <Card key={order.id} className="rounded-2xl">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-base">{order.supplier?.name}</CardTitle>
                      <CardDescription>
                        {order.lines.length} ligne(s) • {formatFCFA(total)} • Créée par {order.createdBy?.firstName} {order.createdBy?.lastName}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={status.className}>{status.label}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {order.lines.map((l: any) => (
                        <Badge key={l.id} variant="outline" className="text-[10px]">
                          {l.pharmacyItem?.name || l.newItemName} — {l.quantityReceived}/{l.quantityOrdered}
                        </Badge>
                      ))}
                    </div>
                    {canWrite && (
                      <div className="flex gap-2">
                        {order.status === "DRAFT" && (
                          <>
                            <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" disabled={busyOrderId === order.id} onClick={() => handleSend(order.id)}>
                              {busyOrderId === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              Envoyer
                            </Button>
                            <Button size="sm" variant="ghost" className="gap-1.5 rounded-lg text-red-500 hover:text-red-600" disabled={busyOrderId === order.id} onClick={() => handleCancel(order.id)}>
                              <XCircle className="h-3.5 w-3.5" />
                              Annuler
                            </Button>
                          </>
                        )}
                        {(order.status === "SENT" || order.status === "PARTIALLY_RECEIVED") && (
                          <ReceivePurchaseOrderDialog
                            order={order}
                            onSuccess={(o) =>
                              queryClient.setQueryData(["purchaseOrders", organizationId], (prev: any[] = []) => prev.map((x) => (x.id === o.id ? o : x)))
                            }
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
