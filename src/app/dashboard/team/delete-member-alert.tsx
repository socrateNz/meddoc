"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserX } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { deactivateTeamMember } from "@/actions/team";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface DeleteMemberAlertProps {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DeleteMemberAlert({ userId, userName, open, onOpenChange }: DeleteMemberAlertProps) {
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setLoading(true);
    const result = await deactivateTeamMember(userId);
    setLoading(false);

    if (result.success) {
      toast.success("Membre désactivé avec succès.");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Désactiver ce compte ?</DialogTitle>
          <DialogDescription>
            Êtes-vous sûr de vouloir désactiver le compte de <strong>{userName}</strong> ?
            Cette action bloquera son accès à l'application. Ses données historiques (rendez-vous, tâches) seront conservées.
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" disabled={loading} />}>
            Annuler
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Oui, désactiver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
