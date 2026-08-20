"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardList, PlayCircle, Save, CheckCircle2, Loader2, AlertTriangle, History } from "lucide-react";
import {
  startInventoryCount,
  getActiveInventoryCount,
  saveInventoryCounts,
  completeInventoryCount,
  getInventoryHistory,
} from "@/actions/stock";

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

interface InventoryPanelProps {
  organizationId?: string;
  canWrite?: boolean;
}

export default function InventoryPanel({ organizationId, canWrite = true }: InventoryPanelProps) {
  const queryClient = useQueryClient();
  const [countedValues, setCountedValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastClosure, setLastClosure] = useState<{ totalLossValue: number } | null>(null);

  const countQueryKey = ["activeInventoryCount", organizationId];
  const historyQueryKey = ["inventoryHistory", organizationId];

  const { data: count = null, isLoading: countLoading } = useQuery({
    queryKey: countQueryKey,
    queryFn: async () => {
      const res = await getActiveInventoryCount(organizationId!);
      if (!res.success) throw new Error(res.error);
      return res.data ?? null;
    },
    enabled: !!organizationId,
  });

  const { data: history = [], isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const res = await getInventoryHistory(organizationId!);
      if (!res.success) throw new Error(res.error);
      return res.data ?? [];
    },
    enabled: !!organizationId,
  });

  const loading = countLoading || historyLoading;

  const closureSummary = () => {
    let conforming = 0, negative = 0, positive = 0, lossValue = 0;
    (count?.lines || []).forEach((line: any) => {
      const counted = Number(countedValues[line.id] ?? line.systemQuantity);
      const variance = counted - line.systemQuantity;
      if (variance === 0) conforming++;
      else if (variance < 0) {
        negative++;
        if (line.unitCost) lossValue += Math.abs(variance) * line.unitCost;
      } else {
        positive++;
      }
    });
    return { conforming, negative, positive, lossValue };
  };

  useEffect(() => {
    if (count?.lines) {
      const initial: Record<string, string> = {};
      count.lines.forEach((line: any) => {
        initial[line.id] = String(line.countedQuantity ?? line.systemQuantity);
      });
      setCountedValues(initial);
    }
  }, [count?.id]);

  if (!organizationId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-muted-foreground">
        <ClipboardList className="h-8 w-8 mx-auto mb-3 opacity-40" />
        Sélectionnez une clinique active pour démarrer un inventaire. Le comptage physique se fait établissement par établissement.
      </div>
    );
  }

  const handleStart = async () => {
    setMsg(null);
    setStarting(true);
    try {
      const res = await startInventoryCount(organizationId);
      if (res.success) {
        queryClient.setQueryData(countQueryKey, res.data);
        setLastClosure(null);
      } else {
        setMsg({ type: "error", text: res.error || "Erreur lors du démarrage." });
      }
    } finally {
      setStarting(false);
    }
  };

  const buildLinesPayload = () =>
    (count?.lines || []).map((line: any) => ({
      lineId: line.id,
      countedQuantity: Number(countedValues[line.id] ?? line.systemQuantity),
    }));

  const handleSaveDraft = async (silent = false) => {
    if (!count) return;
    setSaving(true);
    if (!silent) setMsg(null);
    try {
      const res = await saveInventoryCounts(count.id, buildLinesPayload());
      if (!silent) {
        if (res.success) {
          setMsg({ type: "success", text: "Comptage enregistré." });
        } else {
          setMsg({ type: "error", text: res.error || "Erreur lors de l'enregistrement." });
        }
      }
      return res.success;
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!count) return;
    setConfirmOpen(false);
    setCompleting(true);
    setMsg(null);
    try {
      const savedOk = await handleSaveDraft(true);
      if (!savedOk) {
        setMsg({ type: "error", text: "Impossible d'enregistrer le comptage avant clôture." });
        return;
      }
      const res = await completeInventoryCount(count.id);
      if (res.success) {
        setLastClosure(res.data ?? null);
        queryClient.setQueryData(countQueryKey, null);
        setMsg({ type: "success", text: "Inventaire clôturé avec succès." });
        refetchHistory();
      } else {
        setMsg({ type: "error", text: res.error || "Erreur lors de la clôture de l'inventaire." });
      }
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`p-3 text-xs font-medium rounded-xl border ${
            msg.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30"
              : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/30"
          }`}
        >
          {msg.text}
        </div>
      )}

      {lastClosure && (
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 p-4 text-sm">
          <p className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Dernière clôture d'inventaire
          </p>
          <p className="text-muted-foreground mt-1">
            Pertes constatées valorisées à{" "}
            <span className="font-bold text-rose-600">{formatFCFA(lastClosure.totalLossValue)}</span> — enregistrées
            comme dépense dans le journal de caisse.
          </p>
        </div>
      )}

      {!count ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <ClipboardList className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground mb-4">
            Aucun inventaire en cours pour cette clinique.{" "}
            {canWrite
              ? "Démarrer un inventaire fige le stock système de chaque produit ; vous n'aurez plus qu'à saisir la quantité réellement comptée."
              : "Seuls le coordinateur ou le pharmacien peuvent démarrer un inventaire."}
          </p>
          {canWrite && (
            <Button onClick={handleStart} disabled={starting} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Démarrer l'inventaire
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Inventaire démarré le {formatDate(count.createdAt)} — {count.lines.length} produit(s) à compter.
            </p>
            {canWrite && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleSaveDraft(false)} disabled={saving} className="gap-2 rounded-xl">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer le comptage
                </Button>
                <Button onClick={() => setConfirmOpen(true)} disabled={completing} className="gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white">
                  {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Clôturer l'inventaire
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
                <TableRow>
                  <TableHead className="text-xs uppercase font-bold">Produit</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Stock système</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Quantité comptée</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Écart</TableHead>
                  <TableHead className="text-xs uppercase font-bold text-right">Valeur au coût</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {count.lines.map((line: any) => {
                  const counted = Number(countedValues[line.id] ?? line.systemQuantity);
                  const variance = counted - line.systemQuantity;
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-semibold py-3">
                        {line.pharmacyItem?.name}
                        {line.pharmacyItem?.dosage && (
                          <span className="text-xs text-muted-foreground"> ({line.pharmacyItem.dosage})</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3">{line.systemQuantity}</TableCell>
                      <TableCell className="py-3">
                        <Input
                          type="number"
                          min="0"
                          value={countedValues[line.id] ?? ""}
                          onChange={(e) =>
                            setCountedValues((prev) => ({ ...prev, [line.id]: e.target.value }))
                          }
                          disabled={!canWrite}
                          className="w-24 h-8 rounded-lg"
                        />
                      </TableCell>
                      <TableCell className="py-3">
                        {variance === 0 ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px]">
                            Conforme
                          </Badge>
                        ) : variance < 0 ? (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/20 gap-1 text-[11px]">
                            <AlertTriangle className="h-3 w-3" /> {variance}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[11px]">
                            +{variance}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-right font-medium">
                        {line.unitCost ? formatFCFA(counted * line.unitCost) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Clôturer l'inventaire ?
            </DialogTitle>
            <DialogDescription>
              Cette action est définitive : le stock système sera ajusté sur les quantités comptées et ce comptage ne
              pourra plus être modifié.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const s = closureSummary();
            return (
              <>
                <div className="space-y-2 text-sm rounded-xl border border-slate-200/60 dark:border-slate-800/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Produits comptés</span>
                    <span className="font-semibold">{count?.lines.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Conformes</span>
                    <span className="font-semibold text-emerald-600">{s.conforming}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Écarts négatifs (manquants)</span>
                    <span className="font-semibold text-rose-600">{s.negative}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Écarts positifs (surplus)</span>
                    <span className="font-semibold text-amber-600">{s.positive}</span>
                  </div>
                </div>

                {s.lossValue > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
                    Une dépense de <span className="font-bold">{formatFCFA(s.lossValue)}</span> sera automatiquement
                    enregistrée dans le journal de caisse pour couvrir les écarts constatés.
                  </p>
                )}
              </>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={completing} className="rounded-xl">
              Annuler
            </Button>
            <Button onClick={handleComplete} disabled={completing} className="gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white">
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmer la clôture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {history.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
            <History className="h-3.5 w-3.5" /> Historique des inventaires
          </p>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/40">
                <TableRow>
                  <TableHead className="text-xs uppercase font-bold">Clôturé le</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Réalisé par</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Produits comptés</TableHead>
                  <TableHead className="text-xs uppercase font-bold">Écarts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h: any) => {
                  const variances = h.lines.filter((l: any) => l.countedQuantity !== l.systemQuantity).length;
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="py-2.5 text-xs">{h.completedAt ? formatDate(h.completedAt) : "-"}</TableCell>
                      <TableCell className="py-2.5 text-xs">
                        {h.startedBy?.firstName} {h.startedBy?.lastName}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs">{h.lines.length}</TableCell>
                      <TableCell className="py-2.5 text-xs">
                        {variances === 0 ? (
                          <span className="text-emerald-600 font-semibold">Aucun écart</span>
                        ) : (
                          <span className="text-amber-600 font-semibold">{variances} écart(s)</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
