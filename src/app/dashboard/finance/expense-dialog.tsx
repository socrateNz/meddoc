"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MinusCircle, Loader2 } from "lucide-react";
import { recordExpense } from "@/actions/finance";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface ExpenseDialogProps {
  organizationId?: string;
  onSuccess: (transaction: any) => void;
}

export default function ExpenseDialog({ organizationId, onSuccess }: ExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const [expenseData, setExpenseData] = useState({ description: "", amount: "" });
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseMsg, setExpenseMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const resetForm = () => {
    setExpenseData({ description: "", amount: "" });
    setExpenseMsg(null);
  };

  const handleExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseLoading(true);
    setExpenseMsg(null);

    try {
      const res = await recordExpense({
        description: expenseData.description,
        amount: Number(expenseData.amount),
        organizationId,
      });

      if (res.success) {
        const transactionObj = (res as any).data || {
          id: `tmp-${Date.now()}`,
          type: "EXPENSE",
          category: "OPERATIONAL_EXPENSE",
          amount: Number(expenseData.amount),
          description: expenseData.description.trim(),
          createdAt: new Date().toISOString(),
        };

        resetForm();
        setOpen(false);
        onSuccess(transactionObj);
      } else {
        setExpenseMsg({ type: "error", text: res.error || "Erreur d'enregistrement." });
      }
    } catch (err: any) {
      setExpenseMsg({ type: "error", text: err.message || "Erreur de connexion." });
    } finally {
      setExpenseLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl border-rose-500/30 text-rose-600 hover:bg-rose-500/10" />}>
        <MinusCircle className="h-4 w-4" />
        Nouvelle dépense
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-rose-600 dark:text-rose-400">
            <MinusCircle className="h-5 w-5" />
            Dépense / Retrait de caisse
          </DialogTitle>
          <DialogDescription>
            Sortie de trésorerie (achats de fournitures, retraits d&apos;urgence, frais opérationnels).
          </DialogDescription>
        </DialogHeader>

        {expenseMsg && (
          <div className={`p-3 text-xs font-medium rounded-xl border ${expenseMsg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"}`}>
            {expenseMsg.text}
          </div>
        )}

        <form onSubmit={handleExpense} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="expenseDescription">Motif du retrait / dépense *</Label>
            <Input
              id="expenseDescription"
              required
              placeholder="ex: Achat fournitures de bureau, Carburant..."
              value={expenseData.description}
              onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expenseAmount">Montant du retrait (FCFA) *</Label>
            <Input
              id="expenseAmount"
              type="number"
              min="1"
              required
              placeholder="ex: 2000"
              value={expenseData.amount}
              onChange={(e) => setExpenseData({ ...expenseData, amount: e.target.value })}
              className="rounded-xl"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={expenseLoading}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
            >
              {expenseLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MinusCircle className="h-4 w-4 mr-2" />}
              Valider le retrait (-{expenseData.amount ? formatFCFA(Number(expenseData.amount)) : "0 FCFA"})
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
