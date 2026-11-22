"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

// Saisie de la réduction d'une ligne de facture : en FCFA ou en %, avec un motif obligatoire.
// Réservée aux membres qui ont « invoices.discount » (cf. src/lib/invoice-discount.ts) ; le
// serveur recalcule et contrôle tout.
export function LineDiscountEditor({
  gross,
  initialDiscount = 0,
  initialReason = "",
  onApply,
  onCancel,
  busy = false,
}: {
  gross: number;
  initialDiscount?: number;
  initialReason?: string;
  onApply: (discount: number, reason: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [unit, setUnit] = useState<"FCFA" | "PERCENT">("FCFA");
  const [value, setValue] = useState(initialDiscount > 0 ? String(initialDiscount) : "");
  const [reason, setReason] = useState(initialReason);

  const raw = Number(value) || 0;
  const discount = Math.min(gross, Math.max(0, Math.round(unit === "PERCENT" ? (gross * raw) / 100 : raw)));
  const tooHigh = unit === "PERCENT" ? raw > 100 : raw > gross;
  const canApply = discount > 0 && !tooHigh && reason.trim().length > 0;

  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/40 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">Réduction</label>
          <div className="flex">
            <Input
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="h-9 w-24 rounded-r-none text-right text-sm"
              autoFocus
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "FCFA" | "PERCENT")}
              className="h-9 rounded-r-md border border-l-0 border-input bg-background px-2 text-xs"
              aria-label="Unité de la réduction"
            >
              <option value="FCFA">FCFA</option>
              <option value="PERCENT">%</option>
            </select>
          </div>
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <label className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">Motif *</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex : patient indigent, personnel, geste commercial" maxLength={200} className="h-9 text-sm" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={tooHigh ? "font-semibold text-red-600" : "text-slate-600 dark:text-slate-300"}>
          {tooHigh ? "La réduction dépasse le prix." : `${formatFCFA(gross)} − ${formatFCFA(discount)} = `}
          {!tooHigh && <strong>{formatFCFA(gross - discount)}</strong>}
        </span>
        <span className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button type="button" size="sm" onClick={() => onApply(discount, reason.trim())} disabled={!canApply || busy} className="bg-violet-600 text-white hover:bg-violet-700">
            Appliquer
          </Button>
        </span>
      </div>
    </div>
  );
}

export function DiscountNote({ discount, reason }: { discount?: number; reason?: string }) {
  if (!discount || discount <= 0) return null;
  return (
    <span className="block text-[11px] font-semibold text-violet-600 dark:text-violet-400">
      Réduction −{formatFCFA(discount)}
      {reason ? ` (${reason})` : ""}
    </span>
  );
}
