"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, BedSingle } from "lucide-react";
import { createBed } from "@/actions/wards";
import { toast } from "sonner";

interface BedDialogProps {
  roomId: string;
  onSuccess?: () => void;
}

export default function BedDialog({ roomId, onSuccess }: BedDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("L'identifiant du lit est requis.");
      return;
    }
    setLoading(true);
    try {
      const res = await createBed({ roomId, label: label.trim() });
      if (res.success) {
        toast.success("Lit ajouté.");
        setOpen(false);
        setLabel("");
        onSuccess?.();
      } else {
        toast.error(res.error || "Erreur lors de l'ajout du lit.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5 rounded-xl" />}>
        <Plus className="h-3.5 w-3.5" />Lit
      </DialogTrigger>
      <DialogContent className="sm:max-w-[340px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BedSingle className="h-5 w-5 text-blue-500" />
            Nouveau lit
          </DialogTitle>
          <DialogDescription>Ajoutez un lit à cette chambre.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Identifiant du lit *</Label>
            <Input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: A, 1, Lit 2" className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedSingle className="h-4 w-4" />}
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
