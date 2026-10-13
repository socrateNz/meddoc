"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { discardBloodUnit } from "@/actions/blood-bank";
import {
  ABO_GROUPS,
  BLOOD_PRODUCTS,
  BLOOD_PRODUCT_SHORT,
  DISCARD_REASONS,
  DISCARD_REASON_LABELS,
  RHESUS,
  UNIT_STATUS_LABELS,
  expiresSoon,
  formatBloodGroup,
  isExpired,
  type BloodProduct,
} from "@/lib/blood-bank";

type Unit = { id: string; unitNumber: string; product: string; aboGroup: string; rhesus: string; volumeMl: number | null; expiresAt: string; source: string | null; price: number; status: string };

const GROUPS = ABO_GROUPS.flatMap((abo) => RHESUS.map((rh) => ({ abo, rh })));
const formatDate = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));

// Stock de produits sanguins : disponibilités par produit et groupe, alertes de péremption,
// destruction des poches inutilisables.
export default function BloodStockView({ units, canManage }: { units: Unit[]; canManage: boolean }) {
  const router = useRouter();
  const [now] = useState(() => new Date());
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [reason, setReason] = useState<(typeof DISCARD_REASONS)[number]>("EXPIRED");

  const usable = units.filter((u) => u.status === "AVAILABLE" && !isExpired(u.expiresAt, now));
  const expired = units.filter((u) => isExpired(u.expiresAt, now));
  const soon = units.filter((u) => u.status === "AVAILABLE" && expiresSoon(u.expiresAt, now));

  const discard = async (unit: Unit) => {
    const res = await discardBloodUnit({ unitId: unit.id, reason });
    if (res.success) {
      toast.success(`Poche ${unit.unitNumber} détruite.`);
      setDiscarding(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-5">
      {(expired.length > 0 || soon.length > 0) && (
        <div className="space-y-2">
          {expired.length > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 px-4 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {expired.length} poche(s) périmée(s) encore en stock : à détruire ({expired.map((u) => u.unitNumber).join(", ")}).
            </div>
          )}
          {soon.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {soon.length} poche(s) périment dans les 3 jours : à utiliser en priorité.
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-bold text-slate-500">Produit disponible</th>
              {GROUPS.map((g) => (
                <th key={`${g.abo}${g.rh}`} className="px-2 py-2 text-xs font-bold text-slate-500 text-center">
                  {formatBloodGroup(g)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BLOOD_PRODUCTS.map((p) => (
              <tr key={p} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium">{BLOOD_PRODUCT_SHORT[p]}</td>
                {GROUPS.map((g) => {
                  const n = usable.filter((u) => u.product === p && u.aboGroup === g.abo && u.rhesus === g.rh).length;
                  return (
                    <td key={`${g.abo}${g.rh}`} className={`px-2 py-2 text-center font-mono ${n === 0 ? "text-slate-300 dark:text-slate-600" : "font-bold"}`}>
                      {n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800">
        {units.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucune poche en stock.</p>
        ) : (
          units.map((u) => {
            const exp = isExpired(u.expiresAt, now);
            const warn = expiresSoon(u.expiresAt, now);
            return (
              <div key={u.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-9 w-12 rounded-lg bg-red-600 text-white font-black flex items-center justify-center text-sm">{formatBloodGroup({ abo: u.aboGroup, rh: u.rhesus })}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {BLOOD_PRODUCT_SHORT[u.product as BloodProduct] ?? u.product} <span className="font-mono text-muted-foreground">n° {u.unitNumber}</span>
                    </p>
                    <p className={`text-xs ${exp ? "text-red-600 font-semibold" : warn ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                      Périme le {formatDate(u.expiresAt)}
                      {u.volumeMl ? ` • ${u.volumeMl} mL` : ""}
                      {u.source ? ` • ${u.source}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={exp ? "border-red-300 text-red-600" : ""}>
                    {exp ? "Périmée" : UNIT_STATUS_LABELS[u.status] ?? u.status}
                  </Badge>
                  {canManage && u.status === "AVAILABLE" &&
                    (discarding === u.id ? (
                      <>
                        <select value={reason} onChange={(e) => setReason(e.target.value as (typeof DISCARD_REASONS)[number])} className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          {DISCARD_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {DISCARD_REASON_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="destructive" onClick={() => discard(u)}>
                          Confirmer
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDiscarding(null)}>
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-red-600"
                        onClick={() => {
                          setReason(exp ? "EXPIRED" : "DAMAGED");
                          setDiscarding(u.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Détruire
                      </Button>
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
