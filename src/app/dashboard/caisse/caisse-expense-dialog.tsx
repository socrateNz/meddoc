"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { MinusCircle, Loader2, Info } from "lucide-react";
import { recordExpense } from "@/actions/finance";
import { useSubmitGuard } from "@/hooks/use-submit-guard";
import { EXPENSE_CATEGORIES, WITHDRAWAL_CATEGORIES, type CashOutCategory } from "@/lib/accounting/plan";

// Catégories proposées à la caisse : une vraie dépense (compte de charge) ou un retrait qui n'en est
// pas une (propriétaire, banque, avance...) et n'entre donc pas dans le résultat.
// Liste avec recherche : la ligne sous chaque choix indique s'il compte dans le résultat.
const CATEGORY_OPTIONS = [
  ...Object.entries(EXPENSE_CATEGORIES).map(([value, c]) => ({ value, label: c.label, description: "Dépense (charge)" })),
  ...Object.entries(WITHDRAWAL_CATEGORIES).map(([value, c]) => ({ value, label: c.label, description: "Retrait — n'est pas une charge" })),
];

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface CaisseExpenseDialogProps {
  cashSessionId: string;
  organizationId?: string;
  onSuccess: (transaction: any) => void;
}

export default function CaisseExpenseDialog({ cashSessionId, organizationId, onSuccess }: CaisseExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ description: "", amount: "", category: "other" as CashOutCategory });
  const { submitting: loading, guard } = useSubmitGuard();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const resetForm = () => {
    setData({ description: "", amount: "", category: "other" });
    setMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await guard((idempotencyKey) =>
        recordExpense({ cashSessionId, description: data.description, amount: Number(data.amount), category: data.category, organizationId, idempotencyKey })
      );
      if (!res) return;
      if (res.success) {
        resetForm();
        setOpen(false);
        onSuccess(res.data);
      } else {
        setMsg({ type: "error", text: res.error || "Erreur d'enregistrement." });
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Erreur de connexion." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl border-rose-500/30 text-rose-600 hover:bg-rose-500/10" />}>
        <MinusCircle className="h-4 w-4" />
        Nouvelle dépense
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-[440px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-rose-600 dark:text-rose-400">
            <MinusCircle className="h-5 w-5" />
            Dépense / Retrait de caisse
          </DialogTitle>
          <DialogDescription>Sortie de trésorerie sur la session en cours (achats de fournitures, retraits d&apos;urgence...).</DialogDescription>
        </DialogHeader>

        {msg && (
          <div className={`p-3 text-xs font-medium rounded-xl border ${msg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="expenseDescription">Motif du retrait / dépense *</Label>
            <Input id="expenseDescription" required placeholder="ex: Achat fournitures de bureau..." value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expenseCategory">Catégorie *</Label>
            <SearchableSelect
              id="expenseCategory"
              value={data.category}
              onValueChange={(val) => { if (val) setData({ ...data, category: val as CashOutCategory }); }}
              placeholder="-- Rechercher une catégorie --"
              emptyText="Aucune catégorie trouvée."
              options={CATEGORY_OPTIONS}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expenseAmount">Montant du retrait (FCFA) *</Label>
            <Input id="expenseAmount" type="number" min="1" required placeholder="ex: 2000" value={data.amount} onChange={(e) => setData({ ...data, amount: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm rounded-xl" />
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Si ce retrait sert à financer un achat de médicaments, enregistrez ensuite cet achat
            depuis Pharmacie → Achats en répondant « Non » à « Prélever sur une caisse ouverte ? »
            — l&apos;argent a déjà été sorti ici, une seconde déduction compterait la dépense deux fois.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-11 rounded-xl sm:h-9">Annuler</Button>
            <Button type="submit" disabled={loading} className="h-12 bg-rose-600 hover:bg-rose-700 text-white rounded-xl sm:h-9">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MinusCircle className="h-4 w-4 mr-2" />}
              Valider le retrait (-{data.amount ? formatFCFA(Number(data.amount)) : "0 FCFA"})
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
