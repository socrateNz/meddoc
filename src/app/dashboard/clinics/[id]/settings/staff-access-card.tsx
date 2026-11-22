"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, Receipt } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { setConsultationBilling, setPharmacistRegisterAccess } from "@/actions/organizations";
import { toast } from "sonner";

// Réglages d'accès du personnel décidés par le coordinateur.
export default function StaffAccessCard({
  clinicId,
  pharmacistCanUseRegister,
  consultationBilling,
  readOnly,
}: {
  clinicId: string;
  pharmacistCanUseRegister: boolean;
  consultationBilling: "ON_CLOSE" | "ON_ARRIVAL";
  readOnly: boolean;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(pharmacistCanUseRegister);
  const [saving, setSaving] = useState(false);
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

  const onChange = async (value: boolean) => {
    setSaving(true);
    const res = await setPharmacistRegisterAccess(clinicId, value);
    setSaving(false);
    if (res.success) {
      setAllowed(value);
      toast.success(value ? "Le pharmacien peut désormais tenir la caisse." : "La caisse est désormais réservée aux caissiers et au coordinateur.");
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
      <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/70 p-3 dark:border-slate-800">
        <span className="flex gap-3">
          <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <span>
            <span className="block text-sm font-medium">Le pharmacien peut tenir la caisse</span>
            <span className="block text-xs text-muted-foreground">
              Ouvrir et fermer une session, encaisser, enregistrer une dépense. Utile quand caisse et pharmacie sont au même guichet.
              Désactivé : séparation stricte, la caisse est réservée aux caissiers et au coordinateur.
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 pt-0.5">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <Switch checked={allowed} onCheckedChange={onChange} disabled={readOnly || saving} aria-label="Le pharmacien peut tenir la caisse" />
        </span>
      </label>
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
