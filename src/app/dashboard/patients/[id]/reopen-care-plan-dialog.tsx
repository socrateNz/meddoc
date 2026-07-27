"use client";

import { useState } from "react";
import { RefreshCw, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reopenCarePlan } from "@/actions/careplans";
import { toast } from "sonner";

interface ReopenCarePlanDialogProps {
  patientId: string;
  patientName: string;
}

export default function ReopenCarePlanDialog({
  patientId,
  patientName,
}: ReopenCarePlanDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await reopenCarePlan(patientId, title || undefined);

    setLoading(false);
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success("Dossier patient réouvert avec succès pour un nouveau cycle de soins.");
      setOpen(false);
      setTitle("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" className="gap-2 bg-primary hover:bg-primary/90 text-white" />}>
        <FolderOpen className="h-4 w-4" />
        Réouvrir le dossier (Nouveau séjour)
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <RefreshCw className="h-5 w-5" />
            Réouvrir le dossier de {patientName}
          </DialogTitle>
          <DialogDescription>
            Ce patient est actuellement sorti. Réouvrez son dossier pour réadmettre le patient et créer un nouveau plan de soins.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Intitulé du nouveau cycle de soins / motif de réadmission</Label>
            <Input
              id="title"
              type="text"
              placeholder="ex: Réadmission post-opératoire, Nouveaux soins à domicile..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-white">
              {loading ? "Réouverture..." : "Réouvrir & démarrer les soins"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
