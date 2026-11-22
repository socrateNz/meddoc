"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Receipt, ShieldCheck } from "lucide-react";
import { setConsultationBilling } from "@/actions/organizations";
import { toast } from "sonner";

// Réglages de fonctionnement décidés par le coordinateur. Ce que chaque rôle peut faire (dont
// l'ancien réglage « le pharmacien peut tenir la caisse ») se règle dans Rôles et permissions.
export default function StaffAccessCard({
  clinicId,
  consultationBilling,
  readOnly,
}: {
  clinicId: string;
  consultationBilling: "ON_CLOSE" | "ON_ARRIVAL";
  readOnly: boolean;
}) {
  const router = useRouter();
  const [billing, setBilling] = useState(consultationBilling);
  const [savingBilling, setSavingBilling] = useState(false);

  const onBillingChange = async (mode: "ON_CLOSE" | "ON_ARRIVAL") => {
    if (mode === billing) return;
    setSavingBilling(true);
    const res = await setConsultationBilling(clinicId, mode);
    setSavingBilling(false);
    if (res.success) {
      setBilling(mode);
      toast.success(mode === "ON_ARRIVAL" ? "La consultation sera facturée dès l'arrivée." : "La consultation sera facturée à sa clôture.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/60 p-5 dark:border-slate-800 dark:bg-slate-900/50">
      <div>
        <h2 className="font-semibold">Fonctionnement de la clinique</h2>
        <p className="text-xs text-muted-foreground">Réglages décidés par le coordinateur de la clinique.</p>
      </div>
      <Link
        href={`/dashboard/clinics/${clinicId}/roles`}
        className="flex items-start gap-3 rounded-xl border border-slate-200/70 p-3 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
      >
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <span>
          <span className="block text-sm font-medium">Rôles et permissions</span>
          <span className="block text-xs text-muted-foreground">
            Ce que chaque rôle peut faire (ex : le pharmacien peut-il tenir la caisse ?), et les rôles propres à la clinique.
          </span>
        </span>
      </Link>
      <div className="space-y-2 rounded-xl border border-slate-200/70 p-3 dark:border-slate-800">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Receipt className="h-5 w-5 shrink-0 text-blue-600" />
          Facturation de la consultation
          {savingBilling && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </p>
        {(
          [
            ["ON_CLOSE", "À la clôture de la consultation", "Le médecin clôture : le ticket (consultation + médicaments prescrits) part à la caisse."],
            ["ON_ARRIVAL", "Dès l'arrivée, avant de voir le médecin", "L'accueil oriente vers un service : le ticket de consultation est créé aussitôt, le patient paie puis attend. Les médicaments prescrits font un second ticket."],
          ] as const
        ).map(([mode, label, help]) => (
          <label key={mode} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="consultation-billing" className="mt-1" checked={billing === mode} disabled={readOnly || savingBilling} onChange={() => onBillingChange(mode)} />
            <span>
              <span className="font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{help}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
