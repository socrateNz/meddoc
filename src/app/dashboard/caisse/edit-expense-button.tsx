"use client";

// ─── TEMPORAIRE — à retirer avec correctCashExpense (src/actions/finance.ts) ───
// Bouton « Modifier » sur un retrait / une dépense de la séance de caisse ouverte : le retrait
// d'origine est annulé (contrepassé) et remplacé par un retrait aux valeurs corrigées.

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SearchableSelect from "@/components/ui/searchable-select";
import { FormMessage } from "@/components/ui/form-message";
import { correctCashExpense } from "@/actions/finance";
import { EXPENSE_CATEGORIES, WITHDRAWAL_CATEGORIES } from "@/lib/accounting/plan";

const CATEGORY_OPTIONS = [
  ...Object.entries(EXPENSE_CATEGORIES).map(([value, c]) => ({ value, label: c.label, description: "Dépense (charge)" })),
  ...Object.entries(WITHDRAWAL_CATEGORIES).map(([value, c]) => ({ value, label: c.label, description: "Retrait — n'est pas une charge" })),
];

type Expense = { id: string; description: string; amount: number; expenseCategory?: string | null };

export default function EditExpenseButton({ transaction, onDone }: { transaction: Expense; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [category, setCategory] = useState(transaction.expenseCategory || "other");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setDescription(transaction.description);
    setAmount(String(transaction.amount));
    setCategory(transaction.expenseCategory || "other");
    setReason("");
    setError(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = Number(amount.replace(/\s/g, ""));
    if (!description.trim() || !Number.isFinite(value) || value <= 0) {
      setError("Motif et montant (supérieur à zéro) requis.");
      return;
    }
    setSaving(true);
    const res = await correctCashExpense({ transactionId: transaction.id, description: description.trim(), amount: value, category, reason: reason.trim() || undefined });
    setSaving(false);
    if (res.success) {
      setOpen(false);
      onDone();
    } else {
      setError(res.error);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog} className="h-7 w-7 p-0 text-amber-600" title="Modifier ce retrait" aria-label="Modifier ce retrait">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Modifier le retrait</DialogTitle>
              <DialogDescription>
                Le retrait d&apos;origine est annulé et remplacé par celui-ci ; les deux restent visibles dans l&apos;historique.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="edit-expense-description">Motif *</Label>
              <Input id="edit-expense-description" value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-expense-amount">Montant (FCFA) *</Label>
                <Input id="edit-expense-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <SearchableSelect value={category} onValueChange={(v) => v && setCategory(v)} options={CATEGORY_OPTIONS} clearable={false} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-expense-reason">Raison de la correction</Label>
              <Input id="edit-expense-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: erreur de montant" className="h-9 rounded-xl" />
            </div>
            {error && <FormMessage type="error" text={error} />}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)} className="rounded-xl">
                Annuler
              </Button>
              <Button type="submit" disabled={saving} className="gap-1.5 rounded-xl">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
