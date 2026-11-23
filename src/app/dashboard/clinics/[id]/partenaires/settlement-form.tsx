"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordPartnerSettlement } from "@/actions/partners";
import { toast } from "sonner";

const METHODS = [
  ["TRANSFER", "Virement"],
  ["MOBILE", "Mobile money"],
  ["CHEQUE", "Chèque"],
  ["CASH", "Espèces (à la caisse)"],
] as const;

// Enregistre un règlement reçu du partenaire pour le relevé affiché (versements partiels possibles).
export default function SettlementForm({
  partnerId,
  month,
  balance,
  openSessions,
  canCash,
}: {
  partnerId: string;
  month: string;
  balance: number;
  // Caisses ouvertes : un règlement en espèces entre dans l'une d'elles.
  openSessions: { id: string; label: string }[];
  canCash: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(balance > 0 ? String(Math.round(balance)) : "");
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("TRANSFER");
  const [sessionId, setSessionId] = useState(openSessions[0]?.id ?? "");
  const methods = METHODS.filter(([v]) => v !== "CASH" || canCash);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Montant invalide.");
      return;
    }
    if (method === "CASH" && !sessionId) {
      toast.error("Aucune caisse ouverte : ouvrez une caisse pour encaisser des espèces.");
      return;
    }
    setSaving(true);
    const res = await recordPartnerSettlement({
      partnerId,
      month,
      amount: value,
      paymentMethod: method,
      cashSessionId: method === "CASH" ? sessionId : undefined,
      reference: reference.trim() || undefined,
    });
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
        <label className="text-xs font-semibold text-slate-500">Montant reçu (FCFA)</label>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="h-10 w-36" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-500">Mode</label>
        <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900">
          {methods.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {method === "CASH" && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500">Caisse</label>
          {openSessions.length === 0 ? (
            <p className="h-10 text-xs leading-10 text-red-600">Aucune caisse ouverte</p>
          ) : (
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-900">
              {openSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="min-w-40 flex-1 space-y-1">
        <label className="text-xs font-semibold text-slate-500">Référence (n° de virement, chèque…)</label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} className="h-10" />
      </div>
      <Button type="submit" disabled={saving} className="h-10 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        Enregistrer le règlement
      </Button>
    </form>
  );
}
