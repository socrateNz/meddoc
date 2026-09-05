"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCog, Loader2 } from "lucide-react";
import { updateInvoicePatientInfo } from "@/actions/finance";
import { toast } from "sonner";

interface EditInvoiceClientDialogProps {
  pendingInvoiceId: string;
  currentName?: string | null;
  currentPhone?: string | null;
  trigger?: React.ReactElement;
  onSuccess?: () => void;
}

export function EditInvoiceClientDialog({
  pendingInvoiceId,
  currentName = "",
  currentPhone = "",
  trigger,
  onSuccess,
}: EditInvoiceClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName || "");
  const [phone, setPhone] = useState(currentPhone || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await updateInvoicePatientInfo({
        pendingInvoiceId,
        customPatientName: name.trim() || undefined,
        customPatientPhone: phone.trim() || undefined,
      });

      if (res.success) {
        toast.success("Informations client mises à jour.");
        setOpen(false);
        onSuccess?.();
      } else {
        setError(res.error || "Erreur lors de la mise à jour.");
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setName(currentName || ""); setPhone(currentPhone || ""); setError(""); } }}>
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : (
        <DialogTrigger render={<Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-slate-500 hover:text-slate-800" title="Ajouter / modifier le nom & téléphone du client" />}>
          <UserCog className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Identité client</span>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <UserCog className="h-5 w-5 text-blue-600" />
            Renseigner / Modifier le client
          </DialogTitle>
          <DialogDescription>
            Ajoutez ou modifiez le nom et le numéro de téléphone pour ce ticket de caisse / facture.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="editCustomName" className="text-xs">Nom & Prénom du client</Label>
            <Input
              id="editCustomName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: M. Yao Alain"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editCustomPhone" className="text-xs">Numéro de téléphone</Label>
            <Input
              id="editCustomPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="ex: 07 00 00 00 00"
              className="rounded-xl"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
