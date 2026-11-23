"use client";

import SearchSelect from "@/components/ui/search-select";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/accounting/plan";

// Moyen de règlement d'un encaissement : il détermine le compte de trésorerie de l'écriture
// comptable (caisse, Mobile Money, banque, chèques à encaisser).
export default function PaymentMethodSelect({
  value,
  onChange,
  id = "paymentMethod",
}: {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-xs whitespace-nowrap">Moyen de paiement</Label>
      <SearchSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as PaymentMethod)}
        className="h-11 w-36 rounded-xl border border-input bg-background px-3 text-base sm:h-9 sm:text-sm"
      >
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {PAYMENT_METHOD_LABELS[m]}
          </option>
        ))}
      </SearchSelect>
    </div>
  );
}
