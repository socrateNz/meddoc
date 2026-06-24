"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import { createMedicalRecord } from "@/actions/patients";
import { toast } from "sonner";

interface AddRecordDialogProps {
  patientId: string;
}

export default function AddRecordDialog({ patientId }: AddRecordDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const response = await createMedicalRecord({
        patientId,
        title,
        description,
      });

      if (response.success) {
        toast.success("Document médical ajouté avec succès.");
        setOpen(false);
        setTitle("");
        setDescription("");
      } else {
        toast.error(response.error || "Erreur lors de l'ajout.");
      }
    } catch (err: any) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
        <Plus className="h-4 w-4" />
        Ajouter un document
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] bg-card border border-border/40 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Ajouter au dossier</DialogTitle>
          <DialogDescription>
            Consignez une observation médicale ou ajoutez une note de visite.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          <div className="space-y-2">
            <Label htmlFor="title">Titre du document *</Label>
            <Input
              id="title"
              placeholder="Ex: Bilan sanguin juin 2026 / Rapport kiné"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Observations / Détails *</Label>
            <Textarea
              id="description"
              placeholder="Saisissez vos observations détaillées..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="min-w-[100px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ajout...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
