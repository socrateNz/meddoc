"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Stethoscope } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { reclassifyRole } from "@/actions/team";

interface ReclassifyRoleDialogProps {
  userId: string;
  userName: string;
  targetRole: "MEDECIN" | "CAREGIVER";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TARGET_LABEL: Record<string, string> = {
  MEDECIN: "Médecin",
  CAREGIVER: "Infirmier(e)",
};

export default function ReclassifyRoleDialog({ userId, userName, targetRole, open, onOpenChange }: ReclassifyRoleDialogProps) {
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setLoading(true);
    const result = await reclassifyRole(userId, targetRole);
    setLoading(false);

    if (result.success) {
      toast.success(`${userName} est maintenant classé(e) comme ${TARGET_LABEL[targetRole]}.`);
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-blue-500" />
            Marquer comme {TARGET_LABEL[targetRole]} ?
          </DialogTitle>
          <DialogDescription>
            <strong>{userName}</strong> sera reclassé(e) {TARGET_LABEL[targetRole]}, avec les accès correspondants
            (immédiat). Son historique (rendez-vous, tâches, contrats) est conservé. Cette action est réversible à tout moment.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" disabled={loading} />}>
            Annuler
          </DialogClose>
          <Button onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
