"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText, Loader2 } from "lucide-react";
import { createCareTask } from "@/actions/careplans";
import { toast } from "sonner";

export default function CreateCareTaskDialog({ carePlanId, patientId }: { carePlanId: string, patientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scheduledFor: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.scheduledFor) {
      toast.error("Le titre et la date planifiée sont requis.");
      return;
    }

    setLoading(true);
    const result = await createCareTask({
      carePlanId,
      patientId,
      title: formData.title,
      description: formData.description || undefined,
      scheduledFor: formData.scheduledFor,
    });
    setLoading(false);

    if (result.success) {
      toast.success("Tâche ajoutée avec succès !");
      setOpen(false);
      setFormData({ title: "", description: "", scheduledFor: new Date().toISOString().slice(0, 16) });
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs bg-white/50 dark:bg-slate-900/50">
          <Plus className="h-3.5 w-3.5" />
          Ajouter une tâche
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nouvelle Tâche</DialogTitle>
            <DialogDescription>
              Ajouter une intervention ou une tâche au plan de soins.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Titre de la tâche</Label>
              <Input
                id="title"
                placeholder="Ex: Prise de sang à domicile"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="scheduledFor">Planifiée pour</Label>
              <Input
                id="scheduledFor"
                type="datetime-local"
                value={formData.scheduledFor}
                onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optionnel)</Label>
              <Textarea
                id="description"
                placeholder="Précisions sur le soin..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={loading}
                className="resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
