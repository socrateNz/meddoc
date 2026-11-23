"use client";

import SearchSelect from "@/components/ui/search-select";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { reclassifyWithdrawal } from "@/actions/accounting";
import { EXPENSE_CATEGORIES, WITHDRAWAL_CATEGORIES } from "@/lib/accounting/plan";

// Classement d'une sortie de caisse : charge (6x) ou retrait qui n'en est pas une (hors résultat).
export default function WithdrawalCategorySelect({ organizationId, transactionId, value, disabled }: { organizationId: string; transactionId: string; value: string; disabled?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);

  const change = async (category: string) => {
    const previous = current;
    setCurrent(category);
    setBusy(true);
    const res = await reclassifyWithdrawal(organizationId, transactionId, category);
    setBusy(false);
    if (!res.success) {
      setCurrent(previous);
      toast.error(res.error);
      return;
    }
    toast.success("Sortie reclassée : l'ancienne écriture est contrepassée, la nouvelle est passée.");
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <SearchSelect
        value={current}
        disabled={disabled || busy}
        onChange={(e) => change(e.target.value)}
        className="h-8 w-full max-w-xs rounded-lg border border-input bg-background px-2 text-xs disabled:opacity-60"
      >
        <optgroup label="Retraits qui ne sont pas des charges">
          {Object.entries(WITHDRAWAL_CATEGORIES).map(([key, c]) => (
            <option key={key} value={key}>{c.label}</option>
          ))}
        </optgroup>
        <optgroup label="Charges (dépenses)">
          {Object.entries(EXPENSE_CATEGORIES).map(([key, c]) => (
            <option key={key} value={key}>{c.label}</option>
          ))}
        </optgroup>
      </SearchSelect>
      {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
    </div>
  );
}
