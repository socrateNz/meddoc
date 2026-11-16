"use client";

import { toast } from "sonner";
import { PackageCheck } from "lucide-react";
import { dispenseAtCashier } from "@/actions/finance";

// Remise directe à la caisse (caissière qui est aussi pharmacienne) : case à cocher affichée dans
// la vente et l'encaissement quand le ticket contient des médicaments, et remise lancée juste
// après l'enregistrement de l'argent. Cochée par défaut pour un pharmacien.
export function DispenseNowCheckbox({ checked, onChange, id = "dispenseNow" }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-emerald-200/60 bg-emerald-50/60 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600 sm:h-4 sm:w-4" />
      <span>
        <span className="flex items-center gap-1.5 text-sm sm:text-xs font-bold text-emerald-700 dark:text-emerald-400">
          <PackageCheck className="h-3.5 w-3.5" />
          Médicaments remis au patient maintenant
        </span>
        <span className="mt-0.5 block text-slate-500">
          Le stock est mis à jour tout de suite, sans passer par la page Pharmacie. Possible aussi pour une vente à crédit.
        </span>
      </span>
    </label>
  );
}

// Lance la remise et informe la caissière. Un échec (stock insuffisant...) n'annule pas la vente :
// la remise reste à faire depuis la page Pharmacie.
export async function dispenseAfterPayment(pendingInvoiceId: string | undefined) {
  if (!pendingInvoiceId) return;
  const res = await dispenseAtCashier(pendingInvoiceId);
  if (res.success) {
    if (!res.data.alreadyDispensed) toast.success("Médicaments remis : le stock est à jour.");
  } else {
    toast.warning(`Vente enregistrée, mais la remise n'a pas pu être faite : ${res.error} Faites-la depuis la page Pharmacie.`, { duration: 12000 });
  }
}
