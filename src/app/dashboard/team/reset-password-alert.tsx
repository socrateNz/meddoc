"use client";

import { useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound } from "lucide-react";
import { resetTeamMemberPassword } from "@/actions/team";
import { toast } from "sonner";

interface ResetPasswordAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export default function ResetPasswordAlert({ open, onOpenChange, userId, userName }: ResetPasswordAlertProps) {
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setLoading(true);
    try {
      const response = await resetTeamMemberPassword(userId);
      if (response.success) {
        toast.success(`Mot de passe de ${userName} réinitialisé. Nouveau mot de passe : ${response.data?.defaultPassword}`, { duration: 10000 });
        onOpenChange(false);
      } else {
        toast.error(response.error || "Erreur lors de la réinitialisation.");
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
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <KeyRound className="h-5 w-5" />
            Réinitialiser le mot de passe
          </DialogTitle>
          <DialogDescription className="pt-3">
            Le mot de passe de <strong>{userName}</strong> sera remplacé par un mot de passe par défaut.
            Il devra le changer à sa prochaine connexion. Communiquez-lui ce nouveau mot de passe de vive voix ou par SMS.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" disabled={loading} />}>
            Annuler
          </DialogClose>
          <Button variant="default" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Oui, réinitialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
