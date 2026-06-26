"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Replace } from "lucide-react";
import { reassignPatient } from "@/actions/patients";
import { toast } from "sonner";

interface ReassignPatientDialogProps {
  patientId: string;
  patientName: string;
  currentOrganizationId: string;
  holdingId: string;
  clinics: { id: string; name: string }[];
}

export default function ReassignPatientDialog({ patientId, patientName, currentOrganizationId, holdingId, clinics }: ReassignPatientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [targetOrg, setTargetOrg] = useState(currentOrganizationId);

  useEffect(() => {
    if (open) {
      setTargetOrg(currentOrganizationId);
    }
  }, [open, currentOrganizationId]);

  const handleReassign = async () => {
    if (targetOrg === currentOrganizationId) {
      toast.error("Veuillez sélectionner une nouvelle entité.");
      return;
    }

    setIsLoading(true);
    const result = await reassignPatient(patientId, targetOrg);

    if (result.success) {
      toast.success(`${patientName} a été réaffecté(e) avec succès.`);
      setOpen(false);
    } else {
      toast.error(result.error);
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 border-primary/20 text-primary hover:bg-primary/5" />}>
        <Replace className="h-4 w-4" />
        Réaffecter
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réaffecter {patientName}</DialogTitle>
          <DialogDescription>
            Transférez le dossier de ce patient vers une autre entité de la holding.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>Entité de rattachement</Label>
            <Select value={targetOrg} onValueChange={(value) => value && setTargetOrg(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez une clinique...">
                  {(val: any) => {
                    if (!val) return "Sélectionnez une clinique...";
                    if (val === holdingId) return "Siège (Holding)";
                    return clinics.find(c => c.id === val)?.name || val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={holdingId}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span>Siège (Holding)</span>
                  </div>
                </SelectItem>
                {clinics.map((clinic) => (
                  <SelectItem key={clinic.id} value={clinic.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-500" />
                      <span>{clinic.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleReassign} disabled={isLoading || targetOrg === currentOrganizationId}>
            {isLoading ? "En cours..." : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
