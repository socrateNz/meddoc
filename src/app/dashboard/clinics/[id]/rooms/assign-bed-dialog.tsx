"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2, BedSingle } from "lucide-react";
import { assignPatientToBed } from "@/actions/wards";
import { toast } from "sonner";

interface AssignBedDialogProps {
  bedId: string;
  bedLabel: string;
  patients: { id: string; user: { firstName: string; lastName: string } }[];
  onSuccess?: () => void;
}

export default function AssignBedDialog({ bedId, bedLabel, patients, onSuccess }: AssignBedDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState("");

  const patientOptions = patients.map((p) => ({ value: p.id, label: `${p.user.lastName} ${p.user.firstName}` }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      toast.error("Sélectionnez un patient.");
      return;
    }
    setLoading(true);
    try {
      const res = await assignPatientToBed({ patientId, bedId });
      if (res.success) {
        toast.success("Patient affecté au lit.");
        setOpen(false);
        setPatientId("");
        onSuccess?.();
      } else {
        toast.error(res.error || "Erreur lors de l'affectation.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
            title={`Affecter un patient au lit ${bedLabel}`}
          />
        }
      >
        <UserPlus className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-emerald-600" />
            Affecter le lit {bedLabel}
          </DialogTitle>
          <DialogDescription>
            Choisissez le patient à installer dans ce lit. S&apos;il occupait déjà un autre lit, celui-ci sera automatiquement libéré.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Patient *</Label>
            <Select items={patientOptions} value={patientId} onValueChange={(v: any) => setPatientId(v || "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir un patient..." />
              </SelectTrigger>
              <SelectContent>
                {patientOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {patientOptions.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Aucun patient disponible dans cette clinique.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading || !patientId} className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedSingle className="h-4 w-4" />}
              Affecter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
