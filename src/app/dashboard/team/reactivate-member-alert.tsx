"use client";

import { useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, UserCheck } from "lucide-react";
import { reactivateTeamMember } from "@/actions/team";
import { toast } from "sonner";

interface ReactivateMemberAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export default function ReactivateMemberAlert({ open, onOpenChange, userId, userName }: ReactivateMemberAlertProps) {
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setLoading(true);
    try {
      const response = await reactivateTeamMember(userId);
      if (response.success) {
        toast.success(`${userName} a été réactivé avec succès.`);
        onOpenChange(false);
      } else {
        toast.error(response.error || "Erreur lors de la réactivation.");
      }
    } catch (err) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <UserCheck className="h-5 w-5" />
            Réactiver le membre
          </DialogTitle>
          <DialogDescription className="pt-3">
            Êtes-vous sûr de vouloir réactiver le compte de <strong>{userName}</strong> ?
            <br /><br />
            Il retrouvera son accès à la plateforme et toutes ses autorisations précédentes.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" disabled={loading} />}>
            Annuler
          </DialogClose>
          <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Oui, réactiver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
