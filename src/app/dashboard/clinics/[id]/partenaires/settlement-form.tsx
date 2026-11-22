"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordPartnerSettlement } from "@/actions/partners";
import { toast } from "sonner";

const METHODS = [
  ["CASH", "Espèces"],
  ["MOBILE_MONEY", "Mobile money"],
  ["BANK_TRANSFER", "Virement"],
  ["CHEQUE", "Chèque"],
] as const;

// Enregistre un règlement reçu du partenaire pour le relevé affiché (versements partiels possibles).
export default function SettlementForm({ partnerId, month, balance }: { partnerId: string; month: string; balance: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(balance > 0 ? String(Math.round(balance)) : "");
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Montant invalide.");
      return;
    }
    setSaving(true);
    const res = await recordPartnerSettlement({ partnerId, month, amount: value, paymentMethod: method, reference: reference.trim() || undefined });
    setSaving(false);
    if (res.success) {
      toast.success("Règlement enregistré.");
      setReference("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 print:hidden">
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-500">Montant reçu (FCFA)</label>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="h-10 w-36" />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-500">Mode</label>
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900">
          {METHODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-40 flex-1 space-y-1">
        <label className="text-[11px] font-semibold text-slate-500">Référence (n° de virement, chèque…)</label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} className="h-10" />
      </div>
      <Button type="submit" disabled={saving} className="h-10 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        Enregistrer le règlement
      </Button>
    </form>
  );
}
