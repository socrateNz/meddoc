"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Replace } from "lucide-react";
import { reassignTeamMember } from "@/actions/team";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface ReassignMemberDialogProps {
  userId: string;
  userName: string;
  currentOrganizationId: string;
  holdingId: string;
  clinics: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReassignMemberDialog({ userId, userName, currentOrganizationId, holdingId, clinics, open, onOpenChange }: ReassignMemberDialogProps) {
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
    const result = await reassignTeamMember(userId, targetOrg);

    if (result.success) {
      toast.success(`${userName} a été réaffecté(e) avec succès.`);
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Réaffecter {userName}</DialogTitle>
          <DialogDescription>
            Déplacez ce membre du personnel vers une autre entité de la holding.
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleReassign} disabled={isLoading || targetOrg === currentOrganizationId}>
            {isLoading ? "En cours..." : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
